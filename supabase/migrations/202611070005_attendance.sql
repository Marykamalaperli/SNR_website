-- Dashboard-managed shift assignments and server-timed, append-only attendance.
-- Apply once after migrations 0001-0004. No live migration runs at app startup.
begin;

do $$ begin
  if exists(select 1 from public.attendance_events) then
    raise exception 'Existing attendance needs a reviewed import before applying migration 0005. No records were changed.';
  end if;
end $$;

alter table public.shift_assignments add column version integer not null default 1;
alter table public.shift_assignments add column cancelled boolean not null default false;
alter table public.shift_assignments add constraint shift_assignment_tenant_id unique(organization_id,id);
create trigger workforce_version before update on public.shift_assignments
  for each row execute function snr_private.bump_workforce_version();
create index shift_assignment_employee_dates on public.shift_assignments(organization_id,employee_id,starts_on,ends_on)
  where not cancelled;

alter table public.attendance_events
  add column sequence_no bigint,
  add column previous_event_id uuid,
  add column session_id uuid,
  add column shift_assignment_id uuid,
  add column department_id uuid,
  add column attendance_date date,
  add column timezone text,
  add column scheduled_start timestamptz,
  add column scheduled_end timestamptz,
  add constraint attendance_assignment_fk foreign key(organization_id,shift_assignment_id)
    references public.shift_assignments(organization_id,id),
  add constraint attendance_department_fk foreign key(organization_id,department_id)
    references public.departments(organization_id,id),
  add constraint attendance_previous_fk foreign key(organization_id,previous_event_id)
    references public.attendance_events(organization_id,id),
  add constraint attendance_session_fk foreign key(organization_id,session_id)
    references public.attendance_events(organization_id,id),
  add constraint attendance_normal_snapshot check(event_type='correction' or (
    sequence_no is not null and sequence_no>0 and session_id is not null and shift_assignment_id is not null
    and department_id is not null and attendance_date is not null and timezone is not null
    and scheduled_start is not null and scheduled_end is not null and occurred_at=recorded_at
    and ((event_type='clock_in' and session_id=id) or (event_type='clock_out' and session_id<>id))));
-- Ordinals are employee-local, so scoped direct reads cannot infer other tenants'
-- traffic from gaps in a global identity sequence.
create unique index attendance_employee_sequence on public.attendance_events(organization_id,employee_id,sequence_no)
  where sequence_no is not null;
create unique index attendance_one_checkout on public.attendance_events(organization_id,session_id)
  where event_type='clock_out';
create index attendance_latest on public.attendance_events(organization_id,employee_id,sequence_no desc);
create index attendance_work_date on public.attendance_events(organization_id,attendance_date desc,sequence_no desc)
  where event_type='clock_in';

create function snr_private.can_read_attendance(org uuid, employee uuid, site uuid, department uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.employee_profiles e
    join public.organization_memberships actor on actor.organization_id=e.organization_id
      and actor.user_id=auth.uid() and actor.active
    join public.organization_memberships staff on staff.organization_id=e.organization_id and staff.user_id=e.user_id
    where e.organization_id=org and e.id=employee and (
      actor.role='hr' or (actor.role='employee' and e.user_id=actor.user_id)
      or (actor.role='supervisor' and e.active and staff.active
        and e.site_id=site and e.department_id=department
        and exists(select 1 from public.supervisor_assignments a where a.organization_id=org
          and a.supervisor_user_id=actor.user_id and a.site_id=site and a.department_id=department))
    ))
$$;
revoke all on function snr_private.can_read_attendance(uuid,uuid,uuid,uuid) from public,anon;
grant execute on function snr_private.can_read_attendance(uuid,uuid,uuid,uuid) to authenticated;
drop policy attendance_read on public.attendance_events;
create policy attendance_read on public.attendance_events for select to authenticated
  using(snr_private.can_read_attendance(organization_id,employee_id,site_id,department_id));

