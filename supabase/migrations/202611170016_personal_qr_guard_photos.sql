-- Apply once after 0015. Individual QR routing, immutable attendance IDs and
-- supervised punches with separate employee/guard photos. No history rewrite.
begin;

do $$ begin
 if to_regprocedure('snr_private.complete_identity_before_service_actor(uuid,uuid,jsonb,bigint)') is null
 or to_regprocedure('snr_private.security_station_proof(uuid,uuid,uuid,text)') is null
 or to_regprocedure('snr_private.record_storage_personal_security(uuid,uuid)') is null
 or to_regprocedure('snr_private.commit_personal_security_presence(uuid,uuid)') is null
 or not coalesce(has_function_privilege('service_role',to_regprocedure('public.open_security_station_visit(uuid,uuid,uuid,uuid)'),'execute'),false)
 or coalesce(has_function_privilege('authenticated',to_regprocedure('public.open_security_station_visit(uuid,uuid,uuid,uuid)'),'execute'),true) then
 raise exception 'Verify the complete 0015 supervised attendance installation before applying 0016';end if;
end $$;

alter table public.employee_profiles add column designation text
 check(designation is null or length(btrim(designation)) between 1 and 120);
create sequence snr_private.attendance_card_number maxvalue 999999999999 no cycle;
create table snr_private.employee_attendance_cards (
 employee_id uuid primary key references public.employee_profiles(id),
 organization_id uuid not null references public.organizations(id),
 attendance_id text not null unique default ('SNR-'||lpad(nextval('snr_private.attendance_card_number')::text,12,'0')),
 created_at timestamptz not null default clock_timestamp()
);
alter table snr_private.employee_attendance_cards enable row level security;
revoke all on snr_private.employee_attendance_cards,snr_private.attendance_card_number from public,anon,authenticated,service_role;
create function snr_private.issue_attendance_card() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 insert into snr_private.employee_attendance_cards(employee_id,organization_id) values(new.id,new.organization_id);
 insert into snr_private.employee_attendance_qr(employee_id,organization_id) values(new.id,new.organization_id) on conflict(employee_id) do nothing;
 return new;
end $$;
create trigger employee_attendance_card_created after insert on public.employee_profiles for each row execute function snr_private.issue_attendance_card();
insert into snr_private.employee_attendance_cards(employee_id,organization_id) select id,organization_id from public.employee_profiles order by created_at,id;
insert into snr_private.employee_attendance_qr(employee_id,organization_id) select id,organization_id from public.employee_profiles on conflict(employee_id) do nothing;

-- Keep employee numbers and existing mutation/version checks. The separate ID
-- is private, server generated and cannot be edited through workforce APIs.
alter function public.workforce_directory(text,uuid,uuid,text,integer) set schema snr_private;
alter function snr_private.workforce_directory(text,uuid,uuid,text,integer) rename to directory_before_personal_cards;
create function public.workforce_directory(p_search text default '',p_site_id uuid default null,p_department_id uuid default null,p_status text default 'active',p_page integer default 1) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;begin
 result:=snr_private.directory_before_personal_cards(p_search,p_site_id,p_department_id,p_status,p_page);
 return jsonb_set(result,'{rows}',(select coalesce(jsonb_agg(r.value||jsonb_build_object('designation',e.designation,'attendance_id',c.attendance_id) order by r.ordinality),'[]'::jsonb)
 from jsonb_array_elements(result->'rows') with ordinality r(value,ordinality) join public.employee_profiles e on e.id=(r.value->>'id')::uuid join snr_private.employee_attendance_cards c on c.employee_id=e.id));
