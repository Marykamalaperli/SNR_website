-- Organization setup and staff profiles. Apply after the two existing migrations.
-- All writes are narrow, audited transactions. No browser table-write grants.
begin;

alter table public.sites add column version integer not null default 1;
alter table public.departments add column version integer not null default 1;
alter table public.shifts add column version integer not null default 1;
alter table public.employee_profiles add column version integer not null default 1;
alter table public.organization_memberships add column version integer not null default 1;

create function snr_private.bump_workforce_version() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.version := old.version + 1;
  return new;
end $$;
revoke all on function snr_private.bump_workforce_version() from public, anon, authenticated;
do $$ declare tbl text; begin
  foreach tbl in array array['sites','departments','shifts','employee_profiles','organization_memberships'] loop
    execute format('create trigger workforce_version before update on public.%I for each row execute function snr_private.bump_workforce_version()', tbl);
  end loop;
end $$;

-- Not exposed through PostgREST. A row lock makes revocation serialize with saves.
create function snr_private.workforce_context(hr_required boolean)
returns public.organization_memberships
language plpgsql security definer set search_path = '' as $$
declare context public.organization_memberships; assignments bigint;
begin
  if auth.uid() is null then
    raise exception using errcode='PT401', message='authentication_required';
  end if;
  select count(*) into assignments from public.organization_memberships m
    where m.user_id=auth.uid() and m.active;
  if assignments > 1 then
    raise exception using errcode='PT409', message='multiple_workspaces_require_selection';
  end if;
  select m.* into context from public.organization_memberships m
    where m.user_id=auth.uid() and m.active for share;
  if context.user_id is null or context.role not in ('hr','employee','supervisor')
      or (hr_required and context.role <> 'hr') then
    raise exception using errcode='PT403', message='workforce_access_denied';
  end if;
  return context;
end $$;
revoke all on function snr_private.workforce_context(boolean) from public, anon, authenticated;

create function snr_private.workforce_audit(org uuid, action_name text, kind text, subject uuid)
returns void language sql security definer set search_path = '' as $$
  insert into public.audit_events(organization_id,actor_user_id,action,subject_type,subject_id,request_id)
    values (org,auth.uid(),action_name,kind,subject,gen_random_uuid()::text)
$$;
revoke all on function snr_private.workforce_audit(uuid,text,text,uuid) from public, anon, authenticated;

create function public.hr_organization_setup() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare context public.organization_memberships;
begin
  context := snr_private.workforce_context(true);
  return jsonb_build_object(
    'organization', (select jsonb_build_object('id',o.id,'name',o.name,'timezone',o.timezone)
      from public.organizations o where o.id=context.organization_id),
    'sites', (select coalesce(jsonb_agg(to_jsonb(s) order by s.name,s.id),'[]'::jsonb)
      from public.sites s where s.organization_id=context.organization_id),
    'departments', (select coalesce(jsonb_agg(to_jsonb(d) order by d.name,d.id),'[]'::jsonb)
      from public.departments d where d.organization_id=context.organization_id),
    'shifts', (select coalesce(jsonb_agg(to_jsonb(s) || jsonb_build_object('site_name',p.name)
        order by p.name,s.starts_at,s.id),'[]'::jsonb)
      from public.shifts s join public.sites p on p.organization_id=s.organization_id and p.id=s.site_id
      where s.organization_id=context.organization_id),
    'counts', (select jsonb_build_object('employees',count(*),
        'active_employees',count(*) filter (where e.active and m.active),
        'supervisors',count(*) filter (where m.role='supervisor' and e.active and m.active))
      from public.employee_profiles e join public.organization_memberships m
        on m.organization_id=e.organization_id and m.user_id=e.user_id
      where e.organization_id=context.organization_id)
  );
end $$;

create function public.workforce_directory(p_search text default '', p_site_id uuid default null,
  p_department_id uuid default null, p_status text default 'active', p_page integer default 1)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare context public.organization_memberships; result jsonb;
