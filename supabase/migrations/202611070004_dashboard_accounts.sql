-- Dashboard-managed Auth accounts. GoTrue writes run only in the hosting server.
-- This ledger stores intent/recovery state, never a password or admin key.
begin;
alter table public.organizations add column version integer not null default 1;
alter table public.organization_memberships add column display_name text
  check(display_name is null or length(btrim(display_name)) between 1 and 120);
create trigger workforce_version before update on public.organizations
  for each row execute function snr_private.bump_workforce_version();

create function public.hr_workspace_settings() returns jsonb
language plpgsql security definer set search_path='' as $$
declare ctx public.organization_memberships;
begin
  ctx:=snr_private.workforce_context(true);
  return (select jsonb_build_object('name',o.name,'timezone',o.timezone,'version',o.version,
    'display_name',coalesce((select e.display_name from public.employee_profiles e where e.organization_id=ctx.organization_id and e.user_id=ctx.user_id),ctx.display_name))
    from public.organizations o where o.id=ctx.organization_id);
end $$;
create function public.hr_save_workspace_settings(p_version integer,p_name text,p_timezone text,p_display_name text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare ctx public.organization_memberships;saved uuid;
begin
  -- Serialize this actor before acquiring the membership share lock. Otherwise
  -- two tabs editing settings could deadlock while upgrading their own name row.
  perform pg_advisory_xact_lock(hashtextextended('staff-settings:'||auth.uid()::text,0));
  ctx:=snr_private.workforce_context(true);
  if p_name is null or length(btrim(p_name)) not between 1 and 160
    or p_display_name is null or length(btrim(p_display_name)) not between 1 and 120
    or p_timezone is null or not exists(select 1 from pg_catalog.pg_timezone_names where name=p_timezone) then
    raise exception using errcode='PT422',message='invalid_workspace_settings';
  end if;
  update public.organizations set name=btrim(p_name),timezone=p_timezone
    where id=ctx.organization_id and version=p_version returning id into saved;
  if saved is null then raise exception using errcode='PT409',message='record_changed'; end if;
  update public.organization_memberships set display_name=btrim(p_display_name) where organization_id=ctx.organization_id and user_id=ctx.user_id;
  update public.employee_profiles set display_name=btrim(p_display_name) where organization_id=ctx.organization_id and user_id=ctx.user_id;
  perform snr_private.workforce_audit(ctx.organization_id,'workspace.settings.saved','organization',ctx.organization_id);
  return public.hr_workspace_settings();
end $$;
revoke all on function public.hr_workspace_settings() from public,anon;
revoke all on function public.hr_save_workspace_settings(integer,text,text,text) from public,anon;
grant execute on function public.hr_workspace_settings() to authenticated;
grant execute on function public.hr_save_workspace_settings(integer,text,text,text) to authenticated;

create table snr_private.staff_account_operations (
  id uuid primary key,
  organization_id uuid not null references public.organizations(id),
  actor_user_id uuid not null,
  action text not null check(action in ('create','link','credentials')),
  employee_id uuid,
  account_user_id uuid,
  email text not null,
  profile_data jsonb not null default '{}',
  fingerprint text not null check(fingerprint ~ '^[a-f0-9]{64}$'),
  state text not null default 'pending' check(state in ('pending','completed','failed')),
  lease_token uuid not null default gen_random_uuid(),
  lease_until timestamptz not null default clock_timestamp()+interval '90 seconds',
  profile_version integer,
  membership_version integer,
  created_at timestamptz not null default clock_timestamp(),
  finished_at timestamptz,
  foreign key(organization_id,actor_user_id) references public.organization_memberships(organization_id,user_id),
  foreign key(organization_id,employee_id) references public.employee_profiles(organization_id,id)
);
alter table snr_private.staff_account_operations enable row level security;
revoke all on snr_private.staff_account_operations from public,anon,authenticated;
create unique index staff_pending_email on snr_private.staff_account_operations(organization_id,lower(email)) where state='pending';
create unique index staff_pending_profile on snr_private.staff_account_operations(employee_id) where state='pending' and employee_id is not null;
create unique index staff_pending_identity on snr_private.staff_account_operations(account_user_id) where state='pending' and account_user_id is not null;
create unique index staff_pending_number on snr_private.staff_account_operations(organization_id,lower(btrim(profile_data->>'employee_number')))
  where state='pending' and action in ('create','link');

create function snr_private.staff_operation_result(op snr_private.staff_account_operations) returns jsonb
language sql stable set search_path='' as $$
  select jsonb_build_object('operation_id',op.id,'status',op.state,'employee_id',op.employee_id,
    'action',op.action,'email',op.email,'organization_id',op.organization_id,'actor_user_id',op.actor_user_id,
    'lease_token',op.lease_token,'account_user_id',op.account_user_id,
    'profile_version',op.profile_version,'membership_version',op.membership_version)
$$;
revoke all on function snr_private.staff_operation_result(snr_private.staff_account_operations) from public,anon,authenticated;

create function public.hr_begin_staff_account(p_request_id uuid,p_action text,p_employee_id uuid,
  p_version integer,p_membership_version integer,p_email text,p_profile jsonb,p_fingerprint text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare ctx public.organization_memberships; op snr_private.staff_account_operations;
  employee public.employee_profiles; member public.organization_memberships;
  site uuid; department uuid; new_version integer; existing_user uuid;
begin
  ctx:=snr_private.workforce_context(true);
  if p_request_id is null or p_action is null or p_action not in ('create','link','credentials')
    or p_email is null or length(p_email)>254 or btrim(p_email) !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
    or p_fingerprint is null or p_fingerprint !~ '^[a-f0-9]{64}$' then
    raise exception using errcode='PT422',message='invalid_account_request';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('staff-admin:'||ctx.organization_id::text,0));
  select * into op from snr_private.staff_account_operations where id=p_request_id for update;
  if op.id is not null then
    if op.organization_id<>ctx.organization_id or op.actor_user_id<>ctx.user_id then
      raise exception using errcode='PT403',message='workforce_access_denied';
    end if;
    if op.fingerprint<>p_fingerprint or op.action<>p_action then
      raise exception using errcode='PT409',message='operation_changed';
    end if;
    if op.state='failed' then raise exception using errcode='PT409',message='operation_closed'; end if;
    if op.state='completed' then return snr_private.staff_operation_result(op); end if;
    if op.lease_until>clock_timestamp() then raise exception using errcode='PT409',message='operation_in_progress'; end if;
    return snr_private.staff_operation_result(op)||jsonb_build_object('recover_only',true);
  end if;
  if (select count(*) from snr_private.staff_account_operations where organization_id=ctx.organization_id
      and actor_user_id=ctx.user_id and created_at>clock_timestamp()-interval '1 minute')>=12 then
    raise exception using errcode='PT429',message='account_rate_limit';
  end if;
  if exists(select 1 from snr_private.staff_account_operations where organization_id=ctx.organization_id and state='pending'
    and (lower(email)=lower(btrim(p_email)) or (p_employee_id is not null and employee_id=p_employee_id))) then
    raise exception using errcode='PT409',message='pending_account_change';
  end if;
  if p_action in ('create','link') then
    if p_employee_id is not null or p_profile is null or jsonb_typeof(p_profile)<>'object'
      or (p_profile-array['display_name','employee_number','site_id','department_id','role','active'])<>'{}'::jsonb
      or length(btrim(coalesce(p_profile->>'display_name',''))) not between 1 and 120
      or length(btrim(coalesce(p_profile->>'employee_number',''))) not between 1 and 40
      or coalesce(p_profile->>'role','') not in ('employee','supervisor')
      or jsonb_typeof(p_profile->'active') is distinct from 'boolean' then
      raise exception using errcode='PT422',message='invalid_employee';
    end if;
    begin site:=(p_profile->>'site_id')::uuid;department:=(p_profile->>'department_id')::uuid;
      exception when invalid_text_representation then raise exception using errcode='PT422',message='choose_organization_records'; end;
    if not exists(select 1 from public.sites where id=site and organization_id=ctx.organization_id and active)
      or not exists(select 1 from public.departments where id=department and organization_id=ctx.organization_id) then
      raise exception using errcode='PT422',message='choose_organization_records';
    end if;
    if exists(select 1 from public.employee_profiles where organization_id=ctx.organization_id
      and lower(btrim(employee_number))=lower(btrim(p_profile->>'employee_number')))
      or exists(select 1 from snr_private.staff_account_operations where organization_id=ctx.organization_id and state='pending'
        and lower(btrim(profile_data->>'employee_number'))=lower(btrim(p_profile->>'employee_number'))) then
      raise exception using errcode='PT409',message='employee_exists';
    end if;
    select id into existing_user from auth.users where lower(email)=lower(btrim(p_email));
    if p_action='create' and existing_user is not null then
      raise exception using errcode='PT409',message='account_already_exists';
    end if;
    if p_action='link' then
      if existing_user is null then raise exception using errcode='PT422',message='account_not_found'; end if;
      perform pg_advisory_xact_lock(hashtextextended('workforce-account:'||existing_user::text,0));
      if exists(select 1 from auth.users where id=existing_user
          and coalesce(raw_app_meta_data->>'snr_admin_organization','') not in ('',ctx.organization_id::text))
        or exists(select 1 from snr_private.staff_account_operations where account_user_id=existing_user and state='pending') then
        raise exception using errcode='PT409',message='account_unavailable';
      end if;
      select * into member from public.organization_memberships where user_id=existing_user and organization_id=ctx.organization_id for update;
      if existing_user=ctx.user_id or (member.role is not null and member.role not in ('employee','supervisor')) then
        raise exception using errcode='PT403',message='protected_account';
      end if;
      if member.active=false or exists(select 1 from public.organization_memberships where user_id=existing_user and organization_id<>ctx.organization_id) then
        raise exception using errcode='PT409',message='account_unavailable';
      end if;
      if exists(select 1 from public.employee_profiles where organization_id=ctx.organization_id and user_id=existing_user) then
        raise exception using errcode='PT409',message='employee_exists';
      end if;
    end if;
  else
    select * into employee from public.employee_profiles where id=p_employee_id and organization_id=ctx.organization_id for update;
    if employee.id is null then raise exception using errcode='PT404',message='record_unavailable'; end if;
    select * into member from public.organization_memberships where user_id=employee.user_id and organization_id=ctx.organization_id for update;
    if member.role not in ('employee','supervisor') or employee.user_id=ctx.user_id then
      raise exception using errcode='PT403',message='protected_account';
    end if;
    if exists(select 1 from public.organization_memberships where user_id=employee.user_id and organization_id<>ctx.organization_id) then
      raise exception using errcode='PT409',message='account_unavailable';
    end if;
    if exists(select 1 from auth.users where id=employee.user_id
        and coalesce(raw_app_meta_data->>'snr_admin_organization','') not in ('',ctx.organization_id::text)) then
      raise exception using errcode='PT409',message='account_unavailable';
    end if;
    if employee.version is distinct from p_version or member.version is distinct from p_membership_version then
      raise exception using errcode='PT409',message='record_changed';
    end if;
    if exists(select 1 from auth.users where lower(email)=lower(btrim(p_email)) and id<>employee.user_id) then
      raise exception using errcode='PT409',message='account_already_exists';
    end if;
    -- Reserve a new snapshot before the external Auth request; other stale forms fail.
    update public.employee_profiles set display_name=display_name where id=employee.id returning version into new_version;
    p_profile:='{}'::jsonb;
  end if;
  insert into snr_private.staff_account_operations(id,organization_id,actor_user_id,action,employee_id,account_user_id,
    email,profile_data,fingerprint,profile_version,membership_version)
    values(p_request_id,ctx.organization_id,ctx.user_id,p_action,p_employee_id,coalesce(existing_user,employee.user_id),
      btrim(p_email),p_profile,p_fingerprint,new_version,member.version) returning * into op;
  perform snr_private.workforce_audit(ctx.organization_id,'staff.account.requested','account_operation',op.id);
  return snr_private.staff_operation_result(op);
end $$;

create function public.hr_staff_account_context(p_request_id uuid,p_lease_token uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare ctx public.organization_memberships;op snr_private.staff_account_operations;employee public.employee_profiles;member public.organization_memberships;
begin
  ctx:=snr_private.workforce_context(true);
  select * into op from snr_private.staff_account_operations where id=p_request_id and organization_id=ctx.organization_id;
  if op.id is null or op.actor_user_id<>ctx.user_id then raise exception using errcode='PT404',message='record_unavailable'; end if;
  if op.state<>'pending' or op.lease_token<>p_lease_token or op.lease_until<=clock_timestamp() then
    raise exception using errcode='PT409',message='operation_in_progress';
  end if;
  if op.action in ('credentials','link') then
    select * into member from public.organization_memberships where user_id=op.account_user_id and organization_id=ctx.organization_id;
    if (member.role is not null and member.role not in ('employee','supervisor')) or (op.action='credentials' and member.role is null) then
      raise exception using errcode='PT403',message='protected_account'; end if;
    if member.version is distinct from op.membership_version
      or exists(select 1 from public.organization_memberships where user_id=op.account_user_id and organization_id<>ctx.organization_id) then
      raise exception using errcode='PT409',message='record_changed';
    end if;
    if op.action='credentials' then
      select * into employee from public.employee_profiles where id=op.employee_id and organization_id=ctx.organization_id;
      if employee.version is distinct from op.profile_version then raise exception using errcode='PT409',message='record_changed'; end if;
    end if;
  end if;
  return snr_private.staff_operation_result(op);
end $$;

-- Auth app_metadata is writable only by GoTrue admin APIs, never user_metadata.
create function public.hr_complete_staff_account(p_request_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare ctx public.organization_memberships;op snr_private.staff_account_operations;target uuid;profile uuid;member_role text;
begin
  ctx:=snr_private.workforce_context(true);
  select * into op from snr_private.staff_account_operations where id=p_request_id and organization_id=ctx.organization_id for update;
  if op.id is null then raise exception using errcode='PT404',message='record_unavailable'; end if;
  if op.state='completed' then return jsonb_build_object('status','completed','employee_id',op.employee_id); end if;
  if op.state<>'pending' then raise exception using errcode='PT409',message='operation_closed'; end if;
  select id into target from auth.users where
    raw_app_meta_data->>'snr_admin_operation'=op.id::text
    and raw_app_meta_data->>'snr_admin_organization'=op.organization_id::text
    and raw_app_meta_data->>'snr_admin_actor'=op.actor_user_id::text
    and lower(email)=lower(op.email) and email_confirmed_at is not null;
  if target is null or (op.account_user_id is not null and target<>op.account_user_id) then
    raise exception using errcode='PT409',message='account_change_not_confirmed';
  end if;
  if exists(select 1 from public.organization_memberships where user_id=target and organization_id<>ctx.organization_id) then
    raise exception using errcode='PT409',message='account_unavailable';
  end if;
  select role into member_role from public.organization_memberships where organization_id=ctx.organization_id and user_id=target;
  if member_role is not null and member_role not in ('employee','supervisor') then
    raise exception using errcode='PT403',message='protected_account';
  end if;
  if op.action in ('create','link') then
    perform set_config('snr.staff_operation',op.id::text,true);
    profile:=public.hr_save_employee(null,null,null,op.email,op.profile_data->>'display_name',op.profile_data->>'employee_number',
      (op.profile_data->>'site_id')::uuid,(op.profile_data->>'department_id')::uuid,op.profile_data->>'role',(op.profile_data->>'active')::boolean);
    perform set_config('snr.staff_operation','',true);
  else profile:=op.employee_id;
  end if;
  update snr_private.staff_account_operations set state='completed',employee_id=profile,account_user_id=target,finished_at=clock_timestamp() where id=op.id;
  perform snr_private.workforce_audit(ctx.organization_id,'staff.account.completed','account_operation',op.id);
  return jsonb_build_object('status','completed','employee_id',profile);
end $$;

create function public.hr_recover_staff_account(p_request_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare ctx public.organization_memberships;op snr_private.staff_account_operations;
begin
  ctx:=snr_private.workforce_context(true);
  select * into op from snr_private.staff_account_operations where id=p_request_id and organization_id=ctx.organization_id for update;
  if op.id is null then raise exception using errcode='PT404',message='record_unavailable'; end if;
  if op.state<>'pending' then return jsonb_build_object('status',op.state,'employee_id',op.employee_id); end if;
  if exists(select 1 from auth.users where raw_app_meta_data->>'snr_admin_operation'=op.id::text
      and raw_app_meta_data->>'snr_admin_organization'=op.organization_id::text and raw_app_meta_data->>'snr_admin_actor'=op.actor_user_id::text) then
    return public.hr_complete_staff_account(op.id);
  end if;
  if op.lease_until>clock_timestamp() then raise exception using errcode='PT409',message='operation_in_progress'; end if;
  update snr_private.staff_account_operations set state='failed',finished_at=clock_timestamp() where id=op.id;
  perform snr_private.workforce_audit(ctx.organization_id,'staff.account.unconfirmed','account_operation',op.id);
  return jsonb_build_object('status','failed','profile_version',op.profile_version,'membership_version',op.membership_version);
end $$;

create function public.hr_close_staff_account(p_request_id uuid,p_lease_token uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare ctx public.organization_memberships;op snr_private.staff_account_operations;
begin
  ctx:=snr_private.workforce_context(true);
  select * into op from snr_private.staff_account_operations where id=p_request_id and organization_id=ctx.organization_id for update;
  if op.id is null then raise exception using errcode='PT404',message='record_unavailable'; end if;
  if op.state<>'pending' then return jsonb_build_object('status',op.state); end if;
  if op.lease_until>clock_timestamp() and (op.actor_user_id<>ctx.user_id or p_lease_token is distinct from op.lease_token) then
    raise exception using errcode='PT409',message='operation_in_progress';
  end if;
  -- Closing never deletes an Auth account or rolls back credentials already saved.
  update snr_private.staff_account_operations set state='failed',finished_at=clock_timestamp() where id=op.id;
  perform snr_private.workforce_audit(ctx.organization_id,'staff.account.closed','account_operation',op.id);
  return jsonb_build_object('status','failed');
end $$;

create function public.hr_pending_staff_accounts() returns jsonb
language plpgsql security definer set search_path='' as $$
declare ctx public.organization_memberships;
begin
  ctx:=snr_private.workforce_context(true);
  return (select coalesce(jsonb_agg(jsonb_build_object('id',op.id,'email',op.email,'action',op.action,
    'employee_id',op.employee_id,'created_at',op.created_at,'can_close',op.lease_until<=clock_timestamp()) order by op.created_at),'[]'::jsonb)
    from (select * from snr_private.staff_account_operations where organization_id=ctx.organization_id and state='pending'
      order by created_at limit 50) op);
end $$;

create function snr_private.guard_pending_staff_profile() returns trigger
language plpgsql security definer set search_path='' as $$
declare op_id uuid;
begin
  select op.id into op_id from snr_private.staff_account_operations op
    where op.state='pending' and op.organization_id=new.organization_id and (
      op.employee_id=new.id or op.account_user_id=new.user_id
      or (op.action in ('create','link') and lower(btrim(op.profile_data->>'employee_number'))=lower(btrim(new.employee_number)))
      or exists(select 1 from auth.users where id=new.user_id and raw_app_meta_data->>'snr_admin_operation'=op.id::text)
    ) limit 1;
  if op_id is not null and current_setting('snr.staff_operation',true) is distinct from op_id::text then
    raise exception using errcode='PT409',message='pending_account_change';
  end if;
  return new;
end $$;
revoke all on function snr_private.guard_pending_staff_profile() from public,anon,authenticated;
create trigger pending_staff_account before insert or update on public.employee_profiles
  for each row execute function snr_private.guard_pending_staff_profile();

-- Hold account identity/role relationships while GoTrue is in flight. Disabling
-- membership remains available immediately; ordinary browser writes stay denied.
create function snr_private.guard_pending_staff_membership() returns trigger
language plpgsql security definer set search_path='' as $$
declare target uuid;old_target uuid;op_id uuid;
begin
  if tg_op='DELETE' then target:=old.user_id;else target:=new.user_id;end if;
  if tg_op in ('UPDATE','DELETE') then old_target:=old.user_id;end if;
  if tg_op='UPDATE' and new.user_id=old.user_id and new.organization_id=old.organization_id
    and (new.role=old.role or (new.role in ('employee','supervisor') and old.role in ('employee','supervisor'))) then
    return new;
  end if;
  select op.id into op_id from snr_private.staff_account_operations op where op.state='pending' and
    (op.account_user_id in (target,old_target) or exists(select 1 from auth.users u where u.id in (target,old_target) and u.raw_app_meta_data->>'snr_admin_operation'=op.id::text)) limit 1;
  if op_id is not null and current_setting('snr.staff_operation',true) is distinct from op_id::text then
    raise exception using errcode='PT409',message='pending_account_change';
  end if;
  if tg_op='DELETE' then return old;else return new;end if;
end $$;
revoke all on function snr_private.guard_pending_staff_membership() from public,anon,authenticated;
create trigger pending_staff_membership before insert or update or delete on public.organization_memberships
  for each row execute function snr_private.guard_pending_staff_membership();

revoke all on function public.hr_begin_staff_account(uuid,text,uuid,integer,integer,text,jsonb,text) from public,anon;
revoke all on function public.hr_staff_account_context(uuid,uuid) from public,anon;
revoke all on function public.hr_complete_staff_account(uuid) from public,anon;
revoke all on function public.hr_recover_staff_account(uuid) from public,anon;
revoke all on function public.hr_close_staff_account(uuid,uuid) from public,anon;
revoke all on function public.hr_pending_staff_accounts() from public,anon;
grant execute on function public.hr_begin_staff_account(uuid,text,uuid,integer,integer,text,jsonb,text) to authenticated;
grant execute on function public.hr_staff_account_context(uuid,uuid) to authenticated;
grant execute on function public.hr_complete_staff_account(uuid) to authenticated;
grant execute on function public.hr_recover_staff_account(uuid) to authenticated;
grant execute on function public.hr_close_staff_account(uuid,uuid) to authenticated;
grant execute on function public.hr_pending_staff_accounts() to authenticated;

-- Preserve invoker/RLS authorization while supporting an HR display name.
-- Apply after the foundation migration. Read-only authorization, no auto-provisioning.

create or replace function public.current_workspace() returns jsonb
language plpgsql stable security invoker set search_path = '' as $$
declare
  caller uuid := auth.uid();
  assignments bigint;
  membership public.organization_memberships%rowtype;
  organization_name text;
  employee_id uuid;
  employee_name text;
  employee_site uuid;
  team_ids uuid[] := '{}'::uuid[];
  site_ids uuid[] := '{}'::uuid[];
begin
  if caller is null then
    raise exception using errcode = 'PT401', message = 'authentication_required';
  end if;

  -- RLS also enforces user ownership. No caller-provided role/org/user parameters.
  select count(*) into assignments from public.organization_memberships m
    where m.user_id = caller and m.active;
  if assignments = 0 then
    raise exception using errcode = 'PT403', message = 'workspace_not_assigned';
  elsif assignments > 1 then
    raise exception using errcode = 'PT409', message = 'multiple_workspaces_require_selection';
  end if;
  select m.* into strict membership from public.organization_memberships m
    where m.user_id = caller and m.active;
  select o.name into organization_name from public.organizations o
    where o.id = membership.organization_id;
  if organization_name is null then
    raise exception using errcode = 'PT403', message = 'workspace_unavailable';
  end if;

  select e.id, e.display_name, e.site_id into employee_id, employee_name, employee_site
    from public.employee_profiles e where e.organization_id = membership.organization_id
      and e.user_id = caller and e.active;
  if membership.role = 'supervisor' then
    select coalesce(array_agg(distinct s.department_id), '{}'::uuid[]),
      coalesce(array_agg(distinct s.site_id), '{}'::uuid[])
      into team_ids, site_ids from public.supervisor_assignments s
      where s.organization_id = membership.organization_id and s.supervisor_user_id = caller;
  elsif membership.role = 'hr' then
    select coalesce(array_agg(s.id), '{}'::uuid[]) into site_ids from public.sites s
      where s.organization_id = membership.organization_id and s.active;
  elsif membership.role = 'employee' and employee_site is not null then
    site_ids := array[employee_site];
  end if;

  return jsonb_build_object(
    'user_id', caller,
    'organization_id', membership.organization_id,
    'organization_name', organization_name,
    'role', membership.role,
    'employee_id', employee_id,
    'display_name', coalesce(employee_name,membership.display_name),
    'team_ids', team_ids,
    'site_ids', site_ids
  );
end $$;

revoke all on function public.current_workspace() from public, anon;
grant execute on function public.current_workspace() to authenticated;
comment on function public.current_workspace() is
  'Read-only current membership under RLS. No role self-assignment or private workforce mutations.';

commit;
