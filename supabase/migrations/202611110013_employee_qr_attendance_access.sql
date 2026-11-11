-- Personal QR is now an attendance-only bearer credential. Apply after 0012.
-- Only the private Pages gateway may call this RPC; no Auth session is issued.
begin;
create table snr_private.employee_qr_request_limits (
  employee_id uuid primary key references public.employee_profiles(id),
  window_started timestamptz not null default clock_timestamp(),
  requests integer not null default 1
);
alter table snr_private.employee_qr_request_limits enable row level security;
revoke all on snr_private.employee_qr_request_limits from public,anon,authenticated;

create function public.employee_qr_attendance_gateway(p_token text,p_operation text,p_payload jsonb default '{}')
returns jsonb language plpgsql security definer set search_path='' as $$
declare q snr_private.employee_attendance_qr;e public.employee_profiles;org uuid;result jsonb;workspace jsonb;
  original_claims text:=current_setting('request.jwt.claims',true);calls integer;
begin
  if p_token is null or length(p_token)<>36 or p_operation is null or p_operation not in ('context','workspace','location','prepare','commit')
    or p_payload is null or jsonb_typeof(p_payload)<>'object' or length(p_payload::text)>215000 then
    raise exception using errcode='PT403',message='employee_qr_invalid';end if;
  select organization_id into org from snr_private.employee_attendance_qr where token::text=p_token;
  if org is null then raise exception using errcode='PT403',message='employee_qr_invalid';end if;
  -- Match attendance/profile mutation order and serialize token rotation.
  perform pg_advisory_xact_lock(hashtextextended('workforce-people:'||org::text,0));
  select * into q from snr_private.employee_attendance_qr where organization_id=org and token::text=p_token for share;
  if q.employee_id is null then raise exception using errcode='PT403',message='employee_qr_invalid';end if;
  select e1.* into e from public.employee_profiles e1 join public.organization_memberships m
    on m.organization_id=e1.organization_id and m.user_id=e1.user_id
    join auth.users u on u.id=e1.user_id
    where e1.organization_id=org and e1.id=q.employee_id and e1.active and m.active and m.role='employee'
      and u.email_confirmed_at is not null and (to_jsonb(u)->>'deleted_at') is null
      and coalesce((to_jsonb(u)->>'banned_until')::timestamptz,'-infinity'::timestamptz)<=clock_timestamp()
    for share of e1,m;
  if e.id is null then raise exception using errcode='PT403',message='employee_qr_invalid';end if;
  if p_payload ? 'employeeId' and p_payload->>'employeeId' is distinct from e.id::text then
    raise exception using errcode='PT403',message='employee_qr_invalid';end if;
  insert into snr_private.employee_qr_request_limits(employee_id) values(e.id)
    on conflict(employee_id) do update set
      requests=case when employee_qr_request_limits.window_started<clock_timestamp()-interval '1 minute' then 1 else employee_qr_request_limits.requests+1 end,
      window_started=case when employee_qr_request_limits.window_started<clock_timestamp()-interval '1 minute' then clock_timestamp() else employee_qr_request_limits.window_started end
    returning requests into calls;
  if calls>180 then raise exception using errcode='PT429',message='attendance_photo_rate_limit';end if;
  -- Transaction-local identity is confined to this allowlisted attendance operation.
  -- Never return tokens, change Auth accounts, or expose arbitrary RPC dispatch.
  perform set_config('request.jwt.claims',jsonb_build_object('sub',e.user_id,'role','authenticated')::text,true);
  perform snr_private.check_employee_attendance_qr(p_token,e.id);
  case p_operation
    when 'context' then result:=jsonb_build_object('user_id',e.user_id,'employee_id',e.id);
    when 'workspace' then
      workspace:=public.attendance_workspace();
      select jsonb_object_agg(key,value) into result from jsonb_each(workspace) where key=any(array[
        'employee_id','status','last_event_id','open_since','shift','site_name','site_active','timezone',
        'location_required','location_notice_version','store_geofence_required','store_geofence_policy',
        'attendance_area','evidence_required','evidence_notice_version','storage_required','camera_location_policy',
        'qr_required','attendance_capture_policy','attendance_radius_meters']);
      result:=result||jsonb_build_object('display_name',e.display_name,'employee_qr_verified',true);
    when 'location' then
      result:=public.validate_employee_qr_location(p_token,e.id,p_payload->>'type',(p_payload->>'previousId')::uuid,p_payload->'location');
    when 'prepare' then
      if p_payload->>'employeeId' is distinct from e.id::text or p_payload#>>'{evidence,qr}' is distinct from p_token then
        raise exception using errcode='PT403',message='employee_qr_invalid';end if;
      result:=public.prepare_attendance_photo(p_payload);
    when 'commit' then
      if not exists(select 1 from snr_private.attendance_photo_uploads where id=(p_payload->>'id')::uuid
        and organization_id=org and employee_id=e.id and user_id=e.user_id and payload#>>'{evidence,qr}'=p_token) then
        raise exception using errcode='PT403',message='employee_qr_invalid';end if;
      result:=public.record_attendance_storage((p_payload->>'id')::uuid,e.id);
  end case;
  perform set_config('request.jwt.claims',coalesce(original_claims,''),true);
  return result;
exception when others then
  perform set_config('request.jwt.claims',coalesce(original_claims,''),true);
  raise;
end $$;
revoke all on function public.employee_qr_attendance_gateway(text,text,jsonb) from public,anon,authenticated;
grant execute on function public.employee_qr_attendance_gateway(text,text,jsonb) to service_role;
commit;