-- A private deterministic resolver: tests can check midnight/DST without letting
-- a browser supply a punch timestamp. The public writer always supplies server time.
create function snr_private.attendance_shift(org uuid, employee uuid, at_time timestamptz)
returns jsonb language sql stable security definer set search_path='' as $$
  with candidates as (
    select a.id as assignment_id,s.id as shift_id,s.name,s.site_id,s.timezone,s.starts_at,s.ends_at,
      case when s.ends_at<s.starts_at and (at_time at time zone s.timezone)::time<s.ends_at
        and a.starts_on<=(at_time at time zone s.timezone)::date-1
        and (a.ends_on is null or a.ends_on>=(at_time at time zone s.timezone)::date-1)
        then (at_time at time zone s.timezone)::date-1
        else (at_time at time zone s.timezone)::date end as work_date
    from public.shift_assignments a
    join public.employee_profiles e on e.organization_id=a.organization_id and e.id=a.employee_id
    join public.shifts s on s.organization_id=a.organization_id and s.id=a.shift_id and s.site_id=e.site_id
    where a.organization_id=org and a.employee_id=employee and not a.cancelled
  ), effective as (
    select c.*,(c.work_date+c.starts_at) at time zone c.timezone as scheduled_start,
      (c.work_date+c.ends_at+case when c.ends_at<c.starts_at then interval '1 day' else interval '0' end)
        at time zone c.timezone as scheduled_end
    from candidates c join public.shift_assignments a on a.id=c.assignment_id
    where a.starts_on<=c.work_date and (a.ends_on is null or a.ends_on>=c.work_date)
  )
  select to_jsonb(e) from effective e
  order by (at_time>=e.scheduled_start and at_time<e.scheduled_end) desc,e.work_date,e.scheduled_start
  limit 1
$$;
revoke all on function snr_private.attendance_shift(uuid,uuid,timestamptz) from public,anon,authenticated;

create function public.hr_employee_shifts(p_employee_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare ctx public.organization_memberships;e public.employee_profiles;today date;zone text;
begin
  ctx:=snr_private.workforce_context(true);
  select * into e from public.employee_profiles where organization_id=ctx.organization_id and id=p_employee_id;
  if e.id is null then raise exception using errcode='PT404',message='record_unavailable';end if;
  select timezone into zone from public.sites where id=e.site_id;
  today:=(clock_timestamp() at time zone zone)::date;
  return jsonb_build_object('employee_id',e.id,'employee_version',e.version,'today',today,'timezone',zone,
    'shifts',(select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'name',s.name,'starts_at',s.starts_at,
        'ends_at',s.ends_at,'timezone',s.timezone) order by s.starts_at,s.id),'[]'::jsonb)
      from public.shifts s where s.organization_id=ctx.organization_id and s.site_id=e.site_id),
    'assignments',(select coalesce(jsonb_agg(to_jsonb(plan) order by plan.can_edit desc,
      case when plan.can_edit then plan.starts_on end,plan.starts_on desc,plan.id),'[]'::jsonb)
      from (select a.id,a.version,a.shift_id,s.name,s.timezone,a.starts_on,a.ends_on,a.cancelled,
        (not a.cancelled and (a.ends_on is null or a.ends_on>=today)) as can_edit,
        (not a.cancelled and a.starts_on>=today and not exists(select 1 from public.attendance_events ev
          where ev.organization_id=a.organization_id and ev.shift_assignment_id=a.id)) as can_cancel
        from public.shift_assignments a join public.shifts s on s.organization_id=a.organization_id and s.id=a.shift_id
        where a.organization_id=ctx.organization_id and a.employee_id=e.id
        order by can_edit desc,case when not a.cancelled and (a.ends_on is null or a.ends_on>=today) then a.starts_on end,
          a.starts_on desc,a.id limit 50) plan));
end $$;

create function public.hr_save_employee_shift(p_employee_id uuid,p_employee_version integer,
  p_id uuid,p_version integer,p_shift_id uuid,p_starts_on date,p_ends_on date,p_cancel boolean default false)
returns uuid language plpgsql security definer set search_path='' as $$
declare ctx public.organization_memberships;e public.employee_profiles;s public.shifts;
  old_plan public.shift_assignments;today date;saved uuid;staff public.organization_memberships;
