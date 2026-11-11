-- Personal QR links are authenticated employee shortcuts, never sign-in credentials.
-- Keep store QR disabled and preserve all earlier evidence and committed retries.
begin;
create table snr_private.employee_attendance_qr (
  organization_id uuid not null,
  employee_id uuid primary key,
  token uuid not null unique default gen_random_uuid(),
  version integer not null default 1 check(version>0),
  updated_at timestamptz not null default clock_timestamp(),
  foreign key(organization_id,employee_id) references public.employee_profiles(organization_id,id)
);
alter table snr_private.employee_attendance_qr enable row level security;
revoke all on snr_private.employee_attendance_qr from public,anon,authenticated;
alter table snr_private.attendance_storage_evidence add column employee_qr_version integer;

-- Preserve the existing people -> membership -> QR lock order, including
-- preflight/read RPCs that otherwise could deadlock with HR access revocation.
create function snr_private.employee_qr_context(p_hr_required boolean) returns public.organization_memberships
language plpgsql security definer set search_path='' as $$
declare org uuid;ctx public.organization_memberships;
begin
  select organization_id into org from public.organization_memberships where user_id=auth.uid() and active limit 1;
  if org is null then raise exception using errcode='PT403',message='workforce_access_denied';end if;
  perform pg_advisory_xact_lock(hashtextextended('workforce-people:'||org::text,0));
  ctx:=snr_private.workforce_context(p_hr_required);
  if ctx.organization_id<>org then raise exception using errcode='PT403',message='workforce_access_denied';end if;
  return ctx;
end $$;
revoke all on function snr_private.employee_qr_context(boolean) from public,anon,authenticated;

