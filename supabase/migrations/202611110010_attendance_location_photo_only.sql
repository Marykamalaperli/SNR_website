-- Apply once after 0009. New attendance uses location -> photo, without a QR.
-- Existing event/photo/location evidence is never rewritten.
begin;

-- The owner selected one fixed radius for every store, including existing stores.
update snr_private.site_attendance_areas set radius_meters=50,version=version+1,
  updated_at=clock_timestamp() where radius_meters<>50;
alter table snr_private.site_attendance_areas alter column radius_meters set default 50;
alter table snr_private.site_attendance_areas add constraint site_attendance_fixed_radius check(radius_meters=50);
alter table snr_private.attendance_storage_evidence alter column qr_version drop not null;

create or replace function public.hr_save_site_attendance_area(p_site_id uuid,p_version integer,p_latitude double precision,
  p_longitude double precision,p_radius_meters integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare ctx public.organization_memberships;site public.sites;area snr_private.site_attendance_areas;
begin
  ctx:=snr_private.workforce_context(true);
  -- Inactive stores may still need an area to close a pre-existing session.
  select * into site from public.sites where organization_id=ctx.organization_id and id=p_site_id for share;
  if site.id is null then raise exception using errcode='PT404',message='record_unavailable';end if;
  if p_latitude is null or not(p_latitude between -90 and 90) or p_longitude is null
    or not(p_longitude between -180 and 180) or p_radius_meters is null or p_radius_meters<>50 then
    raise exception using errcode='PT422',message='invalid_store_area';end if;
  if p_version is null then
    insert into snr_private.site_attendance_areas(organization_id,site_id,latitude,longitude,radius_meters,updated_by)
      values(ctx.organization_id,site.id,p_latitude,p_longitude,p_radius_meters,ctx.user_id)
      on conflict(organization_id,site_id) do nothing returning * into area;
  else
    update snr_private.site_attendance_areas set latitude=p_latitude,longitude=p_longitude,radius_meters=p_radius_meters,
      version=version+1,updated_at=clock_timestamp(),updated_by=ctx.user_id
      where organization_id=ctx.organization_id and site_id=site.id and version=p_version returning * into area;
  end if;
  if area.site_id is null then raise exception using errcode='PT409',message='record_changed';end if;
  perform snr_private.workforce_audit(ctx.organization_id,'site.attendance_area.saved','site',site.id);
  return jsonb_build_object('site_id',site.id,'version',area.version);
end $$;

-- The map-link overload from 0009 calls this transaction; no QR is provisioned.
create or replace function public.hr_save_attendance_site(p_id uuid,p_version integer,p_name text,p_timezone text,
  p_latitude double precision,p_longitude double precision,p_radius_meters integer,p_area_version integer)
returns uuid language plpgsql security definer set search_path='' as $$
declare saved uuid;
begin
  saved:=public.hr_save_site(p_id,p_version,p_name,p_timezone);
  perform public.hr_save_site_attendance_area(saved,p_area_version,p_latitude,p_longitude,p_radius_meters);
  return saved;
end $$;

create or replace function public.hr_attendance_qr(p_site_id uuid,p_rotate boolean default false,p_version integer default null)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  perform snr_private.workforce_context(true);
  raise exception using errcode='PT409',message='store_qr_disabled';
end $$;
create or replace function public.verify_attendance_qr(p_qr text) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
  perform snr_private.workforce_context(false);
  raise exception using errcode='PT409',message='store_qr_disabled';
end $$;

create or replace function public.hr_site_attendance_area(p_site_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;ctx public.organization_memberships;
begin
  result:=snr_private.hr_site_attendance_area_without_link(p_site_id);
  ctx:=snr_private.workforce_context(true);
  return result||jsonb_build_object('radius_meters',50,'map_url',(select map_url from snr_private.site_attendance_areas
    where organization_id=ctx.organization_id and site_id=p_site_id));
end $$;

create or replace function public.prepare_attendance_photo(p_action jsonb) returns jsonb
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
  -- Optional legacy QR input remains part of exact replay fingerprints, but
  -- is never checked, required or treated as proof for new punches.
  if exists(select 1 from jsonb_object_keys(p_action) k where k not in ('id','employeeId','previousId','type','location','evidence'))
    or jsonb_typeof(p_action->'evidence')<>'object'
    or exists(select 1 from jsonb_object_keys(p_action->'evidence') k where k not in ('qr','photo'))
    or ((p_action->'evidence') ? 'qr' and (jsonb_typeof(p_action#>'{evidence,qr}')<>'string' or length(p_action#>>'{evidence,qr}')>160))
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
        'photo_saved',true,'location_saved',true,'qr_required',false,'storage_saved',true,'replayed',true,
        'qr_verified',(select p.qr_version is not null from snr_private.attendance_storage_evidence p where p.organization_id=ctx.organization_id and p.event_id=existing.event_id))
        from public.attendance_events where organization_id=ctx.organization_id and id=existing.event_id));
    end if;
    if existing.expires_at<stamp then raise exception using errcode='PT409',message='attendance_photo_expired';end if;
    return jsonb_build_object('intent_id',existing.id,'user_id',ctx.user_id,'bucket_id',existing.bucket_id,'object_path',existing.object_path,'sha256',existing.sha256);
  end if;
  perform public.validate_attendance_location(employee,kind,previous,p_action->'location');
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

create or replace function public.record_attendance_storage(p_request_id uuid,p_employee_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare org uuid;ctx public.organization_memberships;intent snr_private.attendance_photo_uploads;receipt jsonb;
  location jsonb;target uuid;
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
      'photo_saved',true,'location_saved',true,'qr_required',false,'storage_saved',true,'replayed',true,
      'qr_verified',(select p.qr_version is not null from snr_private.attendance_storage_evidence p where p.organization_id=org and p.event_id=intent.event_id))
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
  receipt:=snr_private.record_attendance_with_location(intent.payload->>'type',intent.id,
    (intent.payload->>'previousId')::uuid,location,p_employee_id);
  insert into snr_private.attendance_storage_evidence(organization_id,event_id,user_id,bucket_id,object_path,sha256,captured_at,qr_version)
    values(org,(receipt->>'id')::uuid,ctx.user_id,intent.bucket_id,intent.object_path,intent.sha256,
      (intent.payload#>>'{evidence,photo,captured_at}')::timestamptz,null);
  update snr_private.attendance_photo_uploads set event_id=(receipt->>'id')::uuid where id=intent.id;
  return receipt||jsonb_build_object('photo_saved',true,'qr_verified',false,'qr_required',false,'storage_saved',true);
end $$;

create or replace function public.attendance_location_details(p_session_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare ctx public.organization_memberships;result jsonb;kind text;photo jsonb;
begin
  result:=snr_private.attendance_location_details_before_storage(p_session_id);
  ctx:=snr_private.workforce_context(false);
  foreach kind in array array['clock_in','clock_out'] loop
    select jsonb_build_object('bucket_id',p.bucket_id,'object_path',p.object_path,'captured_at',p.captured_at,'qr_verified',p.qr_version is not null,'qr_version',p.qr_version)
      into photo from snr_private.attendance_storage_evidence p join public.attendance_events ev on ev.organization_id=p.organization_id and ev.id=p.event_id
      where p.organization_id=ctx.organization_id and ev.session_id=p_session_id and ev.event_type=kind;
    if photo is not null then result:=jsonb_set(result,array[kind,'photo'],photo);end if;
  end loop;
  return result;
end $$;

-- Client readiness prevents a new frontend from silently using an older QR policy.
create or replace function public.attendance_workspace() returns jsonb
language sql security definer set search_path='' as $$
  select snr_private.attendance_workspace_before_storage()||jsonb_build_object(
    'storage_required',true,'camera_location_policy','location-before-camera-v1',
    'qr_required',false,'attendance_capture_policy','store-50m-photo-v1','attendance_radius_meters',50);
$$;

commit;