begin
  ctx:=snr_private.workforce_context(true);
  perform pg_advisory_xact_lock(hashtextextended('workforce-people:'||ctx.organization_id::text,0));
  select * into e from public.employee_profiles where id=p_employee_id and organization_id=ctx.organization_id for update;
  if e.id is null then raise exception using errcode='PT404',message='record_unavailable';end if;
  if e.version is distinct from p_employee_version then raise exception using errcode='PT409',message='record_changed';end if;
  select * into staff from public.organization_memberships
    where organization_id=ctx.organization_id and user_id=e.user_id for share;
  if staff.role<>'employee' or not staff.active or not e.active then
    raise exception using errcode='PT403',message='employee_shift_required';end if;
  select * into s from public.shifts where id=p_shift_id and organization_id=ctx.organization_id for share;
  if s.id is null then raise exception using errcode='PT422',message='choose_active_site';end if;
  today:=(clock_timestamp() at time zone s.timezone)::date;
  if p_cancel is null or p_starts_on is null or not isfinite(p_starts_on)
    or (p_ends_on is not null and (not isfinite(p_ends_on) or p_ends_on<p_starts_on)) then
    raise exception using errcode='PT422',message='invalid_shift_dates';end if;
  if p_id is null then
    if p_cancel or s.site_id<>e.site_id or p_starts_on<today or not exists(
      select 1 from public.sites where id=s.site_id and active) then
      raise exception using errcode='PT422',message='invalid_shift_dates';end if;
  else
    select * into old_plan from public.shift_assignments
      where id=p_id and organization_id=ctx.organization_id and employee_id=e.id for update;
    if old_plan.id is null then raise exception using errcode='PT404',message='record_unavailable';end if;
    if old_plan.version is distinct from p_version then raise exception using errcode='PT409',message='record_changed';end if;
    if old_plan.cancelled or (old_plan.ends_on is not null and old_plan.ends_on<today)
      or old_plan.shift_id<>p_shift_id or old_plan.starts_on<>p_starts_on then
      raise exception using errcode='PT409',message='shift_assignment_closed';end if;
    if p_cancel then
      if old_plan.starts_on<today or exists(select 1 from public.attendance_events
          where organization_id=ctx.organization_id and shift_assignment_id=p_id) then
        raise exception using errcode='PT409',message='shift_has_attendance';end if;
    elsif (p_ends_on is not null and p_ends_on<today-1) or exists(select 1 from public.attendance_events
        where organization_id=ctx.organization_id and shift_assignment_id=p_id
          and p_ends_on is not null and attendance_date>p_ends_on) then
      raise exception using errcode='PT409',message='shift_has_attendance';
    end if;
  end if;
  if not p_cancel and exists(select 1 from public.shift_assignments a
      where a.organization_id=ctx.organization_id and a.employee_id=e.id and not a.cancelled
        and (p_id is null or a.id<>p_id)
        and daterange(a.starts_on,a.ends_on,'[]') && daterange(p_starts_on,p_ends_on,'[]')) then
    raise exception using errcode='PT409',message='shift_assignment_overlap';end if;
  if p_id is null then
    insert into public.shift_assignments(organization_id,employee_id,shift_id,starts_on,ends_on)
      values(ctx.organization_id,e.id,p_shift_id,p_starts_on,p_ends_on) returning id into saved;
  else
    update public.shift_assignments set ends_on=p_ends_on,cancelled=p_cancel where id=p_id returning id into saved;
  end if;
  update public.employee_profiles set version=version where id=e.id;
  perform snr_private.workforce_audit(ctx.organization_id,
    case when p_cancel then 'shift_assignment.cancelled' else 'shift_assignment.saved' end,'shift_assignment',saved);
  return saved;
end $$;

create function public.attendance_workspace() returns jsonb
language plpgsql security definer set search_path='' as $$
declare ctx public.organization_memberships;e public.employee_profiles;last_event public.attendance_events;
  result jsonb;zone text;planned jsonb;
