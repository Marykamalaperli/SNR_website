-- Per-punch device location, authorized by the owner and acknowledged by staff.
-- Apply once after 0005. Existing attendance is preserved without invented GPS.
begin;

create table snr_private.attendance_locations (
  organization_id uuid not null,
  event_id uuid not null,
  latitude double precision not null check(latitude between -90 and 90),
  longitude double precision not null check(longitude between -180 and 180),
  accuracy_meters double precision not null check(accuracy_meters>=0 and accuracy_meters<'Infinity'::double precision),
  captured_at timestamptz not null check(isfinite(captured_at)),
  recorded_at timestamptz not null,
  consent_version text not null check(consent_version='attendance-location-v1'),
  primary key(organization_id,event_id),
  foreign key(organization_id,event_id) references public.attendance_events(organization_id,id)
);
alter table snr_private.attendance_locations enable row level security;
revoke all on snr_private.attendance_locations from public,anon,authenticated;
create trigger attendance_location_append_only before update or delete on snr_private.attendance_locations
  for each row execute function snr_private.reject_history_mutation();

-- Preserve the tested normal-punch transaction, but remove direct API access.
alter function public.record_attendance(text,uuid,uuid) set schema snr_private;
alter function snr_private.record_attendance(text,uuid,uuid) rename to record_attendance_without_location;
revoke all on function snr_private.record_attendance_without_location(text,uuid,uuid) from public,anon,authenticated;