end $$;
create function public.hr_save_employee_identity(p_id uuid,p_version integer,p_membership_version integer,p_email text,p_display_name text,p_employee_number text,p_site_id uuid,p_department_id uuid,p_role text,p_active boolean,p_designation text) returns uuid
language plpgsql security definer set search_path='' as $$
declare saved uuid;begin
 if p_designation is not null and length(btrim(p_designation)) not between 1 and 120 then raise exception using errcode='PT422',message='invalid_employee_fields';end if;
 saved:=public.hr_save_employee(p_id,p_version,p_membership_version,p_email,p_display_name,p_employee_number,p_site_id,p_department_id,p_role,p_active);
 update public.employee_profiles set designation=nullif(btrim(p_designation),'') where id=saved and designation is distinct from nullif(btrim(p_designation),'');
 return saved;
end $$;

-- Retain the account operation's HMAC/recovery contract. Older pending requests
-- without a designation can still finish, and retries never issue another ID.
alter function public.hr_begin_staff_account(uuid,text,uuid,integer,integer,text,jsonb,text) set schema snr_private;
alter function snr_private.hr_begin_staff_account(uuid,text,uuid,integer,integer,text,jsonb,text) rename to begin_staff_before_personal_cards;
create function public.hr_begin_staff_account(p_request_id uuid,p_action text,p_employee_id uuid,p_version integer,p_membership_version integer,p_email text,p_profile jsonb,p_fingerprint text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;begin
 if p_profile ? 'designation' and (jsonb_typeof(p_profile->'designation')<>'string' or length(btrim(p_profile->>'designation')) not between 1 and 120) then
 raise exception using errcode='PT422',message='invalid_employee_fields';end if;
 result:=snr_private.begin_staff_before_personal_cards(p_request_id,p_action,p_employee_id,p_version,p_membership_version,p_email,p_profile-'designation',p_fingerprint);
 if p_action in('create','link') and p_profile ? 'designation' then
 update snr_private.staff_account_operations set profile_data=profile_data||jsonb_build_object('designation',btrim(p_profile->>'designation'))
 where id=p_request_id and actor_user_id=auth.uid() and state<>'completed';end if;
 return result;
end $$;
alter function public.hr_complete_staff_account(uuid) set schema snr_private;
alter function snr_private.hr_complete_staff_account(uuid) rename to complete_staff_before_personal_cards;
create function public.hr_complete_staff_account(p_request_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;op snr_private.staff_account_operations;begin
 result:=snr_private.complete_staff_before_personal_cards(p_request_id);
 select * into op from snr_private.staff_account_operations where id=p_request_id and actor_user_id=auth.uid() and state='completed';
 if op.action in('create','link') and op.profile_data ? 'designation' then
 update public.employee_profiles set designation=op.profile_data->>'designation' where id=op.employee_id and designation is distinct from op.profile_data->>'designation';end if;
 return result;
end $$;

-- Lookup is authenticated and scoped. A guessed ID is never authority to read
-- a directory: only HR, a scoped supervisor or an authorized guard can find staff.
create function public.employee_attendance_card(p_employee_id uuid default null,p_code text default null,p_rotate boolean default false,p_version integer default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare ctx public.organization_memberships;e public.employee_profiles;g public.employee_profiles;c snr_private.employee_attendance_cards;q snr_private.employee_attendance_qr;begin
 ctx:=snr_private.employee_qr_context(false);
 if not exists(select 1 from auth.users where id=ctx.user_id and email_confirmed_at is not null and (to_jsonb(users)->>'deleted_at') is null
 and coalesce((to_jsonb(users)->>'banned_until')::timestamptz,'-infinity'::timestamptz)<=clock_timestamp()) then raise exception using errcode='PT403',message='workforce_access_denied';end if;
 if p_code is not null and (length(p_code)>32 or p_employee_id is not null) then raise exception using errcode='PT422',message='invalid_employee_fields';end if;
 select ep.* into e from public.employee_profiles ep join snr_private.employee_attendance_cards card on card.employee_id=ep.id
 where ep.organization_id=ctx.organization_id and ep.active
 and case when p_code is not null then card.attendance_id=upper(btrim(p_code)) when p_employee_id is not null then ep.id=p_employee_id else ep.user_id=ctx.user_id end
 and exists(select 1 from public.organization_memberships m join auth.users u on u.id=m.user_id where m.organization_id=ep.organization_id and m.user_id=ep.user_id and m.active and m.role='employee'
 and u.email_confirmed_at is not null and (to_jsonb(u)->>'deleted_at') is null and coalesce((to_jsonb(u)->>'banned_until')::timestamptz,'-infinity'::timestamptz)<=clock_timestamp());
 if e.id is null then raise exception using errcode='PT404',message='record_unavailable';end if;
 if ctx.role<>'hr' and not snr_private.can_read_employee(e.organization_id,e.id) then
 select * into g from public.employee_profiles where user_id=ctx.user_id and organization_id=ctx.organization_id and active;
 if ctx.role<>'employee' or not exists(select 1 from snr_private.security_station_operators o join snr_private.security_attendance_credentials k on k.employee_id=o.employee_id
 where o.employee_id=g.id and o.organization_id=e.organization_id and o.site_id=g.site_id and o.site_id=snr_private.security_station_site(e.id) and o.enabled
 and k.approved_at is not null and k.revoked_at is null) then raise exception using errcode='PT404',message='record_unavailable';end if;
 end if;
 select * into c from snr_private.employee_attendance_cards where employee_id=e.id;
 select * into q from snr_private.employee_attendance_qr where employee_id=e.id for update;
 if p_rotate then
 if ctx.role<>'hr' then raise exception using errcode='PT403',message='workforce_access_denied';end if;
 if p_version is distinct from q.version then raise exception using errcode='PT409',message='record_changed';end if;
 update snr_private.employee_attendance_qr set token=gen_random_uuid(),version=version+1,updated_at=clock_timestamp() where employee_id=e.id returning * into q;
 update snr_private.security_attendance_flows set expires_at=least(expires_at,clock_timestamp()) where employee_id=e.id;
 perform snr_private.workforce_audit(ctx.organization_id,'attendance.employee_qr.regenerated','employee',e.id);
 end if;
 return jsonb_build_object('employee_id',e.id,'attendance_id',c.attendance_id,'display_name',e.display_name,'designation',e.designation,'employee_number',e.employee_number,
 'site_name',(select name from public.sites where id=e.site_id),'token',q.token,'version',q.version,'can_regenerate',ctx.role='hr');
end $$;

alter table snr_private.security_attendance_flows add column personal_qr_version integer;
alter function public.security_attendance_workspace(uuid) set schema snr_private;
alter function snr_private.security_attendance_workspace(uuid) rename to workspace_before_personal_cards;
create function public.security_attendance_workspace(p_client_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;e public.employee_profiles;previous_flow uuid;begin
 e:=snr_private.security_employee();select id into previous_flow from snr_private.security_attendance_flows where employee_id=e.id;
 result:=snr_private.workspace_before_personal_cards(p_client_id);
 if previous_flow is distinct from (result->>'security_flow_id')::uuid then update snr_private.security_attendance_flows set personal_qr_version=null where id=(result->>'security_flow_id')::uuid;end if;
 return result||jsonb_build_object('attendance_id',(select attendance_id from snr_private.employee_attendance_cards where employee_id=e.id),'designation',e.designation,
 'personal_qr_required',true,'guard_photo_required',true,'personal_qr_bound',exists(select 1 from snr_private.security_attendance_flows f join snr_private.employee_attendance_qr q on q.employee_id=f.employee_id and q.version=f.personal_qr_version where f.id=(result->>'security_flow_id')::uuid));
end $$;
create function public.personal_employee_attendance_workspace(p_client_id uuid,p_token text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare e public.employee_profiles;q snr_private.employee_attendance_qr;result jsonb;begin
 e:=snr_private.security_employee();
 select * into q from snr_private.employee_attendance_qr where employee_id=e.id and token::text=p_token;
 if q.employee_id is null then raise exception using errcode='PT403',message='employee_qr_invalid';end if;
 result:=public.security_attendance_workspace(p_client_id);
 update snr_private.security_attendance_flows set personal_qr_version=q.version where id=(result->>'security_flow_id')::uuid;
 return result||jsonb_build_object('personal_qr_bound',true);
end $$;
create function snr_private.require_personal_qr(p_flow_id uuid) returns snr_private.security_attendance_flows
language plpgsql security definer set search_path='' as $$
declare f snr_private.security_attendance_flows;begin
 f:=snr_private.security_flow(p_flow_id);
 if not exists(select 1 from snr_private.employee_attendance_qr where employee_id=f.employee_id and version=f.personal_qr_version) then raise exception using errcode='PT403',message='employee_qr_invalid';end if;
 return f;
end $$;
alter function public.security_attendance_location(uuid,uuid,text,uuid,jsonb) set schema snr_private;
alter function snr_private.security_attendance_location(uuid,uuid,text,uuid,jsonb) rename to location_before_personal_cards;
create function public.security_attendance_location(p_flow_id uuid,p_employee_id uuid,p_event_type text,p_previous_event_id uuid,p_location jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
begin perform snr_private.require_personal_qr(p_flow_id);return snr_private.location_before_personal_cards(p_flow_id,p_employee_id,p_event_type,p_previous_event_id,p_location);end $$;

-- Every new write requires a distinct guard's verified, action-bound passkey.
-- Guard identity setup remains usable without scanning the guard's own QR.
alter function snr_private.security_authorize_action(uuid,uuid,jsonb,text) rename to authorize_before_guard_photos;
create function snr_private.security_authorize_action(p_flow_id uuid,p_identity_id uuid,p_action jsonb,p_kind text) returns snr_private.security_attendance_flows
language plpgsql security definer set search_path='' as $$
begin
 perform snr_private.require_personal_qr(p_flow_id);
 if not exists(select 1 from snr_private.security_identity_challenges where id=p_identity_id and kind='station') then raise exception using errcode='PT403',message='guard_approval_required';end if;
 return snr_private.authorize_before_guard_photos(p_flow_id,p_identity_id,p_action,p_kind);
end $$;
alter function public.open_security_station_visit(uuid,uuid,uuid,uuid) set schema snr_private;
alter function snr_private.open_security_station_visit(uuid,uuid,uuid,uuid) rename to open_station_before_personal_cards;
create function public.open_security_station_visit(p_operator_flow_id uuid,p_operator_user_id uuid,p_employee_flow_id uuid,p_employee_user_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from snr_private.security_attendance_flows f join snr_private.employee_attendance_qr q on q.employee_id=f.employee_id and q.version=f.personal_qr_version
 where f.id=p_employee_flow_id and f.user_id=p_employee_user_id and f.expires_at>clock_timestamp()) then raise exception using errcode='PT403',message='employee_qr_invalid';end if;
 return snr_private.open_station_before_personal_cards(p_operator_flow_id,p_operator_user_id,p_employee_flow_id,p_employee_user_id);
end $$;

create table snr_private.attendance_guard_photos (
 id uuid primary key,organization_id uuid not null,employee_id uuid not null,user_id uuid not null,flow_id uuid not null,
 operator_employee_id uuid not null,operator_user_id uuid not null,visit_id uuid not null,identity_id uuid not null,
 action_hash text not null,qr_version integer not null,sha256 text not null,byte_size integer not null,
 bucket_id text not null default 'attendance-guard-photos' check(bucket_id='attendance-guard-photos'),object_path text not null unique,
 captured_at timestamptz not null,location jsonb not null,store_check jsonb not null,created_at timestamptz not null default clock_timestamp(),verified_at timestamptz,committed_at timestamptz
);
alter table snr_private.attendance_guard_photos enable row level security;
revoke all on snr_private.attendance_guard_photos from public,anon,authenticated,service_role;
create function snr_private.freeze_committed_guard_photo() returns trigger language plpgsql set search_path='' as $$
begin if old.committed_at is not null then raise exception 'Historical evidence is immutable';end if;if tg_op='DELETE' then return old;end if;return new;end $$;
create trigger attendance_guard_photo_immutable before update or delete on snr_private.attendance_guard_photos for each row execute function snr_private.freeze_committed_guard_photo();
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('attendance-guard-photos','attendance-guard-photos',false,153600,array['image/jpeg']) on conflict(id) do nothing;
do $$ begin if not exists(select 1 from storage.buckets where id='attendance-guard-photos' and not public and file_size_limit=153600 and allowed_mime_types=array['image/jpeg']) then raise exception 'The guard photo bucket has incompatible settings';end if;end $$;

-- The employee photo keeps its existing private bucket, server naming and
-- immutable fingerprint. The guard photo is separately bound to the full action.
alter function snr_private.prepare_photo_before_security(jsonb) rename to prepare_photo_without_guard;
create function snr_private.prepare_photo_before_security(p_action jsonb) returns jsonb language sql security definer set search_path='' as $$
 select snr_private.prepare_photo_without_guard(p_action #- '{evidence,guard_photo}') $$;
create function snr_private.prepare_guard_photo(p_flow_id uuid,p_identity_id uuid,p_action jsonb,p_kind text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare f snr_private.security_attendance_flows;v snr_private.security_station_visits;u snr_private.attendance_guard_photos;photo jsonb;jpeg bytea;h text;fix jsonb;stamp timestamptz:=clock_timestamp();zone text;begin
 h:=encode(sha256(convert_to(p_action::text,'UTF8')),'hex');
 select * into u from snr_private.attendance_guard_photos where id=(p_action->>'id')::uuid;
 if u.id is not null then
 if u.user_id is distinct from auth.uid() or u.action_hash<>h then raise exception using errcode='PT409',message='attendance_request_changed';end if;
 if u.committed_at is not null then return jsonb_build_object('committed',true);end if;
 end if;
 f:=snr_private.require_personal_qr(p_flow_id);
 if not exists(select 1 from snr_private.security_identity_challenges where id=p_identity_id and kind='station') then raise exception using errcode='PT403',message='guard_approval_required';end if;
 if u.id is not null and u.identity_id is distinct from p_identity_id then raise exception using errcode='PT409',message='attendance_request_changed';end if;
 v:=snr_private.security_station_proof(p_identity_id,f.employee_id,f.id,h);
 if u.id is null then
 photo:=p_action#>'{evidence,guard_photo}';
 begin jpeg:=decode(photo->>'jpeg_base64','base64');exception when others then raise exception using errcode='PT422',message='guard_photo_required';end;
 if photo is null or jsonb_typeof(photo)<>'object' or exists(select 1 from jsonb_object_keys(photo) k where k not in('jpeg_base64','captured_at','consent_version','location'))
 or not coalesce(snr_private.valid_attendance_jpeg(jpeg),false) or octet_length(jpeg)>153600 or photo->>'consent_version' is distinct from 'attendance-photo-location-v1'
 or photo->>'captured_at' is null or not isfinite((photo->>'captured_at')::timestamptz)
 or (photo->>'captured_at')::timestamptz<stamp-interval '30 seconds' or (photo->>'captured_at')::timestamptz>stamp+interval '5 seconds'
 or abs(extract(epoch from((photo->>'captured_at')::timestamptz-(photo#>>'{location,captured_at}')::timestamptz)))>10
 or encode(sha256(jpeg),'hex')=encode(sha256(decode(p_action#>>'{evidence,photo,jpeg_base64}','base64')),'hex') then
 raise exception using errcode='PT422',message='guard_photo_required';end if;
 fix:=public.security_attendance_location(f.id,f.employee_id,case when p_kind='check' then 'clock_out' else p_action->>'type' end,(p_action->>'previousId')::uuid,photo->'location');
 select timezone into zone from public.sites where id=v.site_id;
 insert into snr_private.attendance_guard_photos(id,organization_id,employee_id,user_id,flow_id,operator_employee_id,operator_user_id,visit_id,identity_id,action_hash,qr_version,sha256,byte_size,object_path,captured_at,location,store_check)
 values((p_action->>'id')::uuid,f.organization_id,f.employee_id,f.user_id,f.id,v.operator_employee_id,v.operator_user_id,v.id,p_identity_id,h,f.personal_qr_version,encode(sha256(jpeg),'hex'),octet_length(jpeg),
 snr_private.attendance_photo_object_path((select display_name from public.employee_profiles where id=v.operator_employee_id),stamp,zone,(p_action->>'id')::uuid),(photo->>'captured_at')::timestamptz,photo->'location',fix) returning * into u;
 end if;
 return jsonb_build_object('intent_id',u.id,'user_id',u.user_id,'bucket_id',u.bucket_id,'object_path',u.object_path,'sha256',u.sha256);
end $$;

alter function public.prepare_security_attendance_photo(uuid,uuid,jsonb) set schema snr_private;
alter function snr_private.prepare_security_attendance_photo(uuid,uuid,jsonb) rename to prepare_attendance_before_guard_photo;
create function public.prepare_security_attendance_photo(p_flow_id uuid,p_identity_id uuid,p_action jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare guard jsonb;result jsonb;begin
 if exists(select 1 from snr_private.attendance_photo_uploads where id=(p_action->>'id')::uuid and user_id=auth.uid() and event_id is not null)
 and not exists(select 1 from snr_private.attendance_guard_photos where id=(p_action->>'id')::uuid) then return snr_private.prepare_attendance_before_guard_photo(p_flow_id,p_identity_id,p_action);end if;
 guard:=snr_private.prepare_guard_photo(p_flow_id,p_identity_id,p_action,'punch');
 result:=snr_private.prepare_attendance_before_guard_photo(p_flow_id,p_identity_id,p_action);
 if result ? 'receipt' then return jsonb_set(result,'{receipt,guard_photo_saved}',to_jsonb(coalesce((guard->>'committed')::boolean,false)));end if;
 return result||jsonb_build_object('guard_photo',guard);
end $$;
alter function public.prepare_security_presence_photo(uuid,uuid,jsonb) set schema snr_private;
alter function snr_private.prepare_security_presence_photo(uuid,uuid,jsonb) rename to prepare_presence_before_guard_photo;
create function public.prepare_security_presence_photo(p_flow_id uuid,p_identity_id uuid,p_action jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare guard jsonb;result jsonb;begin
 if exists(select 1 from snr_private.security_presence_uploads where id=(p_action->>'id')::uuid and user_id=auth.uid() and committed_at is not null)
 and not exists(select 1 from snr_private.attendance_guard_photos where id=(p_action->>'id')::uuid) then return snr_private.prepare_presence_before_guard_photo(p_flow_id,p_identity_id,p_action);end if;
 guard:=snr_private.prepare_guard_photo(p_flow_id,p_identity_id,p_action,'check');result:=snr_private.prepare_presence_before_guard_photo(p_flow_id,p_identity_id,p_action);
 if result ? 'receipt' then return jsonb_set(result,'{receipt,guard_photo_saved}',to_jsonb(coalesce((guard->>'committed')::boolean,false)));end if;
 return result||jsonb_build_object('guard_photo',guard);
end $$;
create function public.verify_attendance_guard_upload(p_intent_id uuid,p_sha256 text) returns void
language plpgsql security definer set search_path='' as $$
declare u snr_private.attendance_guard_photos;begin
 select * into u from snr_private.attendance_guard_photos where id=p_intent_id for update;
 if u.id is null or u.sha256 is distinct from p_sha256 or not exists(select 1 from storage.objects where bucket_id=u.bucket_id and name=u.object_path and (metadata->>'size')::bigint=u.byte_size and metadata->>'mimetype'='image/jpeg') then raise exception using errcode='PT409',message='attendance_photo_not_uploaded';end if;
 if u.committed_at is null then update snr_private.attendance_guard_photos set verified_at=coalesce(verified_at,clock_timestamp()) where id=u.id;end if;
end $$;
create function snr_private.guard_photo_ready(p_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare u snr_private.attendance_guard_photos;begin
 select * into u from snr_private.attendance_guard_photos where id=p_id and user_id=auth.uid() for update;
 if u.id is null or u.verified_at is null then raise exception using errcode='PT403',message='guard_photo_required';end if;
 if u.committed_at is not null then return;end if;
 perform snr_private.require_personal_qr(u.flow_id);
 perform snr_private.security_station_proof(u.identity_id,u.employee_id,u.flow_id,u.action_hash);
 if u.captured_at<clock_timestamp()-interval '2 minutes' then raise exception using errcode='PT422',message='stale_attendance_photo';end if;
end $$;
alter function public.record_attendance_storage(uuid,uuid) set schema snr_private;
alter function snr_private.record_attendance_storage(uuid,uuid) rename to record_before_guard_photos;
create function public.record_attendance_storage(p_request_id uuid,p_employee_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare receipt jsonb;fresh boolean;begin
 fresh:=not exists(select 1 from snr_private.attendance_photo_uploads where id=p_request_id and user_id=auth.uid() and event_id is not null);
 if fresh then perform snr_private.guard_photo_ready(p_request_id);end if;
 receipt:=snr_private.record_before_guard_photos(p_request_id,p_employee_id);
 if fresh then update snr_private.attendance_guard_photos set committed_at=clock_timestamp() where id=p_request_id and committed_at is null;end if;
 return receipt||jsonb_build_object('guard_photo_saved',exists(select 1 from snr_private.attendance_guard_photos where id=p_request_id and user_id=auth.uid() and committed_at is not null));
end $$;
alter function public.commit_security_presence(uuid,uuid) set schema snr_private;
alter function snr_private.commit_security_presence(uuid,uuid) rename to commit_presence_before_guard_photos;
create function public.commit_security_presence(p_flow_id uuid,p_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare receipt jsonb;fresh boolean;begin
 fresh:=not exists(select 1 from snr_private.security_presence_uploads where id=p_id and user_id=auth.uid() and committed_at is not null);
 if fresh then perform snr_private.guard_photo_ready(p_id);end if;
 receipt:=snr_private.commit_presence_before_guard_photos(p_flow_id,p_id);
 if fresh then update snr_private.attendance_guard_photos set committed_at=clock_timestamp() where id=p_id and committed_at is null;end if;
 return receipt||jsonb_build_object('guard_photo_saved',exists(select 1 from snr_private.attendance_guard_photos where id=p_id and user_id=auth.uid() and committed_at is not null));
end $$;

create function snr_private.can_read_guard_photo(bucket text,path text) returns boolean
language sql stable security definer set search_path='' as $$
 select bucket='attendance-guard-photos' and exists(select 1 from snr_private.attendance_guard_photos p where p.bucket_id=bucket and p.object_path=path and p.committed_at is not null
 and ((exists(select 1 from snr_private.attendance_photo_uploads u where u.id=p.id and u.event_id is not null) and snr_private.can_read_employee(p.organization_id,p.employee_id))
 or (exists(select 1 from snr_private.security_presence_uploads u where u.id=p.id and u.committed_at is not null) and exists(select 1 from public.organization_memberships m where m.organization_id=p.organization_id and m.user_id=auth.uid() and m.active and (m.role='hr' or(m.role='employee' and m.user_id=p.user_id)))))) $$;
revoke all on function snr_private.can_read_guard_photo(text,text) from public;
grant execute on function snr_private.can_read_guard_photo(text,text) to anon,authenticated;
create policy guard_photo_read on storage.objects for select to authenticated using(bucket_id='attendance-guard-photos' and snr_private.can_read_guard_photo(bucket_id,name));
create policy guard_photo_boundary on storage.objects as restrictive for select to public using(bucket_id<>'attendance-guard-photos' or snr_private.can_read_guard_photo(bucket_id,name));
create policy guard_photo_no_insert on storage.objects as restrictive for insert to public with check(bucket_id<>'attendance-guard-photos');
create policy guard_photo_no_update on storage.objects as restrictive for update to public using(bucket_id<>'attendance-guard-photos') with check(bucket_id<>'attendance-guard-photos');
create policy guard_photo_no_delete on storage.objects as restrictive for delete to public using(bucket_id<>'attendance-guard-photos');
alter function public.attendance_location_details(uuid) set schema snr_private;
alter function snr_private.attendance_location_details(uuid) rename to location_details_before_guard_photo;
create function public.attendance_location_details(p_session_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;kind text;photo jsonb;begin
 result:=snr_private.location_details_before_guard_photo(p_session_id);
 foreach kind in array array['clock_in','clock_out'] loop
 select jsonb_build_object('bucket_id',p.bucket_id,'object_path',p.object_path,'captured_at',p.captured_at) into photo
 from snr_private.attendance_guard_photos p join snr_private.attendance_photo_uploads u on u.id=p.id
 join public.attendance_events ev on ev.id=u.event_id where ev.session_id=p_session_id and ev.event_type=kind and p.committed_at is not null and snr_private.can_read_employee(p.organization_id,p.employee_id);
 if photo is not null then result:=jsonb_set(result,array[kind,'guard_photo'],photo);end if;
 end loop;return result;
end $$;

alter function public.security_presence_details(uuid) set schema snr_private;
alter function snr_private.security_presence_details(uuid) rename to presence_details_before_guard_photo;
create function public.security_presence_details(p_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;photo jsonb;begin
 result:=snr_private.presence_details_before_guard_photo(p_id);
 select jsonb_build_object('bucket_id',p.bucket_id,'object_path',p.object_path,'captured_at',p.captured_at,'operator_name',w.operator_name) into photo
 from snr_private.attendance_guard_photos p join snr_private.security_presence_evidence ev on ev.request_id=p.id
 join snr_private.security_station_evidence w on w.request_id=p.id
 where ev.challenge_id=p_id and p.committed_at is not null and snr_private.can_read_guard_photo(p.bucket_id,p.object_path);
 if photo is not null then result:=result||jsonb_build_object('guard_photo',photo);end if;
 return result;
end $$;

-- Moved originals and private helpers must never be callable through PostgREST.
do $$ declare fn record;begin
 for fn in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='snr_private' and
 (p.proname in('issue_attendance_card','directory_before_personal_cards','begin_staff_before_personal_cards','complete_staff_before_personal_cards','workspace_before_personal_cards','require_personal_qr','location_before_personal_cards','authorize_before_guard_photos','security_authorize_action','open_station_before_personal_cards','freeze_committed_guard_photo','prepare_photo_without_guard','prepare_photo_before_security','prepare_guard_photo','prepare_attendance_before_guard_photo','prepare_presence_before_guard_photo','guard_photo_ready','record_before_guard_photos','commit_presence_before_guard_photos','location_details_before_guard_photo','presence_details_before_guard_photo')) loop
 execute format('revoke all on function %s from public,anon,authenticated,service_role',fn.signature);end loop;
 for fn in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and
 p.proname in('workforce_directory','hr_save_employee_identity','hr_begin_staff_account','hr_complete_staff_account','employee_attendance_card','security_attendance_workspace','personal_employee_attendance_workspace','security_attendance_location','prepare_security_attendance_photo','prepare_security_presence_photo','record_attendance_storage','commit_security_presence','attendance_location_details','security_presence_details') loop
 execute format('revoke all on function %s from public,anon,authenticated,service_role',fn.signature);
 execute format('grant execute on function %s to authenticated',fn.signature);end loop;
end $$;
revoke all on function public.open_security_station_visit(uuid,uuid,uuid,uuid),public.verify_attendance_guard_upload(uuid,text) from public,anon,authenticated;
grant execute on function public.open_security_station_visit(uuid,uuid,uuid,uuid),public.verify_attendance_guard_upload(uuid,text) to service_role;
notify pgrst,'reload schema';
commit;