begin
  context := snr_private.workforce_context(false);
  if p_search is null or length(p_search)>80 or p_status is null
      or p_status not in ('active','inactive','all') or p_page is null or p_page<1 or p_page>10000 then
    raise exception using errcode='PT422', message='invalid_directory_filters';
  end if;
  with permitted as materialized (
    select e.id,e.display_name,e.employee_number,e.site_id,e.department_id,e.version,
      s.name as site_name,d.name as department_name,m.role,(e.active and m.active) as active,
      (e.user_id=context.user_id) as is_self,
      case when context.role='hr' then u.email end as email,
      case when context.role='hr' then m.version end as membership_version
    from public.employee_profiles e
    join public.organization_memberships m on m.organization_id=e.organization_id and m.user_id=e.user_id
    join public.sites s on s.organization_id=e.organization_id and s.id=e.site_id
    join public.departments d on d.organization_id=e.organization_id and d.id=e.department_id
    join auth.users u on u.id=e.user_id
    where e.organization_id=context.organization_id
      and snr_private.can_read_employee(e.organization_id,e.id)
      and (context.role='hr' or (e.active and m.active))
  ), filtered as materialized (
    select * from permitted e
    where (p_site_id is null or e.site_id=p_site_id)
      and (p_department_id is null or e.department_id=p_department_id)
      and (p_status='all' or e.active=(p_status='active'))
      and (btrim(p_search)='' or strpos(lower(e.display_name),lower(btrim(p_search)))>0
        or strpos(lower(e.employee_number),lower(btrim(p_search)))>0)
  ), page as (
    select * from filtered order by lower(display_name),id limit 20 offset (p_page-1)*20
  )
  select jsonb_build_object('rows',(select coalesce(jsonb_agg(to_jsonb(p) order by lower(p.display_name),p.id),'[]'::jsonb) from page p),
    'total',(select count(*) from filtered),'page',p_page,'page_size',20) into result;
  return result;
end $$;

create function public.hr_save_site(p_id uuid,p_version integer,p_name text,p_timezone text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare context public.organization_memberships; saved uuid;
begin
  context := snr_private.workforce_context(true);
  if p_name is null or length(btrim(p_name)) not between 1 and 120
      or p_timezone is null or not exists (select 1 from pg_catalog.pg_timezone_names where name=p_timezone) then
    raise exception using errcode='PT422', message='invalid_site';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('workforce-setup:' || context.organization_id::text,0));
  if exists (select 1 from public.sites s where s.organization_id=context.organization_id
      and lower(btrim(s.name))=lower(btrim(p_name)) and (p_id is null or s.id<>p_id)) then
    raise exception using errcode='PT409', message='site_name_exists';
  end if;
  if p_id is null then
    insert into public.sites(organization_id,name,timezone) values (context.organization_id,btrim(p_name),p_timezone)
      returning id into saved;
  else
    if not exists (select 1 from public.sites where id=p_id and organization_id=context.organization_id) then
      raise exception using errcode='PT404', message='record_unavailable';
    end if;
    update public.sites set name=btrim(p_name),timezone=p_timezone
      where id=p_id and organization_id=context.organization_id and version=p_version returning id into saved;
    if saved is null then raise exception using errcode='PT409', message='record_changed'; end if;
  end if;
  perform snr_private.workforce_audit(context.organization_id,'site.saved','site',saved);
  return saved;
end $$;

create function public.hr_save_department(p_id uuid,p_version integer,p_name text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare context public.organization_memberships; saved uuid;
begin
  context := snr_private.workforce_context(true);
  if p_name is null or length(btrim(p_name)) not between 1 and 120 then
    raise exception using errcode='PT422', message='invalid_department';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('workforce-setup:' || context.organization_id::text,0));
  if exists (select 1 from public.departments d where d.organization_id=context.organization_id
      and lower(btrim(d.name))=lower(btrim(p_name)) and (p_id is null or d.id<>p_id)) then
    raise exception using errcode='PT409', message='department_name_exists';
  end if;
  if p_id is null then
    insert into public.departments(organization_id,name) values (context.organization_id,btrim(p_name)) returning id into saved;
  else
    if not exists (select 1 from public.departments where id=p_id and organization_id=context.organization_id) then
      raise exception using errcode='PT404', message='record_unavailable';
    end if;
    update public.departments set name=btrim(p_name)
      where id=p_id and organization_id=context.organization_id and version=p_version returning id into saved;
    if saved is null then raise exception using errcode='PT409', message='record_changed'; end if;
  end if;
  perform snr_private.workforce_audit(context.organization_id,'department.saved','department',saved);
  return saved;
