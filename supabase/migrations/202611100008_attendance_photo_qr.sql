-- Apply once after 0007. No historical photo/location is invented.
begin;

create table snr_private.site_attendance_qr (
  organization_id uuid not null,
  site_id uuid not null,
  token uuid not null default gen_random_uuid(),
  version integer not null default 1,
  primary key(organization_id,site_id),
  foreign key(organization_id,site_id) references public.sites(organization_id,id)
);
alter table snr_private.site_attendance_qr enable row level security;
revoke all on snr_private.site_attendance_qr from public,anon,authenticated;

create function public.hr_attendance_qr(p_site_id uuid,p_rotate boolean default false,p_version integer default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare ctx public.organization_memberships;s public.sites;q snr_private.site_attendance_qr;
begin
  ctx:=snr_private.workforce_context(true);
  select * into s from public.sites where organization_id=ctx.organization_id and id=p_site_id for share;
  if s.id is null then raise exception using errcode='PT404',message='record_unavailable';end if;
  insert into snr_private.site_attendance_qr(organization_id,site_id) values(ctx.organization_id,s.id)
    on conflict do nothing;
  select * into q from snr_private.site_attendance_qr where organization_id=ctx.organization_id and site_id=s.id for update;
  if p_rotate then
    if p_version is distinct from q.version then raise exception using errcode='PT409',message='record_changed';end if;
    update snr_private.site_attendance_qr set token=gen_random_uuid(),version=version+1
      where organization_id=ctx.organization_id and site_id=s.id returning * into q;
    perform snr_private.workforce_audit(ctx.organization_id,'site.attendance_qr.rotated','site',s.id);
  else
    perform snr_private.workforce_audit(ctx.organization_id,'site.attendance_qr.viewed','site',s.id);
  end if;
  return jsonb_build_object('site_id',s.id,'site_name',s.name,'version',q.version,
    'qr','snr-attendance:v1:'||s.id::text||':'||q.token::text);
end $$;

-- Saving site details and the attendance area is one transaction.
create function public.hr_save_attendance_site(p_id uuid,p_version integer,p_name text,p_timezone text,
  p_latitude double precision,p_longitude double precision,p_radius_meters integer,p_area_version integer)
returns uuid language plpgsql security definer set search_path='' as $$
declare saved uuid;
begin
  saved:=public.hr_save_site(p_id,p_version,p_name,p_timezone);
  perform public.hr_save_site_attendance_area(saved,p_area_version,p_latitude,p_longitude,p_radius_meters);
  perform public.hr_attendance_qr(saved);
  return saved;
end $$;

-- This verifies the QR against the server-derived employee/open-session site.
-- Employees cannot fetch their store token from any RPC or ordinary projection.
create function public.verify_attendance_qr(p_qr text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare ctx public.organization_memberships;e public.employee_profiles;last_event public.attendance_events;
  target uuid;q snr_private.site_attendance_qr;
begin
  ctx:=snr_private.workforce_context(false);
  if ctx.role<>'employee' then raise exception using errcode='PT403',message='workforce_access_denied';end if;
  select * into e from public.employee_profiles where organization_id=ctx.organization_id and user_id=ctx.user_id and active;
  if e.id is null then raise exception using errcode='PT403',message='employee_profile_required';end if;
  select * into last_event from public.attendance_events where organization_id=ctx.organization_id and employee_id=e.id
    and event_type in ('clock_in','clock_out') order by sequence_no desc limit 1;
  target:=case when last_event.event_type='clock_in' then last_event.site_id else e.site_id end;
  select * into q from snr_private.site_attendance_qr where organization_id=ctx.organization_id and site_id=target for share;
  if p_qr is null or length(p_qr)>160 or q.site_id is null
    or p_qr is distinct from 'snr-attendance:v1:'||q.site_id::text||':'||q.token::text then
    raise exception using errcode='PT422',message='invalid_attendance_qr';end if;
  return jsonb_build_object('site_id',target,'site_name',(select name from public.sites where id=target));
end $$;

-- Small camera JPEGs live in a private RLS table alongside their punch. No public
-- image bucket or persistent photo URL is created. Maximum image size: 150 KiB.
create function snr_private.valid_attendance_jpeg(image bytea) returns boolean
language plpgsql immutable strict set search_path='' as $$
declare n integer:=octet_length(image);pos integer:=2;marker integer;segment_length integer;
  height integer;width integer;components integer;frame boolean:=false;
begin
  if n not between 32 and 153600 or substring(image from 1 for 3)<>decode('ffd8ff','hex')
    or substring(image from n-1 for 2)<>decode('ffd9','hex') then return false;end if;
  -- Validate JPEG segment boundaries and bounded 8-bit image dimensions, rather
  -- than accepting an arbitrary file with a JPEG prefix. This is media-format
  -- validation, not face recognition or a liveness check.
  while pos+3<n-2 loop
    if get_byte(image,pos)<>255 then return false;end if;
    marker:=get_byte(image,pos+1);
    segment_length:=get_byte(image,pos+2)*256+get_byte(image,pos+3);
    if segment_length<2 or pos+2+segment_length>n-2 then return false;end if;
    if marker=218 then return frame and segment_length>=6 and pos+2+segment_length<n-2;end if;
    if marker in (0,216,217,255) then return false;end if;
    if marker in (192,194) then
      if frame or segment_length<8 or get_byte(image,pos+4)<>8 then return false;end if;
      height:=get_byte(image,pos+5)*256+get_byte(image,pos+6);
      width:=get_byte(image,pos+7)*256+get_byte(image,pos+8);
      components:=get_byte(image,pos+9);
      if width not between 1 and 640 or height not between 1 and 640 or components not in (1,3)
        or segment_length<>8+3*components then return false;end if;
      frame:=true;
    end if;
    pos:=pos+2+segment_length;
  end loop;
  return false;
end $$;
revoke all on function snr_private.valid_attendance_jpeg(bytea) from public,anon,authenticated;

create table snr_private.attendance_evidence (
  organization_id uuid not null,
  event_id uuid not null,
  jpeg bytea not null check(snr_private.valid_attendance_jpeg(jpeg)),
  captured_at timestamptz not null check(isfinite(captured_at)),
  consent_version text not null check(consent_version='attendance-photo-location-v1'),
  qr_text text not null,
  qr_version integer not null,
  primary key(organization_id,event_id),
  foreign key(organization_id,event_id) references public.attendance_events(organization_id,id)
);
alter table snr_private.attendance_evidence enable row level security;
revoke all on snr_private.attendance_evidence from public,anon,authenticated;
create trigger attendance_evidence_append_only before update or delete on snr_private.attendance_evidence
  for each row execute function snr_private.reject_history_mutation();

alter function public.record_attendance(text,uuid,uuid,jsonb,uuid) set schema snr_private;
alter function snr_private.record_attendance(text,uuid,uuid,jsonb,uuid) rename to record_attendance_with_location;
revoke all on function snr_private.record_attendance_with_location(text,uuid,uuid,jsonb,uuid) from public,anon,authenticated;
create function public.record_attendance(p_event_type text,p_request_id uuid,p_previous_event_id uuid,
  p_location jsonb,p_employee_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
  perform snr_private.workforce_context(false);
  raise exception using errcode='PT409',message='attendance_evidence_required';
end $$;

create function public.record_attendance(p_event_type text,p_request_id uuid,p_previous_event_id uuid,
  p_location jsonb,p_employee_id uuid,p_evidence jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare org uuid;ctx public.organization_memberships;e public.employee_profiles;
  prior public.attendance_events;proof snr_private.attendance_evidence;
  q snr_private.site_attendance_qr;last_event public.attendance_events;target uuid;
  photo jsonb;jpeg bytea;captured timestamptz;receipt jsonb;
begin
  if auth.uid() is null then raise exception using errcode='PT401',message='authentication_required';end if;
  select organization_id into org from public.organization_memberships where user_id=auth.uid() and active limit 1;
  if org is null then raise exception using errcode='PT403',message='workforce_access_denied';end if;
  -- Same serialization order as the existing punch and HR profile transactions.
  perform pg_advisory_xact_lock(hashtextextended('workforce-people:'||org::text,0));
  ctx:=snr_private.workforce_context(false);
  if ctx.role<>'employee' or ctx.organization_id<>org then
    raise exception using errcode='PT403',message='workforce_access_denied';end if;
  select * into e from public.employee_profiles where organization_id=org and user_id=ctx.user_id and active for share;
  if e.id is null then raise exception using errcode='PT403',message='employee_profile_required';end if;
  if p_employee_id is distinct from e.id then raise exception using errcode='PT409',message='attendance_changed';end if;
  if p_evidence is null or jsonb_typeof(p_evidence)<>'object' or length(p_evidence::text)>210000
    or not(p_evidence ?& array['qr','photo'])
    or exists(select 1 from jsonb_object_keys(p_evidence) k where k not in ('qr','photo'))
    or jsonb_typeof(p_evidence->'qr')<>'string' or length(p_evidence->>'qr')>160 then
    raise exception using errcode='PT422',message='attendance_evidence_required';end if;
  photo:=p_evidence->'photo';
  if jsonb_typeof(photo)<>'object' or not(photo ?& array['jpeg_base64','captured_at','consent_version'])
    or exists(select 1 from jsonb_object_keys(photo) k where k not in ('jpeg_base64','captured_at','consent_version'))
    or jsonb_typeof(photo->'jpeg_base64')<>'string'
    or length(photo->>'jpeg_base64') not between 8 and 204800
    or photo->>'jpeg_base64' !~ '^[A-Za-z0-9+/]+={0,2}$'
    or photo->>'consent_version' is distinct from 'attendance-photo-location-v1'
    or photo->>'captured_at' is null
    or photo->>'captured_at' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}([.][0-9]{1,6})?(Z|[+-][0-9]{2}:[0-9]{2})$' then
    raise exception using errcode='PT422',message='invalid_attendance_photo';end if;
  begin
    jpeg:=decode(photo->>'jpeg_base64','base64');
    captured:=(photo->>'captured_at')::timestamptz;
  exception when others then
    raise exception using errcode='PT422',message='invalid_attendance_photo';
  end;
  if not snr_private.valid_attendance_jpeg(jpeg) or not isfinite(captured) then
    raise exception using errcode='PT422',message='invalid_attendance_photo';end if;
  select * into prior from public.attendance_events where organization_id=org and employee_id=e.id and idempotency_key=p_request_id;
  if prior.id is not null then
    select * into proof from snr_private.attendance_evidence where organization_id=org and event_id=prior.id;
    if proof.event_id is null or (proof.jpeg,proof.captured_at,proof.qr_text,proof.consent_version)
      is distinct from(jpeg,captured,p_evidence->>'qr',photo->>'consent_version') then
      raise exception using errcode='PT409',message='attendance_request_changed';end if;
    -- A committed exact replay survives QR rotation and photo/GPS expiry.
    receipt:=snr_private.record_attendance_with_location(p_event_type,p_request_id,p_previous_event_id,p_location,p_employee_id);
    return receipt||jsonb_build_object('photo_saved',true,'qr_verified',true);
  end if;
  if captured<clock_timestamp()-interval '2 minutes' or captured>clock_timestamp()+interval '30 seconds' then
    raise exception using errcode='PT422',message='stale_attendance_photo';end if;
  select * into last_event from public.attendance_events where organization_id=org and employee_id=e.id
    and event_type in ('clock_in','clock_out') order by sequence_no desc limit 1;
  target:=case when last_event.event_type='clock_in' then last_event.site_id else e.site_id end;
  -- Site -> QR -> area is also the order used by atomic HR site saves.
  -- Taking the QR lock first could deadlock with a site edit at clock-in.
  perform 1 from public.sites where organization_id=org and id=target for share;
  select * into q from snr_private.site_attendance_qr where organization_id=org and site_id=target for share;
  if q.site_id is null or p_evidence->>'qr' is distinct from 'snr-attendance:v1:'||target::text||':'||q.token::text then
    raise exception using errcode='PT422',message='invalid_attendance_qr';end if;
  receipt:=snr_private.record_attendance_with_location(p_event_type,p_request_id,p_previous_event_id,p_location,p_employee_id);
  insert into snr_private.attendance_evidence(organization_id,event_id,jpeg,captured_at,consent_version,qr_text,qr_version)
    values(org,(receipt->>'id')::uuid,jpeg,captured,photo->>'consent_version',p_evidence->>'qr',q.version);
  return receipt||jsonb_build_object('photo_saved',true,'qr_verified',true);
end $$;

-- Policy readiness gates the new browser flow until the migration is installed.
alter function public.attendance_workspace() set schema snr_private;
alter function snr_private.attendance_workspace() rename to attendance_workspace_without_evidence;
revoke all on function snr_private.attendance_workspace_without_evidence() from public,anon,authenticated;
create function public.attendance_workspace() returns jsonb
language sql security definer set search_path='' as $$
  select snr_private.attendance_workspace_without_evidence()||jsonb_build_object(
    'evidence_required',true,'evidence_notice_version','attendance-photo-location-v1');
$$;

-- The existing reader already enforces employee-self/HR scope and audits access.
alter function public.attendance_location_details(uuid) set schema snr_private;
alter function snr_private.attendance_location_details(uuid) rename to attendance_location_details_without_evidence;
revoke all on function snr_private.attendance_location_details_without_evidence(uuid) from public,anon,authenticated;
create function public.attendance_location_details(p_session_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare ctx public.organization_memberships;result jsonb;kind text;photo jsonb;
begin
  result:=snr_private.attendance_location_details_without_evidence(p_session_id);
  ctx:=snr_private.workforce_context(false);
  foreach kind in array array['clock_in','clock_out'] loop
    select jsonb_build_object('jpeg_base64',replace(encode(p.jpeg,'base64'),E'\n',''),
      'captured_at',p.captured_at,'qr_verified',true,'qr_version',p.qr_version) into photo
      from public.attendance_events ev join snr_private.attendance_evidence p on p.organization_id=ev.organization_id and p.event_id=ev.id
      where ev.organization_id=ctx.organization_id and ev.session_id=p_session_id and ev.event_type=kind;
    if result->kind is not null and result->kind<>'null'::jsonb then
      result:=jsonb_set(result,array[kind,'photo'],coalesce(photo,'null'::jsonb));
    end if;
  end loop;
  return result;
end $$;

revoke all on function public.hr_attendance_qr(uuid,boolean,integer) from public,anon;
revoke all on function public.hr_save_attendance_site(uuid,integer,text,text,double precision,double precision,integer,integer) from public,anon;
revoke all on function public.verify_attendance_qr(text) from public,anon;
revoke all on function public.record_attendance(text,uuid,uuid,jsonb,uuid) from public,anon;
revoke all on function public.record_attendance(text,uuid,uuid,jsonb,uuid,jsonb) from public,anon;
revoke all on function public.attendance_workspace() from public,anon;
revoke all on function public.attendance_location_details(uuid) from public,anon;
grant execute on function public.hr_attendance_qr(uuid,boolean,integer) to authenticated;
grant execute on function public.hr_save_attendance_site(uuid,integer,text,text,double precision,double precision,integer,integer) to authenticated;
grant execute on function public.verify_attendance_qr(text) to authenticated;
grant execute on function public.record_attendance(text,uuid,uuid,jsonb,uuid) to authenticated;
grant execute on function public.record_attendance(text,uuid,uuid,jsonb,uuid,jsonb) to authenticated;
grant execute on function public.attendance_workspace() to authenticated;
grant execute on function public.attendance_location_details(uuid) to authenticated;
commit;
