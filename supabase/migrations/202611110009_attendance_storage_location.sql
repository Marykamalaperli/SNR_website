-- Apply after 0008. Old photos and attendance remain immutable and readable.
begin;

alter table snr_private.site_attendance_areas add column map_url text;
create function snr_private.check_store_map_link(value text) returns void
language plpgsql set search_path='' as $$
begin
  if value is not null and value<>'' and (length(value)>4096 or value !~
    '^https://(www[.]google[.]com|google[.]com|maps[.]google[.]com|maps[.]app[.]goo[.]gl|goo[.]gl|maps[.]apple[.]com|www[.]openstreetmap[.]org|openstreetmap[.]org)/') then
    raise exception using errcode='PT422',message='invalid_store_map_link';end if;
end $$;
revoke all on function snr_private.check_store_map_link(text) from public,anon,authenticated;
create function public.hr_save_site_attendance_area(p_site_id uuid,p_version integer,p_latitude double precision,
  p_longitude double precision,p_radius_meters integer,p_map_url text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare ctx public.organization_memberships;result jsonb;
begin
  ctx:=snr_private.workforce_context(true);
  perform snr_private.check_store_map_link(p_map_url);
  result:=public.hr_save_site_attendance_area(p_site_id,p_version,p_latitude,p_longitude,p_radius_meters);
  update snr_private.site_attendance_areas set map_url=nullif(p_map_url,'') where organization_id=ctx.organization_id and site_id=p_site_id;
  return result;
end $$;
create function public.hr_save_attendance_site(p_id uuid,p_version integer,p_name text,p_timezone text,
  p_latitude double precision,p_longitude double precision,p_radius_meters integer,p_area_version integer,p_map_url text)
returns uuid language plpgsql security definer set search_path='' as $$
declare ctx public.organization_memberships;saved uuid;
begin
  ctx:=snr_private.workforce_context(true);
  perform snr_private.check_store_map_link(p_map_url);
  saved:=public.hr_save_attendance_site(p_id,p_version,p_name,p_timezone,p_latitude,p_longitude,p_radius_meters,p_area_version);
  update snr_private.site_attendance_areas set map_url=nullif(p_map_url,'') where organization_id=ctx.organization_id and site_id=saved;
  return saved;
end $$;
alter function public.hr_site_attendance_area(uuid) set schema snr_private;
alter function snr_private.hr_site_attendance_area(uuid) rename to hr_site_attendance_area_without_link;
revoke all on function snr_private.hr_site_attendance_area_without_link(uuid) from public,anon,authenticated;
create function public.hr_site_attendance_area(p_site_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;ctx public.organization_memberships;
begin
  result:=snr_private.hr_site_attendance_area_without_link(p_site_id);
  ctx:=snr_private.workforce_context(true);
  return result||jsonb_build_object('map_url',(select map_url from snr_private.site_attendance_areas
    where organization_id=ctx.organization_id and site_id=p_site_id));
end $$;

-- Called before opening either camera and again at the photo shutter.
create function public.validate_attendance_location(p_employee_id uuid,p_event_type text,p_previous_event_id uuid,p_location jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare org uuid;ctx public.organization_memberships;e public.employee_profiles;last_event public.attendance_events;
  target uuid;area snr_private.site_attendance_areas;lat double precision;lon double precision;accuracy double precision;captured timestamptz;distance double precision;
begin
  select organization_id into org from public.organization_memberships where user_id=auth.uid() and active limit 1;
  if org is null then raise exception using errcode='PT403',message='workforce_access_denied';end if;
  perform pg_advisory_xact_lock(hashtextextended('workforce-people:'||org::text,0));
  ctx:=snr_private.workforce_context(false);
  if ctx.role<>'employee' or ctx.organization_id<>org then raise exception using errcode='PT403',message='workforce_access_denied';end if;
  select * into e from public.employee_profiles where organization_id=org and user_id=ctx.user_id and active for share;
  if e.id is null or e.id is distinct from p_employee_id then raise exception using errcode='PT409',message='attendance_changed';end if;
  if p_event_type is null or p_event_type not in ('clock_in','clock_out') then raise exception using errcode='PT422',message='invalid_attendance_action';end if;
  select * into last_event from public.attendance_events where organization_id=org and employee_id=e.id
    and event_type in ('clock_in','clock_out') order by sequence_no desc limit 1;
  if last_event.id is distinct from p_previous_event_id then raise exception using errcode='PT409',message='attendance_changed';end if;
  if p_event_type='clock_out' and last_event.event_type is distinct from 'clock_in' then raise exception using errcode='PT409',message='not_clocked_in';end if;
  if p_event_type='clock_in' then
    if last_event.event_type='clock_in' then raise exception using errcode='PT409',message='already_clocked_in';end if;
    if not exists(select 1 from public.sites where organization_id=org and id=e.site_id and active) then
      raise exception using errcode='PT409',message='attendance_site_inactive';end if;
    if snr_private.attendance_shift(org,e.id,clock_timestamp()) is null then raise exception using errcode='PT409',message='shift_not_assigned';end if;
  end if;
  if p_location is null or jsonb_typeof(p_location)<>'object' or
    not(p_location ?& array['latitude','longitude','accuracy_meters','captured_at','consent_version']) or
    length(p_location::text)>1000 or
    exists(select 1 from jsonb_object_keys(p_location) k where k not in ('latitude','longitude','accuracy_meters','captured_at','consent_version')) or
    jsonb_typeof(p_location->'latitude')<>'number' or jsonb_typeof(p_location->'longitude')<>'number' or
    jsonb_typeof(p_location->'accuracy_meters')<>'number' or jsonb_typeof(p_location->'captured_at')<>'string' or
    p_location->>'captured_at' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}([.][0-9]{1,6})?(Z|[+-][0-9]{2}:[0-9]{2})$' or
    p_location->>'consent_version' is distinct from 'attendance-location-v1' then
    raise exception using errcode='PT422',message='invalid_attendance_location';end if;
  begin
    lat:=(p_location->>'latitude')::double precision;lon:=(p_location->>'longitude')::double precision;
    accuracy:=(p_location->>'accuracy_meters')::double precision;captured:=(p_location->>'captured_at')::timestamptz;
  exception when others then raise exception using errcode='PT422',message='invalid_attendance_location';end;
  if lat is null or lon is null or accuracy is null or captured is null or not(lat between -90 and 90) or not(lon between -180 and 180)
    or not(accuracy>=0 and accuracy<'Infinity'::double precision) or not isfinite(captured) then
    raise exception using errcode='PT422',message='invalid_attendance_location';end if;
  if captured<clock_timestamp()-interval '30 seconds' or captured>clock_timestamp()+interval '5 seconds' then
    raise exception using errcode='PT422',message='stale_attendance_location';end if;
  target:=case when p_event_type='clock_out' then last_event.site_id else e.site_id end;
  perform 1 from public.sites where organization_id=org and id=target for share;
  select * into area from snr_private.site_attendance_areas where organization_id=org and site_id=target for share;
  if area.site_id is null then raise exception using errcode='PT409',message='store_area_not_configured';end if;
  distance:=snr_private.store_distance_meters(area.latitude,area.longitude,lat,lon);
  if distance>area.radius_meters then raise exception using errcode='PT409',message='outside_store_area';end if;
  if distance+accuracy>area.radius_meters then raise exception using errcode='PT409',message='store_location_uncertain';end if;
  return jsonb_build_object('site_id',target,'site_name',(select name from public.sites where id=target),
    'distance_meters',distance,'radius_meters',area.radius_meters,'checked_at',clock_timestamp());
end $$;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
  values('attendance-clock-in','attendance-clock-in',false,153600,array['image/jpeg']),
        ('attendance-clock-out','attendance-clock-out',false,153600,array['image/jpeg']) on conflict(id) do nothing;
do $$ begin
  if exists(select 1 from storage.buckets where id in ('attendance-clock-in','attendance-clock-out')
    and (public or file_size_limit is distinct from 153600 or allowed_mime_types is distinct from array['image/jpeg'])) then
    raise exception 'Attendance buckets already exist with different privacy or size settings. Review before applying 0009.';
  end if;
end $$;
create table snr_private.attendance_photo_uploads (
  id uuid primary key,
  organization_id uuid not null,
  user_id uuid not null,
  employee_id uuid not null,
  payload jsonb not null,
  fingerprint text not null,
  sha256 text not null,
  byte_size integer not null check(byte_size between 32 and 153600),
  bucket_id text not null check(bucket_id in ('attendance-clock-in','attendance-clock-out')),
  object_path text not null,
  created_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null default clock_timestamp()+interval '2 minutes',
  verified_at timestamptz,
  event_id uuid,
  unique(bucket_id,object_path),
  foreign key(organization_id,employee_id) references public.employee_profiles(organization_id,id),
  foreign key(organization_id,event_id) references public.attendance_events(organization_id,id)
);
alter table snr_private.attendance_photo_uploads enable row level security;
revoke all on snr_private.attendance_photo_uploads from public,anon,authenticated;
create table snr_private.attendance_storage_evidence (
  organization_id uuid not null,event_id uuid not null,user_id uuid not null,
  bucket_id text not null,object_path text not null,sha256 text not null,
  captured_at timestamptz not null,qr_version integer not null,
  primary key(organization_id,event_id),
  unique(bucket_id,object_path),
  foreign key(organization_id,event_id) references public.attendance_events(organization_id,id)
);
alter table snr_private.attendance_storage_evidence enable row level security;
revoke all on snr_private.attendance_storage_evidence from public,anon,authenticated;
create trigger attendance_storage_evidence_append_only before update or delete on snr_private.attendance_storage_evidence
  for each row execute function snr_private.reject_history_mutation();

create function public.prepare_attendance_photo(p_action jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare org uuid;ctx public.organization_memberships;existing snr_private.attendance_photo_uploads;intent snr_private.attendance_photo_uploads;
  request_id uuid;employee uuid;previous uuid;kind text;photo jsonb;jpeg bytea;captured timestamptz;payload jsonb;hash text;fingerprint text;stamp timestamptz:=clock_timestamp();
begin
  select organization_id into org from public.organization_memberships where user_id=auth.uid() and active limit 1;
  if org is null then raise exception using errcode='PT403',message='workforce_access_denied';end if;
  perform pg_advisory_xact_lock(hashtextextended('workforce-people:'||org::text,0));
  ctx:=snr_private.workforce_context(false);
  if ctx.role<>'employee' or ctx.organization_id<>org then raise exception using errcode='PT403',message='workforce_access_denied';end if;
  if p_action is null or jsonb_typeof(p_action)<>'object' or length(p_action::text)>215000 then raise exception using errcode='PT422',message='invalid_attendance_photo';end if;
  begin
    request_id:=(p_action->>'id')::uuid;employee:=(p_action->>'employeeId')::uuid;previous:=(p_action->>'previousId')::uuid;
    kind:=p_action->>'type';photo:=p_action#>'{evidence,photo}';captured:=(photo->>'captured_at')::timestamptz;
    jpeg:=decode(photo->>'jpeg_base64','base64');
  exception when others then raise exception using errcode='PT422',message='invalid_attendance_photo';end;
  if request_id is null or employee is null or kind is null or kind not in ('clock_in','clock_out') or captured is null or not isfinite(captured)
    or jpeg is null or not snr_private.valid_attendance_jpeg(jpeg) or photo->>'consent_version' is distinct from 'attendance-photo-location-v1' then
    raise exception using errcode='PT422',message='invalid_attendance_photo';end if;
  if exists(select 1 from jsonb_object_keys(p_action) k where k not in ('id','employeeId','previousId','type','location','evidence'))
    or jsonb_typeof(p_action->'evidence')<>'object'
    or exists(select 1 from jsonb_object_keys(p_action->'evidence') k where k not in ('qr','photo'))
    or jsonb_typeof(photo)<>'object'
    or exists(select 1 from jsonb_object_keys(photo) k where k not in ('jpeg_base64','captured_at','consent_version'))
    or jsonb_typeof(photo->'captured_at')<>'string' or jsonb_typeof(photo->'jpeg_base64')<>'string' then
    raise exception using errcode='PT422',message='invalid_attendance_photo';end if;
  if not exists(select 1 from public.employee_profiles where organization_id=org and id=employee and user_id=ctx.user_id and active) then
    raise exception using errcode='PT403',message='employee_profile_required';end if;
  hash:=encode(sha256(jpeg),'hex');payload:=(p_action #- '{evidence,photo,jpeg_base64}')||jsonb_build_object('photo_sha256',hash);
  fingerprint:=encode(sha256(convert_to(payload::text,'UTF8')),'hex');
  -- Match normal punch serialization before taking membership locks elsewhere.
  -- workforce_context's read is released at RPC completion; commits recheck it.
  select * into existing from snr_private.attendance_photo_uploads where id=request_id;
  if existing.id is not null then
    if existing.user_id<>ctx.user_id or existing.organization_id<>ctx.organization_id or existing.fingerprint<>fingerprint then
      raise exception using errcode='PT409',message='attendance_request_changed';end if;
    if existing.event_id is not null then
      return jsonb_build_object('receipt',(select jsonb_build_object('id',id,'event_type',event_type,'occurred_at',occurred_at,
        'photo_saved',true,'location_saved',true,'qr_verified',true,'storage_saved',true,'replayed',true)
        from public.attendance_events where organization_id=ctx.organization_id and id=existing.event_id));
    end if;
    if existing.expires_at<stamp then raise exception using errcode='PT409',message='attendance_photo_expired';end if;
    return jsonb_build_object('intent_id',existing.id,'user_id',ctx.user_id,'bucket_id',existing.bucket_id,'object_path',existing.object_path,'sha256',existing.sha256);
  end if;
  perform public.validate_attendance_location(employee,kind,previous,p_action->'location');
  perform public.verify_attendance_qr(p_action#>>'{evidence,qr}');
  if captured<stamp-interval '30 seconds' or captured>stamp+interval '5 seconds' or
    abs(extract(epoch from(captured-(p_action#>>'{location,captured_at}')::timestamptz)))>10 then
    raise exception using errcode='PT422',message='stale_attendance_photo';end if;
  if (select count(*) from snr_private.attendance_photo_uploads where user_id=ctx.user_id and created_at>stamp-interval '1 minute')>=10 then
    raise exception using errcode='PT429',message='attendance_photo_rate_limit';end if;
  insert into snr_private.attendance_photo_uploads(id,organization_id,user_id,employee_id,payload,fingerprint,sha256,byte_size,bucket_id,object_path)
    values(request_id,ctx.organization_id,ctx.user_id,employee,payload,fingerprint,hash,octet_length(jpeg),
      case when kind='clock_in' then 'attendance-clock-in' else 'attendance-clock-out' end,
      ctx.organization_id::text||'/'||ctx.user_id::text||'/'||ctx.user_id::text||'_'||
      to_char(stamp at time zone 'UTC','YYYY-MM-DD_HH24-MI-SS.US')||'_'||request_id::text||'.jpg') returning * into intent;
  return jsonb_build_object('intent_id',intent.id,'user_id',ctx.user_id,'bucket_id',intent.bucket_id,'object_path',intent.object_path,'sha256',intent.sha256);
end $$;

-- Only the server binding can certify an uploaded file's digest. A browser may
-- neither upload these objects nor mark its own bytes verified.
create function public.verify_attendance_photo_upload(p_intent_id uuid,p_sha256 text) returns void
language plpgsql security definer set search_path='' as $$
declare intent snr_private.attendance_photo_uploads;
begin
  select * into intent from snr_private.attendance_photo_uploads where id=p_intent_id for update;
  if intent.id is null or intent.sha256 is distinct from p_sha256 or intent.expires_at<clock_timestamp() then
    raise exception using errcode='PT409',message='attendance_photo_expired';end if;
  if not exists(select 1 from storage.objects where bucket_id=intent.bucket_id and name=intent.object_path
    and (metadata->>'size')::bigint=intent.byte_size and metadata->>'mimetype'='image/jpeg') then
    raise exception using errcode='PT409',message='attendance_photo_not_uploaded';end if;
  update snr_private.attendance_photo_uploads set verified_at=coalesce(verified_at,clock_timestamp()) where id=intent.id;
end $$;
revoke all on function public.verify_attendance_photo_upload(uuid,text) from public,anon,authenticated;
grant execute on function public.verify_attendance_photo_upload(uuid,text) to service_role;

create function public.record_attendance_storage(p_request_id uuid,p_employee_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare org uuid;ctx public.organization_memberships;intent snr_private.attendance_photo_uploads;receipt jsonb;
  q snr_private.site_attendance_qr;location jsonb;check_result jsonb;target uuid;
begin
  select organization_id into org from public.organization_memberships where user_id=auth.uid() and active limit 1;
  if org is null then raise exception using errcode='PT403',message='workforce_access_denied';end if;
  perform pg_advisory_xact_lock(hashtextextended('workforce-people:'||org::text,0));
  ctx:=snr_private.workforce_context(false);
  if ctx.role<>'employee' or ctx.organization_id<>org then raise exception using errcode='PT403',message='workforce_access_denied';end if;
  select * into intent from snr_private.attendance_photo_uploads where id=p_request_id for update;
  if intent.id is null or intent.user_id<>ctx.user_id or intent.organization_id<>org or intent.employee_id is distinct from p_employee_id
    or not exists(select 1 from public.employee_profiles where organization_id=org and id=p_employee_id and user_id=ctx.user_id and active) then
    raise exception using errcode='PT403',message='workforce_access_denied';end if;
  if intent.event_id is not null then
    return (select jsonb_build_object('id',id,'event_type',event_type,'occurred_at',occurred_at,
      'photo_saved',true,'location_saved',true,'qr_verified',true,'storage_saved',true,'replayed',true)
      from public.attendance_events where organization_id=org and id=intent.event_id);
  end if;
  if intent.verified_at is null then raise exception using errcode='PT409',message='attendance_photo_not_uploaded';end if;
  if intent.expires_at<clock_timestamp() then raise exception using errcode='PT409',message='attendance_photo_expired';end if;
  location:=intent.payload->'location';
  -- Recheck against the current store policy immediately before committing.
  -- At this stage a bounded upload may have aged the shutter fix up to 2 minutes;
  -- the existing location writer/trigger independently enforce that limit.
  target:=(select site_id from public.employee_profiles where organization_id=org and id=p_employee_id);
  if intent.payload->>'type'='clock_out' then
    select site_id into target from public.attendance_events where organization_id=org and id=(intent.payload->>'previousId')::uuid;
  end if;
  perform 1 from public.sites where organization_id=org and id=target for share;
  select * into q from snr_private.site_attendance_qr where organization_id=org and site_id=target for share;
  if q.site_id is null or intent.payload#>>'{evidence,qr}' is distinct from 'snr-attendance:v1:'||target::text||':'||q.token::text then
    raise exception using errcode='PT422',message='invalid_attendance_qr';end if;
  receipt:=snr_private.record_attendance_with_location(intent.payload->>'type',intent.id,
    (intent.payload->>'previousId')::uuid,location,p_employee_id);
  insert into snr_private.attendance_storage_evidence(organization_id,event_id,user_id,bucket_id,object_path,sha256,captured_at,qr_version)
    values(org,(receipt->>'id')::uuid,ctx.user_id,intent.bucket_id,intent.object_path,intent.sha256,
      (intent.payload#>>'{evidence,photo,captured_at}')::timestamptz,q.version);
  update snr_private.attendance_photo_uploads set event_id=(receipt->>'id')::uuid where id=intent.id;
  return receipt||jsonb_build_object('photo_saved',true,'qr_verified',true,'storage_saved',true);
end $$;

alter function public.record_attendance(text,uuid,uuid,jsonb,uuid,jsonb) set schema snr_private;
alter function snr_private.record_attendance(text,uuid,uuid,jsonb,uuid,jsonb) rename to record_attendance_database_photo;
revoke all on function snr_private.record_attendance_database_photo(text,uuid,uuid,jsonb,uuid,jsonb) from public,anon,authenticated;
create function public.record_attendance(p_event_type text,p_request_id uuid,p_previous_event_id uuid,p_location jsonb,p_employee_id uuid,p_evidence jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  if exists(select 1 from public.attendance_events ev join public.employee_profiles e on e.organization_id=ev.organization_id and e.id=ev.employee_id
    join snr_private.attendance_evidence p on p.organization_id=ev.organization_id and p.event_id=ev.id
    where e.user_id=auth.uid() and ev.idempotency_key=p_request_id) then
    return snr_private.record_attendance_database_photo(p_event_type,p_request_id,p_previous_event_id,p_location,p_employee_id,p_evidence);
  end if;
  perform snr_private.workforce_context(false);
  raise exception using errcode='PT409',message='attendance_storage_required';
end $$;

create function snr_private.can_read_attendance_photo(bucket text,path text) returns boolean
language plpgsql security definer set search_path='' as $$
declare ctx public.organization_memberships;
begin
  ctx:=snr_private.workforce_context(false);
  if ctx.role not in ('hr','employee') then return false;end if;
  return exists(select 1 from snr_private.attendance_storage_evidence p join public.attendance_events ev
    on ev.organization_id=p.organization_id and ev.id=p.event_id where p.organization_id=ctx.organization_id
    and p.bucket_id=bucket and p.object_path=path and snr_private.can_read_attendance(ev.organization_id,ev.employee_id,ev.site_id,ev.department_id));
exception when sqlstate 'PT401' or sqlstate 'PT403' or sqlstate 'PT409' then return false;
end $$;
revoke all on function snr_private.can_read_attendance_photo(text,text) from public;
grant execute on function snr_private.can_read_attendance_photo(text,text) to anon,authenticated;
create policy attendance_photo_read on storage.objects for select to authenticated using (
  bucket_id in ('attendance-clock-in','attendance-clock-out') and snr_private.can_read_attendance_photo(bucket_id,name));
create policy attendance_photo_read_boundary on storage.objects as restrictive for select to public using (
  bucket_id not in ('attendance-clock-in','attendance-clock-out') or snr_private.can_read_attendance_photo(bucket_id,name));
create policy attendance_photo_no_insert on storage.objects as restrictive for insert to public
  with check(bucket_id not in ('attendance-clock-in','attendance-clock-out'));
create policy attendance_photo_no_update on storage.objects as restrictive for update to public
  using(bucket_id not in ('attendance-clock-in','attendance-clock-out')) with check(bucket_id not in ('attendance-clock-in','attendance-clock-out'));
create policy attendance_photo_no_delete on storage.objects as restrictive for delete to public
  using(bucket_id not in ('attendance-clock-in','attendance-clock-out'));

alter function public.attendance_location_details(uuid) set schema snr_private;
alter function snr_private.attendance_location_details(uuid) rename to attendance_location_details_before_storage;
revoke all on function snr_private.attendance_location_details_before_storage(uuid) from public,anon,authenticated;
create function public.attendance_location_details(p_session_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare ctx public.organization_memberships;result jsonb;kind text;photo jsonb;
begin
  result:=snr_private.attendance_location_details_before_storage(p_session_id);
  ctx:=snr_private.workforce_context(false);
  foreach kind in array array['clock_in','clock_out'] loop
    select jsonb_build_object('bucket_id',p.bucket_id,'object_path',p.object_path,'captured_at',p.captured_at,'qr_verified',true,'qr_version',p.qr_version)
      into photo from snr_private.attendance_storage_evidence p join public.attendance_events ev on ev.organization_id=p.organization_id and ev.id=p.event_id
      where p.organization_id=ctx.organization_id and ev.session_id=p_session_id and ev.event_type=kind;
    if photo is not null then result:=jsonb_set(result,array[kind,'photo'],photo);end if;
  end loop;
  return result;
end $$;
alter function public.attendance_workspace() set schema snr_private;
alter function snr_private.attendance_workspace() rename to attendance_workspace_before_storage;
revoke all on function snr_private.attendance_workspace_before_storage() from public,anon,authenticated;
create function public.attendance_workspace() returns jsonb language sql security definer set search_path='' as $$
  select snr_private.attendance_workspace_before_storage()||jsonb_build_object('storage_required',true,'camera_location_policy','location-before-camera-v1');
$$;

revoke all on function public.hr_save_site_attendance_area(uuid,integer,double precision,double precision,integer,text) from public,anon;
revoke all on function public.hr_save_attendance_site(uuid,integer,text,text,double precision,double precision,integer,integer,text) from public,anon;
revoke all on function public.hr_site_attendance_area(uuid) from public,anon;
revoke all on function public.validate_attendance_location(uuid,text,uuid,jsonb) from public,anon;
revoke all on function public.prepare_attendance_photo(jsonb) from public,anon;
revoke all on function public.record_attendance_storage(uuid,uuid) from public,anon;
revoke all on function public.record_attendance(text,uuid,uuid,jsonb,uuid,jsonb) from public,anon;
revoke all on function public.attendance_location_details(uuid) from public,anon;
revoke all on function public.attendance_workspace() from public,anon;
grant execute on function public.hr_save_site_attendance_area(uuid,integer,double precision,double precision,integer,text) to authenticated;
grant execute on function public.hr_save_attendance_site(uuid,integer,text,text,double precision,double precision,integer,integer,text) to authenticated;
grant execute on function public.hr_site_attendance_area(uuid) to authenticated;
grant execute on function public.validate_attendance_location(uuid,text,uuid,jsonb) to authenticated;
grant execute on function public.prepare_attendance_photo(jsonb) to authenticated;
grant execute on function public.record_attendance_storage(uuid,uuid) to authenticated;
grant execute on function public.record_attendance(text,uuid,uuid,jsonb,uuid,jsonb) to authenticated;
grant execute on function public.attendance_location_details(uuid) to authenticated;
grant execute on function public.attendance_workspace() to authenticated;
commit;