end $$;

create function public.hr_save_shift(p_id uuid,p_version integer,p_name text,p_site_id uuid,p_starts_at time,p_ends_at time)
returns uuid language plpgsql security definer set search_path = '' as $$
declare context public.organization_memberships; saved uuid; site_timezone text; previous public.shifts;
begin
  context := snr_private.workforce_context(true);
  if p_name is null or length(btrim(p_name)) not between 1 and 120
      or p_starts_at is null or p_ends_at is null or p_starts_at=p_ends_at then
    raise exception using errcode='PT422', message='invalid_shift';
  end if;
  select timezone into site_timezone from public.sites
    where id=p_site_id and organization_id=context.organization_id and active;
  if site_timezone is null then raise exception using errcode='PT422', message='choose_active_site'; end if;
  perform pg_advisory_xact_lock(hashtextextended('workforce-setup:' || context.organization_id::text,0));
  if exists (select 1 from public.shifts s where s.organization_id=context.organization_id and s.site_id=p_site_id
      and lower(btrim(s.name))=lower(btrim(p_name)) and (p_id is null or s.id<>p_id)) then
    raise exception using errcode='PT409', message='shift_name_exists';
  end if;
  if p_id is null then
    insert into public.shifts(organization_id,site_id,name,starts_at,ends_at,timezone)
      values (context.organization_id,p_site_id,btrim(p_name),p_starts_at,p_ends_at,site_timezone) returning id into saved;
  else
    select * into previous from public.shifts where id=p_id and organization_id=context.organization_id for update;
    if previous.id is null then raise exception using errcode='PT404', message='record_unavailable'; end if;
    if previous.version is distinct from p_version then raise exception using errcode='PT409', message='record_changed'; end if;
    if (previous.site_id,previous.starts_at,previous.ends_at,previous.timezone)
        is distinct from (p_site_id,p_starts_at,p_ends_at,site_timezone)
        and (exists(select 1 from public.shift_assignments where organization_id=context.organization_id and shift_id=p_id)
          or exists(select 1 from public.attendance_events where organization_id=context.organization_id and shift_id=p_id)) then
      raise exception using errcode='PT409', message='shift_in_use';
    end if;
    update public.shifts set name=btrim(p_name),site_id=p_site_id,starts_at=p_starts_at,ends_at=p_ends_at,timezone=site_timezone
      where id=p_id and organization_id=context.organization_id returning id into saved;
  end if;
  perform snr_private.workforce_audit(context.organization_id,'shift.saved','shift',saved);
  return saved;
end $$;

-- Links an EXISTING confirmed Auth account. Never creates credentials or HR/owner roles.
create function public.hr_save_employee(p_id uuid,p_version integer,p_membership_version integer,
  p_email text,p_display_name text,p_employee_number text,p_site_id uuid,p_department_id uuid,p_role text,p_active boolean)
returns uuid language plpgsql security definer set search_path = '' as $$
declare context public.organization_memberships; target_user uuid; saved uuid;
  previous public.employee_profiles; membership public.organization_memberships;