begin
  ctx:=snr_private.workforce_context(false);
  select timezone into zone from public.organizations where id=ctx.organization_id;
  result:=jsonb_build_object('role',ctx.role,'timezone',zone,'today',(clock_timestamp() at time zone zone)::date,
    'server_time',clock_timestamp(),
    'sites',(select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'name',s.name) order by s.name,s.id),'[]'::jsonb)
      from public.sites s where s.organization_id=ctx.organization_id and (ctx.role='hr' or exists(
        select 1 from public.supervisor_assignments a where a.organization_id=ctx.organization_id
          and a.supervisor_user_id=ctx.user_id and a.site_id=s.id))),
    'departments',(select coalesce(jsonb_agg(jsonb_build_object('id',d.id,'name',d.name) order by d.name,d.id),'[]'::jsonb)
      from public.departments d where d.organization_id=ctx.organization_id and (ctx.role='hr' or exists(
        select 1 from public.supervisor_assignments a where a.organization_id=ctx.organization_id
          and a.supervisor_user_id=ctx.user_id and a.department_id=d.id))));
  if ctx.role='employee' then
    select * into e from public.employee_profiles where organization_id=ctx.organization_id and user_id=ctx.user_id;
    if e.id is null or not e.active then raise exception using errcode='PT403',message='employee_profile_required';end if;
    select * into last_event from public.attendance_events where organization_id=ctx.organization_id and employee_id=e.id
      and event_type in ('clock_in','clock_out') order by sequence_no desc limit 1;
    planned:=snr_private.attendance_shift(ctx.organization_id,e.id,clock_timestamp());
    zone:=coalesce(case when last_event.event_type='clock_in' then last_event.timezone end,
      planned->>'timezone',last_event.timezone,(select timezone from public.sites where id=e.site_id));
    return result||jsonb_build_object('employee_id',e.id,'timezone',zone,'today',(clock_timestamp() at time zone zone)::date,
      'site_name',(select name from public.sites where id=e.site_id),
      'site_active',(select active from public.sites where id=e.site_id),
      'schedule',(select coalesce(jsonb_agg(to_jsonb(plan) order by plan.current_or_future desc,
        case when plan.current_or_future then plan.starts_on end,plan.starts_on desc,plan.id),'[]'::jsonb)
        from (select a.id,s.name,s.timezone,s.starts_at,s.ends_at,p.name as site_name,a.starts_on,a.ends_on,
            (a.ends_on is null or a.ends_on>=(clock_timestamp() at time zone s.timezone)::date) as current_or_future
          from public.shift_assignments a join public.shifts s on s.organization_id=a.organization_id and s.id=a.shift_id
          join public.sites p on p.organization_id=s.organization_id and p.id=s.site_id
          where a.organization_id=ctx.organization_id and a.employee_id=e.id and not a.cancelled
          order by current_or_future desc,
            case when a.ends_on is null or a.ends_on>=(clock_timestamp() at time zone s.timezone)::date then a.starts_on end,
            a.starts_on desc,a.id limit 50) plan),
      'last_event_id',last_event.id,'last_request_id',last_event.idempotency_key,
      'status',case when last_event.event_type='clock_in' then 'clocked_in' else 'clocked_out' end,
      'open_since',case when last_event.event_type='clock_in' then last_event.occurred_at end,
      'shift',case when last_event.event_type='clock_in' then jsonb_build_object('name',
        (select name from public.shifts where id=last_event.shift_id),'timezone',last_event.timezone,
        'work_date',last_event.attendance_date,'scheduled_start',last_event.scheduled_start,'scheduled_end',last_event.scheduled_end)
        else planned end);
  end if;
  return result;
end $$;