-- Old application builds cannot silently bypass the new location requirement.
create function public.record_attendance(p_event_type text,p_request_id uuid,p_previous_event_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare ctx public.organization_memberships;
begin
  ctx:=snr_private.workforce_context(false);
  if ctx.role<>'employee' then raise exception using errcode='PT403',message='workforce_access_denied';end if;
  raise exception using errcode='PT409',message='attendance_location_required';
end $$;

create function public.record_attendance(p_event_type text,p_request_id uuid,p_previous_event_id uuid,
  p_location jsonb,p_employee_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare org uuid;ctx public.organization_memberships;e public.employee_profiles;
  prior public.attendance_events;saved snr_private.attendance_locations;
  lat double precision;lon double precision;accuracy double precision;captured timestamptz;receipt jsonb;
begin
  if auth.uid() is null then raise exception using errcode='PT401',message='authentication_required';end if;
  select organization_id into org from public.organization_memberships where user_id=auth.uid() and active limit 1;
  if org is null then raise exception using errcode='PT403',message='workforce_access_denied';end if;
  perform pg_advisory_xact_lock(hashtextextended('workforce-people:'||org::text,0));
  ctx:=snr_private.workforce_context(false);
  if ctx.role<>'employee' or ctx.organization_id<>org then
    raise exception using errcode='PT403',message='workforce_access_denied';end if;
  select * into e from public.employee_profiles where organization_id=org and user_id=ctx.user_id for share;
  if e.id is null or not e.active then raise exception using errcode='PT403',message='employee_profile_required';end if;
  -- A subject snapshot prevents a pending device fix from being submitted as a
  -- different employee after account changes. Identity is still server-derived.
  if p_employee_id is distinct from e.id then raise exception using errcode='PT409',message='attendance_changed';end if;
  if p_event_type is null or p_event_type not in ('clock_in','clock_out') or p_request_id is null then
    raise exception using errcode='PT422',message='invalid_attendance_action';end if;
  if p_location is null or jsonb_typeof(p_location)<>'object' then
    raise exception using errcode='PT422',message='attendance_location_required';end if;
  if length(p_location::text)>1000
    or not(p_location ?& array['latitude','longitude','accuracy_meters','captured_at','consent_version'])
    or exists(select 1 from jsonb_object_keys(p_location) k where k not in
      ('latitude','longitude','accuracy_meters','captured_at','consent_version'))
    or jsonb_typeof(p_location->'latitude')<>'number' or jsonb_typeof(p_location->'longitude')<>'number'
    or jsonb_typeof(p_location->'accuracy_meters')<>'number' or jsonb_typeof(p_location->'captured_at')<>'string'
    or p_location->>'captured_at' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}([.][0-9]{1,6})?(Z|[+-][0-9]{2}:[0-9]{2})$'
    or p_location->>'consent_version' is distinct from 'attendance-location-v1' then
    raise exception using errcode='PT422',message='invalid_attendance_location';end if;
  begin
    lat:=(p_location->>'latitude')::double precision;
    lon:=(p_location->>'longitude')::double precision;
    accuracy:=(p_location->>'accuracy_meters')::double precision;
    captured:=(p_location->>'captured_at')::timestamptz;
  exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow or numeric_value_out_of_range then
    raise exception using errcode='PT422',message='invalid_attendance_location';
  end;
  if not(lat between -90 and 90) or not(lon between -180 and 180)
    or not(accuracy>=0 and accuracy<'Infinity'::double precision) or not isfinite(captured) then
    raise exception using errcode='PT422',message='invalid_attendance_location';end if;
  select * into prior from public.attendance_events where organization_id=org and employee_id=e.id and idempotency_key=p_request_id;
  if prior.id is not null then
    if prior.event_type<>p_event_type or prior.previous_event_id is distinct from p_previous_event_id then
      raise exception using errcode='PT409',message='attendance_request_changed';end if;
    select * into saved from snr_private.attendance_locations where organization_id=org and event_id=prior.id;
    if saved.event_id is null then raise exception using errcode='PT409',message='legacy_attendance_request';end if;
    if (saved.latitude,saved.longitude,saved.accuracy_meters,saved.captured_at,saved.consent_version)
        is distinct from(lat,lon,accuracy,captured,p_location->>'consent_version') then
      raise exception using errcode='PT409',message='attendance_request_changed';end if;
    -- A late retry returns the original fix/receipt, never a newer location.
    receipt:=snr_private.record_attendance_without_location(p_event_type,p_request_id,p_previous_event_id);
    return receipt||jsonb_build_object('location_saved',true);
  end if;
  if captured<clock_timestamp()-interval '2 minutes' or captured>clock_timestamp()+interval '30 seconds' then
    raise exception using errcode='PT422',message='stale_attendance_location';end if;
  receipt:=snr_private.record_attendance_without_location(p_event_type,p_request_id,p_previous_event_id);
  insert into snr_private.attendance_locations(organization_id,event_id,latitude,longitude,accuracy_meters,captured_at,recorded_at,consent_version)
    values(org,(receipt->>'id')::uuid,lat,lon,accuracy,captured,(receipt->>'occurred_at')::timestamptz,p_location->>'consent_version');
  return receipt||jsonb_build_object('location_saved',true);
end $$;

alter function public.attendance_workspace() set schema snr_private;
alter function snr_private.attendance_workspace() rename to attendance_workspace_without_location;
revoke all on function snr_private.attendance_workspace_without_location() from public,anon,authenticated;
create function public.attendance_workspace() returns jsonb
language plpgsql security definer set search_path='' as $$
begin
  return snr_private.attendance_workspace_without_location()||jsonb_build_object(
    'location_required',true,'location_notice_version','attendance-location-v1');
end $$;

alter function public.attendance_records(date,date,text,uuid,uuid,text,integer) set schema snr_private;
alter function snr_private.attendance_records(date,date,text,uuid,uuid,text,integer) rename to attendance_records_without_location;
revoke all on function snr_private.attendance_records_without_location(date,date,text,uuid,uuid,text,integer) from public,anon,authenticated;
create function public.attendance_records(p_from date,p_to date,p_search text default '',p_site_id uuid default null,
  p_department_id uuid default null,p_status text default 'all',p_page integer default 1)
returns jsonb language plpgsql security definer set search_path='' as $$
declare ctx public.organization_memberships;result jsonb;rows jsonb;
begin
  ctx:=snr_private.workforce_context(false);
  result:=snr_private.attendance_records_without_location(p_from,p_to,p_search,p_site_id,p_department_id,p_status,p_page);
  if ctx.role='supervisor' then return result;end if;
  select coalesce(jsonb_agg(item||jsonb_build_object(
    'clock_in_location_available',exists(select 1 from snr_private.attendance_locations l
      where l.organization_id=ctx.organization_id and l.event_id=(item->>'id')::uuid),
    'clock_out_location_available',exists(select 1 from public.attendance_events ev
      join snr_private.attendance_locations l on l.organization_id=ev.organization_id and l.event_id=ev.id
      where ev.organization_id=ctx.organization_id and ev.session_id=(item->>'id')::uuid and ev.event_type='clock_out'))
    order by n),'[]'::jsonb) into rows from jsonb_array_elements(result->'rows') with ordinality records(item,n);
  return jsonb_set(result,'{rows}',rows);
end $$;

create function public.attendance_location_details(p_session_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare ctx public.organization_memberships;session public.attendance_events;result jsonb;
begin
  ctx:=snr_private.workforce_context(false);
  if ctx.role not in ('hr','employee') then raise exception using errcode='PT403',message='workforce_access_denied';end if;
  select ev.* into session from public.attendance_events ev
    where ev.organization_id=ctx.organization_id and ev.id=p_session_id and ev.event_type='clock_in'
      and snr_private.can_read_attendance(ev.organization_id,ev.employee_id,ev.site_id,ev.department_id);
  if session.id is null then raise exception using errcode='PT404',message='record_unavailable';end if;
  select jsonb_build_object('session_id',session.id,'timezone',session.timezone,
    'clock_in',(select jsonb_build_object('latitude',l.latitude,'longitude',l.longitude,'accuracy_meters',l.accuracy_meters,
      'captured_at',l.captured_at,'recorded_at',l.recorded_at,'event_type','clock_in')
      from snr_private.attendance_locations l where l.organization_id=ctx.organization_id and l.event_id=session.id),
    'clock_out',(select jsonb_build_object('latitude',l.latitude,'longitude',l.longitude,'accuracy_meters',l.accuracy_meters,
      'captured_at',l.captured_at,'recorded_at',l.recorded_at,'event_type','clock_out')
      from public.attendance_events ev join snr_private.attendance_locations l on l.organization_id=ev.organization_id and l.event_id=ev.id
      where ev.organization_id=ctx.organization_id and ev.session_id=session.id and ev.event_type='clock_out')) into result;
  perform snr_private.workforce_audit(ctx.organization_id,'attendance.location.viewed','attendance_session',session.id);
  return result;
end $$;

revoke all on function public.record_attendance(text,uuid,uuid) from public,anon;
revoke all on function public.record_attendance(text,uuid,uuid,jsonb,uuid) from public,anon;
revoke all on function public.attendance_workspace() from public,anon;
revoke all on function public.attendance_records(date,date,text,uuid,uuid,text,integer) from public,anon;
revoke all on function public.attendance_location_details(uuid) from public,anon;
grant execute on function public.record_attendance(text,uuid,uuid) to authenticated;
grant execute on function public.record_attendance(text,uuid,uuid,jsonb,uuid) to authenticated;
grant execute on function public.attendance_workspace() to authenticated;
grant execute on function public.attendance_records(date,date,text,uuid,uuid,text,integer) to authenticated;
grant execute on function public.attendance_location_details(uuid) to authenticated;

commit;