create function public.hr_employee_attendance_qr(p_employee_id uuid,p_rotate boolean default false,p_version integer default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare ctx public.organization_memberships;e public.employee_profiles;q snr_private.employee_attendance_qr;
begin
  ctx:=snr_private.employee_qr_context(true);
  select * into e from public.employee_profiles where organization_id=ctx.organization_id and id=p_employee_id and active for share;
  if e.id is null or not exists(select 1 from public.organization_memberships where organization_id=ctx.organization_id
    and user_id=e.user_id and active and role='employee') then
    raise exception using errcode='PT404',message='record_unavailable';end if;
  insert into snr_private.employee_attendance_qr(organization_id,employee_id) values(ctx.organization_id,e.id)
    on conflict(employee_id) do nothing;
  select * into q from snr_private.employee_attendance_qr where employee_id=e.id for update;
  if p_rotate then
    if p_version is distinct from q.version then raise exception using errcode='PT409',message='record_changed';end if;
    update snr_private.employee_attendance_qr set token=gen_random_uuid(),version=version+1,updated_at=clock_timestamp()
      where employee_id=e.id returning * into q;
    perform snr_private.workforce_audit(ctx.organization_id,'employee.attendance_qr.regenerated','employee',e.id);
  else
    perform snr_private.workforce_audit(ctx.organization_id,'employee.attendance_qr.issued','employee',e.id);
  end if;
  return jsonb_build_object('employee_id',e.id,'display_name',e.display_name,'version',q.version,'token',q.token);
end $$;

-- Called only by authenticated public wrappers. Possession never selects a user.
create function snr_private.check_employee_attendance_qr(p_token text,p_employee_id uuid) returns integer
language plpgsql security definer set search_path='' as $$
declare ctx public.organization_memberships;q snr_private.employee_attendance_qr;
begin
  ctx:=snr_private.employee_qr_context(false);
  if ctx.role<>'employee' then raise exception using errcode='PT403',message='workforce_access_denied';end if;
  select q1.* into q from snr_private.employee_attendance_qr q1 join public.employee_profiles e
    on e.organization_id=q1.organization_id and e.id=q1.employee_id
    where q1.organization_id=ctx.organization_id and e.user_id=ctx.user_id and e.active
      and (p_employee_id is null or e.id=p_employee_id) and q1.token::text=p_token for share of q1;
  if q.employee_id is null then raise exception using errcode='PT403',message='employee_qr_invalid';end if;
  return q.version;
end $$;

create function public.employee_qr_attendance_workspace(p_token text) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
  perform snr_private.check_employee_attendance_qr(p_token,null);
  return public.attendance_workspace()||jsonb_build_object('employee_qr_verified',true);
end $$;

create function public.validate_employee_qr_location(p_token text,p_employee_id uuid,p_event_type text,p_previous_event_id uuid,p_location jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  perform snr_private.check_employee_attendance_qr(p_token,p_employee_id);
  return public.validate_attendance_location(p_employee_id,p_event_type,p_previous_event_id,p_location);
end $$;

-- New dashboard account creation/linking issues the QR in the same DB transaction.
alter function public.hr_complete_staff_account(uuid) set schema snr_private;
alter function snr_private.hr_complete_staff_account(uuid) rename to complete_staff_before_employee_qr;
create function public.hr_complete_staff_account(p_request_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;employee uuid;
begin
  perform snr_private.employee_qr_context(true);
  result:=snr_private.complete_staff_before_employee_qr(p_request_id);
  employee:=(result->>'employee_id')::uuid;
  if exists(select 1 from public.employee_profiles e join public.organization_memberships m
    on m.organization_id=e.organization_id and m.user_id=e.user_id
    where e.id=employee and e.active and m.active and m.role='employee') then
    -- Do not rotate an existing QR on recovery or credential edits.
    if not exists(select 1 from snr_private.employee_attendance_qr where employee_id=employee) then
      perform public.hr_employee_attendance_qr(employee);
    end if;
  end if;
  return result;
end $$;

alter function public.prepare_attendance_photo(jsonb) set schema snr_private;
alter function snr_private.prepare_attendance_photo(jsonb) rename to prepare_photo_before_employee_qr;
create function public.prepare_attendance_photo(p_action jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare org uuid;intent snr_private.attendance_photo_uploads;result jsonb;
begin
  org:=(snr_private.employee_qr_context(false)).organization_id;
  select * into intent from snr_private.attendance_photo_uploads where id=(p_action->>'id')::uuid;
  -- Completed exact retries remain recoverable after rotation. The original
  -- preparer still checks identity, fingerprint and employee ownership.
  if p_action#>>'{evidence,qr}' is not null and intent.event_id is null then
    perform snr_private.check_employee_attendance_qr(p_action#>>'{evidence,qr}',(p_action->>'employeeId')::uuid);
  end if;
  result:=snr_private.prepare_photo_before_employee_qr(p_action);
  if result ? 'receipt' then
    result:=jsonb_set(result,'{receipt,employee_qr_verified}',to_jsonb(coalesce((select employee_qr_version is not null
      from snr_private.attendance_storage_evidence where organization_id=org and event_id=(result#>>'{receipt,id}')::uuid),false)));
  end if;
  return result;
end $$;

alter function public.record_attendance_storage(uuid,uuid) set schema snr_private;
alter function snr_private.record_attendance_storage(uuid,uuid) rename to record_storage_before_employee_qr;
create function public.record_attendance_storage(p_request_id uuid,p_employee_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare org uuid;intent snr_private.attendance_photo_uploads;receipt jsonb;
begin
  org:=(snr_private.employee_qr_context(false)).organization_id;
  select * into intent from snr_private.attendance_photo_uploads where id=p_request_id;
  if intent.event_id is null and intent.payload#>>'{evidence,qr}' is not null then
    perform snr_private.check_employee_attendance_qr(intent.payload#>>'{evidence,qr}',p_employee_id);
  end if;
  receipt:=snr_private.record_storage_before_employee_qr(p_request_id,p_employee_id);
  -- The insert trigger stamps the checked personal QR version without mutating history.
  return receipt||jsonb_build_object('employee_qr_verified',coalesce((select employee_qr_version is not null
    from snr_private.attendance_storage_evidence where organization_id=org and event_id=(receipt->>'id')::uuid),false));
end $$;

-- Append-only evidence: inject the checked personal version at creation, never UPDATE.
create function snr_private.stamp_employee_qr_evidence() returns trigger
language plpgsql security definer set search_path='' as $$
declare intent snr_private.attendance_photo_uploads;
begin
  select * into intent from snr_private.attendance_photo_uploads where organization_id=new.organization_id
    and bucket_id=new.bucket_id and object_path=new.object_path;
  if intent.payload#>>'{evidence,qr}' is not null then
    new.employee_qr_version:=snr_private.check_employee_attendance_qr(intent.payload#>>'{evidence,qr}',intent.employee_id);
  end if;
  return new;
end $$;
create trigger attendance_employee_qr_evidence before insert on snr_private.attendance_storage_evidence
  for each row execute function snr_private.stamp_employee_qr_evidence();

revoke all on function snr_private.check_employee_attendance_qr(text,uuid),
  snr_private.complete_staff_before_employee_qr(uuid),snr_private.prepare_photo_before_employee_qr(jsonb),
  snr_private.record_storage_before_employee_qr(uuid,uuid),snr_private.stamp_employee_qr_evidence() from public,anon,authenticated;
revoke all on function public.hr_employee_attendance_qr(uuid,boolean,integer),public.employee_qr_attendance_workspace(text),
  public.validate_employee_qr_location(text,uuid,text,uuid,jsonb),public.hr_complete_staff_account(uuid),
  public.prepare_attendance_photo(jsonb),public.record_attendance_storage(uuid,uuid) from public,anon;
grant execute on function public.hr_employee_attendance_qr(uuid,boolean,integer),public.employee_qr_attendance_workspace(text),
  public.validate_employee_qr_location(text,uuid,text,uuid,jsonb),public.hr_complete_staff_account(uuid),
  public.prepare_attendance_photo(jsonb),public.record_attendance_storage(uuid,uuid) to authenticated;
commit;
