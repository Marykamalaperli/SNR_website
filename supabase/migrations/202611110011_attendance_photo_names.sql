-- Apply once after 0010. Only future upload reservations use date/name paths.
-- Existing objects, evidence references and pending/replayed reservations stay intact.
begin;

alter table snr_private.attendance_photo_uploads
  add column employee_name text,
  add column filename_timezone text;

create function snr_private.attendance_photo_object_path(p_name text,p_stamp timestamptz,p_timezone text,p_request_id uuid)
returns text language plpgsql stable set search_path='' as $$
declare safe_name text;local_stamp timestamp;
begin
  -- Portable ASCII Storage keys: retain letters/digits, turn separators into '_'.
  -- A fallback handles names containing only non-ASCII characters or punctuation.
  safe_name:=left(btrim(regexp_replace(coalesce(p_name,''),'[^A-Za-z0-9]+','_','g'),'_'),80);
  safe_name:=btrim(safe_name,'_');
  if safe_name='' then safe_name:='Employee';end if;
  local_stamp:=p_stamp at time zone p_timezone;
  return to_char(local_stamp,'YYYY-MM-DD')||'/'||safe_name||'_'||
    to_char(local_stamp,'YYYY-MM-DD_HH24-MI-SS.US')||'_'||p_request_id::text||'.jpg';
end $$;
revoke all on function snr_private.attendance_photo_object_path(text,timestamptz,text,uuid) from public,anon,authenticated;

create or replace function public.prepare_attendance_photo(p_action jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare org uuid;ctx public.organization_memberships;existing snr_private.attendance_photo_uploads;intent snr_private.attendance_photo_uploads;
  request_id uuid;employee uuid;previous uuid;kind text;photo jsonb;jpeg bytea;captured timestamptz;payload jsonb;hash text;fingerprint text;stamp timestamptz:=clock_timestamp();employee_name text;photo_zone text;
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
  select display_name into employee_name from public.employee_profiles
    where organization_id=org and id=employee and user_id=ctx.user_id and active for share;
  if employee_name is null or btrim(employee_name)='' then
    raise exception using errcode='PT409',message='employee_name_required';end if;
  if kind='clock_out' then
    select timezone into photo_zone from public.attendance_events where organization_id=org and id=previous;
  else
    photo_zone:=snr_private.attendance_shift(org,employee,stamp)->>'timezone';
  end if;
  if photo_zone is null then raise exception using errcode='PT409',message='shift_not_assigned';end if;

  if captured<stamp-interval '30 seconds' or captured>stamp+interval '5 seconds' or
    abs(extract(epoch from(captured-(p_action#>>'{location,captured_at}')::timestamptz)))>10 then
    raise exception using errcode='PT422',message='stale_attendance_photo';end if;
  if (select count(*) from snr_private.attendance_photo_uploads where user_id=ctx.user_id and created_at>stamp-interval '1 minute')>=10 then
    raise exception using errcode='PT429',message='attendance_photo_rate_limit';end if;
  insert into snr_private.attendance_photo_uploads(id,organization_id,user_id,employee_id,payload,fingerprint,sha256,byte_size,bucket_id,object_path,employee_name,filename_timezone)
    values(request_id,ctx.organization_id,ctx.user_id,employee,payload,fingerprint,hash,octet_length(jpeg),
      case when kind='clock_in' then 'attendance-clock-in' else 'attendance-clock-out' end,
      snr_private.attendance_photo_object_path(employee_name,stamp,photo_zone,request_id),employee_name,photo_zone) returning * into intent;
  return jsonb_build_object('intent_id',intent.id,'user_id',ctx.user_id,'bucket_id',intent.bucket_id,'object_path',intent.object_path,'sha256',intent.sha256);
end $$;

commit;