begin
  context := snr_private.workforce_context(true);
  if p_display_name is null or length(btrim(p_display_name)) not between 1 and 120
      or p_employee_number is null or length(btrim(p_employee_number)) not between 1 and 40
      or p_role is null or p_role not in ('employee','supervisor') or p_active is null then
    raise exception using errcode='PT422', message='invalid_employee';
  end if;
  if not exists (select 1 from public.sites where id=p_site_id and organization_id=context.organization_id and active)
      or not exists (select 1 from public.departments where id=p_department_id and organization_id=context.organization_id) then
    raise exception using errcode='PT422', message='choose_organization_records';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('workforce-people:' || context.organization_id::text,0));
  if p_id is null then
    if p_email is null or length(p_email)>254 then
      raise exception using errcode='PT422', message='confirmed_account_required';
    end if;
    select id into target_user from auth.users where lower(email)=lower(btrim(p_email)) and email_confirmed_at is not null;
    if target_user is null then raise exception using errcode='PT422', message='confirmed_account_required'; end if;
  else
    select * into previous from public.employee_profiles where id=p_id and organization_id=context.organization_id for update;
    if previous.id is null then raise exception using errcode='PT404', message='record_unavailable'; end if;
    if previous.version is distinct from p_version then raise exception using errcode='PT409', message='record_changed'; end if;
    target_user := previous.user_id;
  end if;
  perform pg_advisory_xact_lock(hashtextextended('workforce-account:' || target_user::text,0));
  if target_user=context.user_id or exists (select 1 from public.organization_memberships
      where user_id=target_user and organization_id<>context.organization_id) then
    raise exception using errcode='PT409', message='account_unavailable';
  end if;
  select * into membership from public.organization_memberships
    where organization_id=context.organization_id and user_id=target_user for update;
  if membership.user_id is not null and membership.role not in ('employee','supervisor') then
    raise exception using errcode='PT403', message='protected_account';
  end if;
  if p_id is not null and membership.version is distinct from p_membership_version then
    raise exception using errcode='PT409', message='record_changed';
  end if;
  -- Re-enabling a previously revoked membership requires an explicit edit, not Add employee.
  if p_id is null and membership.user_id is not null and not membership.active then
    raise exception using errcode='PT409', message='account_unavailable';
  end if;
  if exists (select 1 from public.employee_profiles e where e.organization_id=context.organization_id
      and (p_id is null or e.id<>p_id) and (e.user_id=target_user or lower(btrim(e.employee_number))=lower(btrim(p_employee_number)))) then
    raise exception using errcode='PT409', message='employee_exists';
  end if;
  if (select count(*) from public.supervisor_assignments where organization_id=context.organization_id and supervisor_user_id=target_user)>1 then
    raise exception using errcode='PT409', message='multiple_supervisor_assignments';
  end if;
  if membership.user_id is null then
    insert into public.organization_memberships(organization_id,user_id,role,active)
      values (context.organization_id,target_user,p_role,p_active);
  else
    update public.organization_memberships set role=p_role,active=p_active
      where organization_id=context.organization_id and user_id=target_user;
  end if;
  if p_id is null then
    insert into public.employee_profiles(organization_id,user_id,department_id,site_id,employee_number,display_name,active)
      values (context.organization_id,target_user,p_department_id,p_site_id,btrim(p_employee_number),btrim(p_display_name),p_active)
      returning id into saved;
  else
    update public.employee_profiles set display_name=btrim(p_display_name),employee_number=btrim(p_employee_number),
      department_id=p_department_id,site_id=p_site_id,active=p_active
      where id=p_id and organization_id=context.organization_id returning id into saved;
  end if;
  delete from public.supervisor_assignments where organization_id=context.organization_id and supervisor_user_id=target_user;
  if p_role='supervisor' and p_active then
    insert into public.supervisor_assignments(organization_id,supervisor_user_id,department_id,site_id)
      values (context.organization_id,target_user,p_department_id,p_site_id);
  end if;
  perform snr_private.workforce_audit(context.organization_id,'employee.saved','employee',saved);
  return saved;
end $$;

revoke all on function public.hr_organization_setup() from public, anon;
revoke all on function public.workforce_directory(text,uuid,uuid,text,integer) from public, anon;
revoke all on function public.hr_save_site(uuid,integer,text,text) from public, anon;
revoke all on function public.hr_save_department(uuid,integer,text) from public, anon;
revoke all on function public.hr_save_shift(uuid,integer,text,uuid,time,time) from public, anon;
revoke all on function public.hr_save_employee(uuid,integer,integer,text,text,text,uuid,uuid,text,boolean) from public, anon;
grant execute on function public.hr_organization_setup() to authenticated;
grant execute on function public.workforce_directory(text,uuid,uuid,text,integer) to authenticated;
grant execute on function public.hr_save_site(uuid,integer,text,text) to authenticated;
grant execute on function public.hr_save_department(uuid,integer,text) to authenticated;
grant execute on function public.hr_save_shift(uuid,integer,text,uuid,time,time) to authenticated;
grant execute on function public.hr_save_employee(uuid,integer,integer,text,text,text,uuid,uuid,text,boolean) to authenticated;
commit;