create function public.record_attendance(p_event_type text,p_request_id uuid,p_previous_event_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare org uuid;ctx public.organization_memberships;e public.employee_profiles;
  last_event public.attendance_events;existing public.attendance_events;snapshot jsonb;
  at_time timestamptz;event_id uuid:=gen_random_uuid();session uuid;outcome jsonb;
begin
  if auth.uid() is null then raise exception using errcode='PT401',message='authentication_required';end if;
  -- Match HR profile mutation serialization BEFORE taking the employee's membership
  -- lock. This avoids a profile/membership deadlock with revocation or reassignment.
  select organization_id into org from public.organization_memberships where user_id=auth.uid() and active limit 1;
  if org is null then raise exception using errcode='PT403',message='workforce_access_denied';end if;
  perform pg_advisory_xact_lock(hashtextextended('workforce-people:'||org::text,0));
  ctx:=snr_private.workforce_context(false);
  if ctx.role<>'employee' or ctx.organization_id<>org then raise exception using errcode='PT403',message='workforce_access_denied';end if;
  select * into e from public.employee_profiles where organization_id=org and user_id=ctx.user_id for share;
  if e.id is null or not e.active then raise exception using errcode='PT403',message='employee_profile_required';end if;
  if p_event_type is null or p_event_type not in ('clock_in','clock_out') or p_request_id is null then
    raise exception using errcode='PT422',message='invalid_attendance_action';end if;
  select * into existing from public.attendance_events where organization_id=org and employee_id=e.id and idempotency_key=p_request_id;
  if existing.id is not null then
    if existing.event_type<>p_event_type or existing.previous_event_id is distinct from p_previous_event_id then
      raise exception using errcode='PT409',message='attendance_request_changed';end if;
    return jsonb_build_object('id',existing.id,'event_type',existing.event_type,'occurred_at',existing.occurred_at,'replayed',true);
  end if;
  select * into last_event from public.attendance_events where organization_id=org and employee_id=e.id
    and event_type in ('clock_in','clock_out') order by sequence_no desc limit 1;
  if last_event.id is distinct from p_previous_event_id then
    raise exception using errcode='PT409',message='attendance_changed';end if;
  at_time:=clock_timestamp();
  if last_event.id is not null and at_time<last_event.occurred_at then
    raise exception using errcode='PT409',message='attendance_changed';end if;
  if p_event_type='clock_in' then
    if last_event.event_type='clock_in' then raise exception using errcode='PT409',message='already_clocked_in';end if;
    if not exists(select 1 from public.sites where id=e.site_id and active for share) then
      raise exception using errcode='PT409',message='attendance_site_inactive';end if;
    snapshot:=snr_private.attendance_shift(org,e.id,at_time);
    if snapshot is null then raise exception using errcode='PT409',message='shift_not_assigned';end if;
    snapshot:=snapshot||jsonb_build_object('department_id',e.department_id,'site_id',e.site_id);
    session:=event_id;
  else
    if last_event.id is null or last_event.event_type<>'clock_in' then
      raise exception using errcode='PT409',message='not_clocked_in';end if;
    snapshot:=to_jsonb(last_event)||jsonb_build_object('assignment_id',last_event.shift_assignment_id,'work_date',last_event.attendance_date);
    session:=last_event.session_id;
    if at_time<last_event.occurred_at then raise exception using errcode='PT409',message='attendance_changed';end if;
  end if;
  insert into public.attendance_events(id,sequence_no,organization_id,employee_id,shift_id,site_id,event_type,occurred_at,recorded_at,
    actor_user_id,idempotency_key,previous_event_id,session_id,shift_assignment_id,department_id,attendance_date,timezone,scheduled_start,scheduled_end)
    values(event_id,coalesce(last_event.sequence_no,0)+1,org,e.id,(snapshot->>'shift_id')::uuid,(snapshot->>'site_id')::uuid,p_event_type,at_time,at_time,
      ctx.user_id,p_request_id,p_previous_event_id,session,(snapshot->>'assignment_id')::uuid,
      (snapshot->>'department_id')::uuid,(snapshot->>'work_date')::date,snapshot->>'timezone',
      (snapshot->>'scheduled_start')::timestamptz,(snapshot->>'scheduled_end')::timestamptz);
  perform snr_private.workforce_audit(org,'attendance.'||p_event_type,'attendance_event',event_id);
  outcome:=jsonb_build_object('id',event_id,'event_type',p_event_type,'occurred_at',at_time,'replayed',false);
  return outcome;
end $$;

create function public.attendance_records(p_from date,p_to date,p_search text default '',p_site_id uuid default null,
  p_department_id uuid default null,p_status text default 'all',p_page integer default 1)
returns jsonb language plpgsql security definer set search_path='' as $$
declare ctx public.organization_memberships;result jsonb;
begin
  ctx:=snr_private.workforce_context(false);
  if p_from is null or p_to is null or not isfinite(p_from) or not isfinite(p_to)
    or p_to<p_from or p_to-p_from>30 or p_search is null
    or length(p_search)>80 or p_status is null or p_status not in ('all','open','closed')
    or p_page is null or p_page<1 or p_page>10000 then
    raise exception using errcode='PT422',message='invalid_attendance_filters';end if;
  with permitted as materialized (
    select i.id,e.display_name,e.employee_number,i.attendance_date,i.timezone,i.site_id,i.department_id,
      s.name as site_name,d.name as department_name,sh.name as shift_name,i.scheduled_start,i.scheduled_end,
      i.occurred_at as clock_in,o.occurred_at as clock_out,
      case when o.id is not null then greatest(0,floor(extract(epoch from(o.occurred_at-i.occurred_at))))::bigint end as duration_seconds,
      case when o.id is null then 'open' else 'closed' end as status
    from public.attendance_events i
    join public.employee_profiles e on e.organization_id=i.organization_id and e.id=i.employee_id
    join public.sites s on s.organization_id=i.organization_id and s.id=i.site_id
    join public.departments d on d.organization_id=i.organization_id and d.id=i.department_id
    join public.shifts sh on sh.organization_id=i.organization_id and sh.id=i.shift_id
    left join public.attendance_events o on o.organization_id=i.organization_id and o.session_id=i.id and o.event_type='clock_out'
    where i.organization_id=ctx.organization_id and i.event_type='clock_in'
      and i.attendance_date between p_from and p_to
      and snr_private.can_read_attendance(i.organization_id,i.employee_id,i.site_id,i.department_id)
  ), filtered as materialized (
    select * from permitted p where (p_site_id is null or p.site_id=p_site_id)
      and (p_department_id is null or p.department_id=p_department_id)
      and (p_status='all' or p.status=p_status)
      and (btrim(p_search)='' or strpos(lower(p.display_name),lower(btrim(p_search)))>0
        or strpos(lower(p.employee_number),lower(btrim(p_search)))>0)
  ), page as (select * from filtered order by attendance_date desc,clock_in desc,id limit 20 offset(p_page-1)*20)
  select jsonb_build_object('rows',(select coalesce(jsonb_agg(to_jsonb(p) order by attendance_date desc,clock_in desc,id),'[]'::jsonb) from page p),
    'total',(select count(*) from filtered),'page',p_page,'page_size',20,
    'summary',(select jsonb_build_object('sessions',count(*),'open',count(*) filter(where status='open'),
      'completed_seconds',coalesce(sum(duration_seconds),0)) from filtered)) into result;
  return result;
end $$;

create function snr_private.guard_open_attendance() returns trigger
language plpgsql security definer set search_path='' as $$
declare latest text;target uuid;
begin
  if tg_table_name='employee_profiles' then
    if (new.user_id,new.site_id,new.department_id) is not distinct from(old.user_id,old.site_id,old.department_id) then return new;end if;
    target:=old.id;
  else
    if new.role=old.role or not new.active then return new;end if;
    select id into target from public.employee_profiles where organization_id=old.organization_id and user_id=old.user_id;
  end if;
  select event_type into latest from public.attendance_events where organization_id=old.organization_id and employee_id=target
    and event_type in ('clock_in','clock_out') order by sequence_no desc limit 1;
  if latest='clock_in' then raise exception using errcode='PT409',message='open_attendance_session';end if;
  return new;
end $$;
revoke all on function snr_private.guard_open_attendance() from public,anon,authenticated;
create trigger guard_open_attendance before update on public.employee_profiles
  for each row execute function snr_private.guard_open_attendance();
create trigger guard_open_attendance before update on public.organization_memberships
  for each row execute function snr_private.guard_open_attendance();

revoke all on function public.hr_employee_shifts(uuid) from public,anon;
revoke all on function public.hr_save_employee_shift(uuid,integer,uuid,integer,uuid,date,date,boolean) from public,anon;
revoke all on function public.attendance_workspace() from public,anon;
revoke all on function public.record_attendance(text,uuid,uuid) from public,anon;
revoke all on function public.attendance_records(date,date,text,uuid,uuid,text,integer) from public,anon;
grant execute on function public.hr_employee_shifts(uuid) to authenticated;
grant execute on function public.hr_save_employee_shift(uuid,integer,uuid,integer,uuid,date,date,boolean) to authenticated;
grant execute on function public.attendance_workspace() to authenticated;
grant execute on function public.record_attendance(text,uuid,uuid) to authenticated;
grant execute on function public.attendance_records(date,date,text,uuid,uuid,text,integer) to authenticated;

commit;
