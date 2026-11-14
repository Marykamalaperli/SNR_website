-- Common QR -> verified sign-in -> approved passkey -> location/selfie.
-- Apply once after 0013. Existing events, photos and audit records stay intact.
begin;

-- A printed QR is now only a shared link, never an employee credential.
create or replace function public.employee_qr_attendance_gateway(p_token text,p_operation text,p_payload jsonb default '{}')
returns jsonb language plpgsql security definer set search_path='' as $$
begin raise exception using errcode='PT401',message='sign_in_required';end $$;
revoke all on function public.employee_qr_attendance_gateway(text,text,jsonb) from service_role;
create or replace function public.hr_complete_staff_account(p_request_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
begin return snr_private.complete_staff_before_employee_qr(p_request_id);end $$;
create or replace function public.hr_employee_attendance_qr(p_employee_id uuid,p_rotate boolean default false,p_version integer default null)
returns jsonb language plpgsql security definer set search_path='' as $$
begin perform snr_private.workforce_context(true);raise exception using errcode='PT409',message='personal_qr_retired';end $$;

create function snr_private.security_employee() returns public.employee_profiles
language plpgsql security definer set search_path='' as $$
declare ctx public.organization_memberships;e public.employee_profiles;
begin
 ctx:=snr_private.employee_qr_context(false);
 if ctx.role<>'employee' then raise exception using errcode='PT403',message='workforce_access_denied';end if;
 select e1.* into e from public.employee_profiles e1 join auth.users u on u.id=e1.user_id
 where e1.organization_id=ctx.organization_id and e1.user_id=ctx.user_id and e1.active
 and u.email_confirmed_at is not null and (to_jsonb(u)->>'deleted_at') is null
 and coalesce((to_jsonb(u)->>'banned_until')::timestamptz,'-infinity'::timestamptz)<=clock_timestamp() for share of e1;
 if e.id is null then raise exception using errcode='PT403',message='employee_profile_required';end if;
 return e;
end $$;
create function snr_private.security_auth_session() returns uuid
language plpgsql stable set search_path='' as $$
declare session_id uuid;
begin
 begin session_id:=(current_setting('request.jwt.claims',true)::jsonb->>'session_id')::uuid;
 exception when others then raise exception using errcode='PT401',message='sign_in_required';end;
 if session_id is null then raise exception using errcode='PT401',message='sign_in_required';end if;
 return session_id;
end $$;
create table snr_private.security_attendance_flows (
 employee_id uuid primary key references public.employee_profiles(id),organization_id uuid not null,user_id uuid not null,
 id uuid not null unique default gen_random_uuid(),auth_session uuid not null,client_id uuid not null,
 expires_at timestamptz not null
);
create table snr_private.security_attendance_credentials (
 id text primary key check(length(id) between 16 and 1400),organization_id uuid not null,employee_id uuid not null references public.employee_profiles(id),
 user_id uuid not null,public_key text not null,counter bigint not null check(counter>=0),rp_id text not null,
 transports jsonb not null default '[]',created_at timestamptz not null default clock_timestamp(),
 approved_at timestamptz,revoked_at timestamptz,version integer not null default 1
);
create unique index security_one_approved_credential on snr_private.security_attendance_credentials(employee_id)
 where approved_at is not null and revoked_at is null;
create table snr_private.security_attendance_policies (
 employee_id uuid primary key references public.employee_profiles(id),organization_id uuid not null,
 checks_per_shift integer not null default 0 check(checks_per_shift in(0,3,4)),version integer not null default 1
);
create table snr_private.security_identity_challenges (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,employee_id uuid not null,user_id uuid not null,
 flow_id uuid not null,auth_session uuid not null,kind text not null check(kind in('register','punch','check')),
 challenge text not null,rp_id text not null,action_hash text,credential_id text,credential_version integer,
 created_at timestamptz not null default clock_timestamp(),expires_at timestamptz not null default clock_timestamp()+interval '2 minutes',
 verified_at timestamptz,consumed_at timestamptz
);
create table snr_private.security_punch_permits (
 id uuid primary key,organization_id uuid not null,employee_id uuid not null,user_id uuid not null,
 flow_id uuid not null,auth_session uuid not null,identity_id uuid not null unique references snr_private.security_identity_challenges(id),action_hash text not null
);
create table snr_private.security_presence_challenges (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,employee_id uuid not null,user_id uuid not null,
 session_id uuid not null references public.attendance_events(id),slot integer not null check(slot between 1 and 4),
 due_at timestamptz not null,expires_at timestamptz not null,unique(session_id,slot),check(expires_at=due_at+interval '2 minutes')
);
create table snr_private.security_presence_uploads (
 id uuid primary key,challenge_id uuid not null unique references snr_private.security_presence_challenges(id),
 organization_id uuid not null,employee_id uuid not null,user_id uuid not null,flow_id uuid not null,auth_session uuid not null,
 identity_id uuid not null references snr_private.security_identity_challenges(id),action_hash text not null,sha256 text not null,byte_size integer not null,bucket_id text not null default 'attendance-security-checks',
 object_path text not null unique,payload jsonb not null,verified_at timestamptz,committed_at timestamptz
);
create table snr_private.security_presence_evidence (
 challenge_id uuid primary key references snr_private.security_presence_challenges(id),request_id uuid not null unique,identity_id uuid not null references snr_private.security_identity_challenges(id),
 organization_id uuid not null,employee_id uuid not null,user_id uuid not null,session_id uuid not null,
 bucket_id text not null,object_path text not null,sha256 text not null,captured_at timestamptz not null,
 recorded_at timestamptz not null default clock_timestamp(),location jsonb not null,store_check jsonb not null
);
create trigger security_presence_evidence_immutable before update or delete on snr_private.security_presence_evidence
 for each row execute function snr_private.reject_history_mutation();

do $$ declare tbl text;begin
 foreach tbl in array array['security_attendance_flows','security_attendance_credentials','security_attendance_policies',
 'security_identity_challenges','security_punch_permits','security_presence_challenges','security_presence_uploads','security_presence_evidence'] loop
 execute format('alter table snr_private.%I enable row level security',tbl);
 execute format('revoke all on snr_private.%I from public,anon,authenticated',tbl);
 end loop;
end $$;

create function snr_private.security_flow(p_flow_id uuid) returns snr_private.security_attendance_flows
language plpgsql security definer set search_path='' as $$
declare e public.employee_profiles;f snr_private.security_attendance_flows;
begin
 e:=snr_private.security_employee();
 select * into f from snr_private.security_attendance_flows where employee_id=e.id and user_id=e.user_id
 and id=p_flow_id and auth_session=snr_private.security_auth_session() and expires_at>clock_timestamp() for share;
 if f.id is null then raise exception using errcode='PT409',message='security_flow_required';end if;
 return f;
end $$;
create function public.security_attendance_workspace(p_client_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare e public.employee_profiles;f snr_private.security_attendance_flows;s uuid;workspace jsonb;
begin
 e:=snr_private.security_employee();s:=snr_private.security_auth_session();
 if p_client_id is null then raise exception using errcode='PT422',message='invalid_request';end if;
 select * into f from snr_private.security_attendance_flows where employee_id=e.id for update;
 if f.id is not null and f.expires_at>clock_timestamp() and (f.auth_session,f.client_id) is distinct from(s,p_client_id) then
 raise exception using errcode='PT409',message='attendance_open_elsewhere';end if;
 if f.id is null then
 insert into snr_private.security_attendance_flows(employee_id,organization_id,user_id,auth_session,client_id,expires_at)
 values(e.id,e.organization_id,e.user_id,s,p_client_id,clock_timestamp()+interval '90 seconds') returning * into f;
 elsif f.expires_at<=clock_timestamp() then
 update snr_private.security_attendance_flows set id=gen_random_uuid(),auth_session=s,client_id=p_client_id,expires_at=clock_timestamp()+interval '90 seconds'
 where employee_id=e.id returning * into f;
 else update snr_private.security_attendance_flows set expires_at=clock_timestamp()+interval '90 seconds' where employee_id=e.id returning * into f;
 end if;
 workspace:=public.attendance_workspace();
 return workspace||jsonb_build_object('security_flow_id',f.id,'security_flow_expires_at',f.expires_at,'server_time',clock_timestamp(),
 'display_name',e.display_name,'security_credential_approved',exists(select 1 from snr_private.security_attendance_credentials where employee_id=e.id and approved_at is not null and revoked_at is null),
 'security_credential_pending',exists(select 1 from snr_private.security_attendance_credentials where employee_id=e.id and approved_at is null and revoked_at is null),
 'security_checks_per_shift',coalesce((select checks_per_shift from snr_private.security_attendance_policies where employee_id=e.id),0));
end $$;
create function public.security_release_flow(p_flow_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare f snr_private.security_attendance_flows;
begin f:=snr_private.security_flow(p_flow_id);update snr_private.security_attendance_flows set expires_at=clock_timestamp() where employee_id=f.employee_id;end $$;

create function public.security_identity_context(p_flow_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare f snr_private.security_attendance_flows;e public.employee_profiles;c snr_private.security_attendance_credentials;
begin
 f:=snr_private.security_flow(p_flow_id);select * into e from public.employee_profiles where id=f.employee_id;
 select * into c from snr_private.security_attendance_credentials where employee_id=e.id and approved_at is not null and revoked_at is null;
 return jsonb_build_object('user_id',e.user_id,'employee_id',e.id,'display_name',e.display_name,
 'credential',case when c.id is null then null else jsonb_build_object('id',c.id,'public_key',c.public_key,'counter',c.counter,'rp_id',c.rp_id,'transports',c.transports) end);
end $$;
create function public.security_begin_identity(p_flow_id uuid,p_kind text,p_rp_id text,p_action jsonb default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare f snr_private.security_attendance_flows;c snr_private.security_attendance_credentials;ch snr_private.security_identity_challenges;nonce text;
begin
 f:=snr_private.security_flow(p_flow_id);
 if p_kind is null or p_kind not in('register','punch','check')
 or p_rp_id is null or length(p_rp_id) not between 1 and 253 or (p_action is not null and length(p_action::text)>215000) then
 raise exception using errcode='PT422',message='invalid_request';end if;
 if (select count(*) from snr_private.security_identity_challenges where user_id=f.user_id and created_at>clock_timestamp()-interval '1 minute')>=12 then
 raise exception using errcode='PT429',message='attendance_photo_rate_limit';end if;
 if p_kind<>'register' then
 select * into c from snr_private.security_attendance_credentials where employee_id=f.employee_id and approved_at is not null and revoked_at is null for share;
 if c.id is null or c.rp_id<>p_rp_id then raise exception using errcode='PT403',message='attendance_passkey_required';end if;
 if p_action is null or p_action->>'employeeId' is distinct from f.employee_id::text
 or (p_kind='punch' and coalesce(p_action->>'type','') not in('clock_in','clock_out')) or (p_kind='check' and p_action->>'type' is distinct from 'security_check') then
 raise exception using errcode='PT403',message='workforce_access_denied';end if;
 else
 if exists(select 1 from snr_private.security_attendance_credentials where employee_id=f.employee_id and revoked_at is null) then
 raise exception using errcode='PT409',message='attendance_passkey_pending';end if;
 end if;
 nonce:=rtrim(translate(encode(uuid_send(gen_random_uuid())||uuid_send(gen_random_uuid()),'base64'),'+/','-_'),'=');
 insert into snr_private.security_identity_challenges(organization_id,employee_id,user_id,flow_id,auth_session,kind,challenge,rp_id,action_hash,credential_id,credential_version)
 values(f.organization_id,f.employee_id,f.user_id,f.id,f.auth_session,p_kind,nonce,p_rp_id,
 case when p_action is null then null else encode(sha256(convert_to(p_action::text,'UTF8')),'hex') end,c.id,c.version) returning * into ch;
 if p_kind='check' then
 update snr_private.security_identity_challenges set expires_at=least(expires_at,(select expires_at from snr_private.security_presence_challenges where id=(p_action->>'checkId')::uuid and user_id=f.user_id)) where id=ch.id returning * into ch;
 end if;
 return jsonb_build_object('id',ch.id,'expires_at',ch.expires_at,'challenge',ch.challenge);
end $$;
create function public.security_identity_challenge(p_flow_id uuid,p_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare f snr_private.security_attendance_flows;ch snr_private.security_identity_challenges;ctx jsonb;
begin
 f:=snr_private.security_flow(p_flow_id);
 select * into ch from snr_private.security_identity_challenges where id=p_id and user_id=f.user_id and flow_id=f.id and auth_session=f.auth_session
 and expires_at>clock_timestamp() and verified_at is null and consumed_at is null;
 if ch.id is null then raise exception using errcode='PT409',message='attendance_identity_expired';end if;
 ctx:=public.security_identity_context(p_flow_id);
 return ctx||jsonb_build_object('id',ch.id,'kind',ch.kind,'challenge',ch.challenge,'rp_id',ch.rp_id);
end $$;
-- Only the Worker, after WebAuthn signature/origin/RP/UV verification, can finish.
create function public.complete_security_identity(p_id uuid,p_user_id uuid,p_registration jsonb default null,p_counter bigint default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare ch snr_private.security_identity_challenges;c snr_private.security_attendance_credentials;f snr_private.security_attendance_flows;
begin
 select * into ch from snr_private.security_identity_challenges where id=p_id and user_id=p_user_id;
 if ch.id is null then raise exception using errcode='PT403',message='workforce_access_denied';end if;
 perform pg_advisory_xact_lock(hashtextextended('workforce-people:'||ch.organization_id::text,0));
 select * into ch from snr_private.security_identity_challenges where id=p_id for update;
 select * into f from snr_private.security_attendance_flows where id=ch.flow_id and auth_session=ch.auth_session and expires_at>clock_timestamp() for share;
 if f.id is null or ch.expires_at<=clock_timestamp() or ch.verified_at is not null or ch.consumed_at is not null
 or not exists(select 1 from public.employee_profiles e join public.organization_memberships m on m.organization_id=e.organization_id and m.user_id=e.user_id
 where e.id=ch.employee_id and e.user_id=p_user_id and e.active and m.active and m.role='employee') then
 raise exception using errcode='PT409',message='attendance_identity_expired';end if;
 if ch.kind='register' then
 if p_registration is null or length(p_registration::text)>10000 or p_registration->>'id' is null or p_registration->>'public_key' is null
 or exists(select 1 from snr_private.security_attendance_credentials where employee_id=ch.employee_id and revoked_at is null) then
 raise exception using errcode='PT409',message='attendance_passkey_pending';end if;
 insert into snr_private.security_attendance_credentials(id,organization_id,employee_id,user_id,public_key,counter,rp_id,transports)
 values(p_registration->>'id',ch.organization_id,ch.employee_id,ch.user_id,p_registration->>'public_key',(p_registration->>'counter')::bigint,ch.rp_id,coalesce(p_registration->'transports','[]'));
 perform snr_private.workforce_audit(ch.organization_id,'attendance.passkey.enrolled','employee',ch.employee_id);
 else
 select * into c from snr_private.security_attendance_credentials where id=ch.credential_id and employee_id=ch.employee_id and approved_at is not null and revoked_at is null for update;
 if c.id is null or c.version<>ch.credential_version or p_counter is null or p_counter<0
 or ((c.counter>0 or p_counter>0) and p_counter<=c.counter) then
 raise exception using errcode='PT403',message='attendance_passkey_required';end if;
 update snr_private.security_attendance_credentials set counter=p_counter where id=c.id;
 end if;
 update snr_private.security_identity_challenges set verified_at=clock_timestamp() where id=ch.id;
 return jsonb_build_object('id',ch.id,'status',case when ch.kind='register' then 'pending_hr_approval' else 'verified' end);
end $$;

create function public.hr_security_attendance(p_employee_id uuid,p_checks integer default null,p_credential_id text default null,p_version integer default null,p_reset boolean default false) returns jsonb
language plpgsql security definer set search_path='' as $$
declare ctx public.organization_memberships;e public.employee_profiles;c snr_private.security_attendance_credentials;
begin
 ctx:=snr_private.employee_qr_context(true);
 select * into e from public.employee_profiles where organization_id=ctx.organization_id and id=p_employee_id
 and exists(select 1 from public.organization_memberships where organization_id=ctx.organization_id and user_id=employee_profiles.user_id and role='employee') for share;
 if e.id is null then raise exception using errcode='PT404',message='record_unavailable';end if;
 if p_checks is not null then
 if p_checks not in(0,3,4) then raise exception using errcode='PT422',message='invalid_request';end if;
 insert into snr_private.security_attendance_policies(employee_id,organization_id,checks_per_shift) values(e.id,e.organization_id,p_checks)
 on conflict(employee_id) do update set checks_per_shift=excluded.checks_per_shift,version=security_attendance_policies.version+1;
 perform snr_private.workforce_audit(ctx.organization_id,'attendance.security_policy.saved','employee',e.id);
 end if;
 if p_reset then
 update snr_private.security_attendance_credentials set revoked_at=clock_timestamp(),version=version+1 where employee_id=e.id and revoked_at is null;
 update snr_private.security_attendance_flows set expires_at=clock_timestamp() where employee_id=e.id;
 perform snr_private.workforce_audit(ctx.organization_id,'attendance.passkey.reset','employee',e.id);
 elsif p_credential_id is not null then
 select * into c from snr_private.security_attendance_credentials where employee_id=e.id and id=p_credential_id and revoked_at is null for update;
 if c.id is null or c.version is distinct from p_version then raise exception using errcode='PT409',message='record_changed';end if;
 update snr_private.security_attendance_credentials set revoked_at=clock_timestamp(),version=version+1 where employee_id=e.id and id<>c.id and revoked_at is null;
 update snr_private.security_attendance_credentials set approved_at=clock_timestamp(),version=version+1 where id=c.id;
 perform snr_private.workforce_audit(ctx.organization_id,'attendance.passkey.approved','employee',e.id);
 end if;
 return jsonb_build_object('employee_id',e.id,'checks_per_shift',coalesce((select checks_per_shift from snr_private.security_attendance_policies where employee_id=e.id),0),
 'credentials',coalesce((select jsonb_agg(jsonb_build_object('id',id,'created_at',created_at,'approved',approved_at is not null,'version',version,'rp_id',rp_id))
 from snr_private.security_attendance_credentials where employee_id=e.id and revoked_at is null),'[]'));
end $$;

create function snr_private.security_authorize_action(p_flow_id uuid,p_identity_id uuid,p_action jsonb,p_kind text) returns snr_private.security_attendance_flows
language plpgsql security definer set search_path='' as $$
declare f snr_private.security_attendance_flows;ch snr_private.security_identity_challenges;h text;
begin
 f:=snr_private.security_flow(p_flow_id);h:=encode(sha256(convert_to(p_action::text,'UTF8')),'hex');
 select * into ch from snr_private.security_identity_challenges where id=p_identity_id and flow_id=f.id and user_id=f.user_id and auth_session=f.auth_session for update;
 if ch.id is null or ch.kind<>p_kind or ch.verified_at is null or ch.expires_at<=clock_timestamp() or ch.action_hash is distinct from h
 or not exists(select 1 from snr_private.security_attendance_credentials where id=ch.credential_id and employee_id=f.employee_id
 and version=ch.credential_version and approved_at is not null and revoked_at is null) then
 raise exception using errcode='PT403',message='attendance_passkey_required';end if;
 if ch.consumed_at is not null and not exists(select 1 from snr_private.security_punch_permits where id=(p_action->>'id')::uuid and identity_id=ch.id and action_hash=h)
 and not exists(select 1 from snr_private.security_presence_uploads where id=(p_action->>'id')::uuid and action_hash=h and user_id=f.user_id) then
 raise exception using errcode='PT409',message='attendance_request_changed';end if;
 update snr_private.security_identity_challenges set consumed_at=coalesce(consumed_at,clock_timestamp()) where id=ch.id;
 return f;
end $$;

alter function public.prepare_attendance_photo(jsonb) set schema snr_private;
alter function snr_private.prepare_attendance_photo(jsonb) rename to prepare_photo_before_security;
create function public.prepare_attendance_photo(p_action jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare e public.employee_profiles;permit snr_private.security_punch_permits;old snr_private.attendance_photo_uploads;result jsonb;
begin
 e:=snr_private.security_employee();
 select * into old from snr_private.attendance_photo_uploads where id=(p_action->>'id')::uuid;
 if old.event_id is null then
 select * into permit from snr_private.security_punch_permits where id=(p_action->>'id')::uuid and employee_id=e.id and user_id=e.user_id
 and auth_session=snr_private.security_auth_session() and action_hash=encode(sha256(convert_to(p_action::text,'UTF8')),'hex');
 if permit.id is null then raise exception using errcode='PT403',message='security_flow_required';end if;
 perform snr_private.security_flow(permit.flow_id);
 end if;
 result:=snr_private.prepare_photo_before_security(p_action);
 if result ? 'receipt' then result:=jsonb_set(result,'{receipt,security_identity_verified}',to_jsonb(exists(select 1 from snr_private.security_punch_permits where id=(p_action->>'id')::uuid and employee_id=e.id and user_id=e.user_id)));end if;
 return result;
end $$;
create function public.prepare_security_attendance_photo(p_flow_id uuid,p_identity_id uuid,p_action jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare f snr_private.security_attendance_flows;
begin
 if exists(select 1 from snr_private.attendance_photo_uploads where id=(p_action->>'id')::uuid and user_id=auth.uid() and event_id is not null) then return public.prepare_attendance_photo(p_action);end if;
 f:=snr_private.security_authorize_action(p_flow_id,p_identity_id,p_action,'punch');
 insert into snr_private.security_punch_permits(id,organization_id,employee_id,user_id,flow_id,auth_session,identity_id,action_hash)
 values((p_action->>'id')::uuid,f.organization_id,f.employee_id,f.user_id,f.id,f.auth_session,p_identity_id,encode(sha256(convert_to(p_action::text,'UTF8')),'hex'))
 on conflict(id) do nothing;
 return public.prepare_attendance_photo(p_action);
end $$;
alter function public.record_attendance_storage(uuid,uuid) set schema snr_private;
alter function snr_private.record_attendance_storage(uuid,uuid) rename to record_storage_before_security;
create function public.record_attendance_storage(p_request_id uuid,p_employee_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare e public.employee_profiles;permit snr_private.security_punch_permits;intent snr_private.attendance_photo_uploads;receipt jsonb;ev public.attendance_events;n integer;span double precision;due timestamptz;i integer;
begin
 e:=snr_private.security_employee();select * into intent from snr_private.attendance_photo_uploads where id=p_request_id;
 if intent.event_id is null then
 select * into permit from snr_private.security_punch_permits where id=p_request_id and employee_id=e.id and user_id=e.user_id and auth_session=snr_private.security_auth_session();
 if permit.id is null then raise exception using errcode='PT403',message='security_flow_required';end if;
 perform snr_private.security_flow(permit.flow_id);
 if not exists(select 1 from snr_private.security_identity_challenges ch join snr_private.security_attendance_credentials c on c.id=ch.credential_id
 where ch.id=permit.identity_id and ch.verified_at is not null and ch.expires_at>clock_timestamp() and c.version=ch.credential_version and c.approved_at is not null and c.revoked_at is null) then
 raise exception using errcode='PT403',message='attendance_passkey_required';end if;
 end if;
 receipt:=snr_private.record_storage_before_security(p_request_id,p_employee_id);
 if intent.event_id is null and receipt->>'event_type'='clock_in' then
 select * into ev from public.attendance_events where id=(receipt->>'id')::uuid;
 n:=coalesce((select checks_per_shift from snr_private.security_attendance_policies where employee_id=e.id),0);
 if n>0 then
 span:=greatest(180,extract(epoch from(ev.scheduled_end-ev.occurred_at))/n);
 for i in 1..n loop
 due:=ev.occurred_at+make_interval(secs=>60+(i-1)*span+random()*greatest(1,span-150));
 insert into snr_private.security_presence_challenges(organization_id,employee_id,user_id,session_id,slot,due_at,expires_at)
 values(e.organization_id,e.id,e.user_id,ev.id,i,due,due+interval '2 minutes') on conflict(session_id,slot) do nothing;
 end loop;
 end if;
 end if;
 return receipt||jsonb_build_object('security_identity_verified',exists(select 1 from snr_private.security_punch_permits where id=p_request_id and employee_id=e.id and user_id=e.user_id));
end $$;

create function public.security_attendance_location(p_flow_id uuid,p_employee_id uuid,p_event_type text,p_previous_event_id uuid,p_location jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare f snr_private.security_attendance_flows;
begin
 f:=snr_private.security_flow(p_flow_id);
 if f.employee_id is distinct from p_employee_id then raise exception using errcode='PT403',message='workforce_access_denied';end if;
 return public.validate_attendance_location(f.employee_id,p_event_type,p_previous_event_id,p_location);
end $$;

-- Random checks never manufacture or overwrite a normal attendance event.
create function public.security_presence_status(p_flow_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare f snr_private.security_attendance_flows;ev public.attendance_events;result jsonb;
begin
 f:=snr_private.security_flow(p_flow_id);
 select * into ev from public.attendance_events where organization_id=f.organization_id and employee_id=f.employee_id order by sequence_no desc limit 1;
 if ev.event_type is distinct from 'clock_in' then return jsonb_build_object('total',0,'completed',0,'missed',0,'current',null,'server_time',clock_timestamp());end if;
 select jsonb_build_object('total',count(*),'completed',count(*) filter(where proof.challenge_id is not null),
 'missed',count(*) filter(where proof.challenge_id is null and ch.expires_at<=clock_timestamp()),'server_time',clock_timestamp()) into result
 from snr_private.security_presence_challenges ch left join snr_private.security_presence_evidence proof on proof.challenge_id=ch.id where ch.session_id=ev.id;
 return result||jsonb_build_object('current',(select jsonb_build_object('id',ch.id,'slot',ch.slot,'due_at',ch.due_at,'expires_at',ch.expires_at,'session_id',ev.id,'site_name',(select name from public.sites where id=ev.site_id))
 from snr_private.security_presence_challenges ch where ch.session_id=ev.id and ch.due_at<=clock_timestamp() and ch.expires_at>clock_timestamp()
 and not exists(select 1 from snr_private.security_presence_evidence where challenge_id=ch.id) order by ch.due_at limit 1));
end $$;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('attendance-security-checks','attendance-security-checks',false,153600,array['image/jpeg']) on conflict(id) do nothing;
do $$ begin
 if exists(select 1 from storage.buckets where id='attendance-security-checks' and (public or file_size_limit is distinct from 153600 or allowed_mime_types is distinct from array['image/jpeg'])) then
 raise exception 'The security-check bucket has incompatible settings. Review its privacy/size before migration.';end if;
end $$;
create function public.prepare_security_presence_photo(p_flow_id uuid,p_identity_id uuid,p_action jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare f snr_private.security_attendance_flows;ch snr_private.security_presence_challenges;u snr_private.security_presence_uploads;ev public.attendance_events;jpeg bytea;photo jsonb;h text;fix jsonb;stamp timestamptz:=clock_timestamp();
begin
 perform snr_private.security_employee();
 select * into u from snr_private.security_presence_uploads where id=(p_action->>'id')::uuid and user_id=auth.uid() and committed_at is not null;
 if u.id is not null then
 if u.action_hash<>encode(sha256(convert_to(p_action::text,'UTF8')),'hex') then raise exception using errcode='PT409',message='attendance_request_changed';end if;
 return jsonb_build_object('receipt',jsonb_build_object('id',u.id,'event_type','security_check','occurred_at',u.committed_at,'photo_saved',true,'location_saved',true,'replayed',true));end if;
 f:=snr_private.security_authorize_action(p_flow_id,p_identity_id,p_action,'check');
 select * into ch from snr_private.security_presence_challenges where id=(p_action->>'checkId')::uuid and user_id=f.user_id and employee_id=f.employee_id for share;
 if ch.id is null then raise exception using errcode='PT403',message='workforce_access_denied';end if;
 h:=encode(sha256(convert_to(p_action::text,'UTF8')),'hex');
 select * into u from snr_private.security_presence_uploads where id=(p_action->>'id')::uuid;
 if u.id is not null then
 if u.user_id<>f.user_id or u.action_hash<>h then raise exception using errcode='PT409',message='attendance_request_changed';end if;
 if u.committed_at is not null then return jsonb_build_object('receipt',jsonb_build_object('id',u.id,'event_type','security_check','occurred_at',u.committed_at,'photo_saved',true,'location_saved',true,'replayed',true));end if;
 else
 if ch.due_at>stamp or ch.expires_at<=stamp then raise exception using errcode='PT409',message='security_check_expired';end if;
 select * into ev from public.attendance_events where employee_id=f.employee_id and organization_id=f.organization_id order by sequence_no desc limit 1;
 if ev.id is distinct from ch.session_id or ev.event_type<>'clock_in' then raise exception using errcode='PT409',message='attendance_changed';end if;
 fix:=public.security_attendance_location(f.id,f.employee_id,'clock_out',ev.id,p_action->'location');
 photo:=p_action#>'{evidence,photo}';
 begin jpeg:=decode(photo->>'jpeg_base64','base64');exception when others then raise exception using errcode='PT422',message='invalid_attendance_photo';end;
 if photo->>'captured_at' is null or not isfinite((photo->>'captured_at')::timestamptz) or not coalesce(snr_private.valid_attendance_jpeg(jpeg),false) or photo->>'consent_version' is distinct from 'attendance-photo-location-v1'
 or (photo->>'captured_at')::timestamptz<greatest(ch.due_at,stamp-interval '30 seconds')
 or (photo->>'captured_at')::timestamptz>stamp+interval '5 seconds'
 or abs(extract(epoch from((photo->>'captured_at')::timestamptz-(p_action#>>'{location,captured_at}')::timestamptz)))>10 then
 raise exception using errcode='PT422',message='invalid_attendance_photo';end if;
 insert into snr_private.security_presence_uploads(id,challenge_id,organization_id,employee_id,user_id,flow_id,auth_session,identity_id,action_hash,sha256,byte_size,object_path,payload)
 values((p_action->>'id')::uuid,ch.id,f.organization_id,f.employee_id,f.user_id,f.id,f.auth_session,p_identity_id,h,encode(sha256(jpeg),'hex'),octet_length(jpeg),
 snr_private.attendance_photo_object_path((select display_name from public.employee_profiles where id=f.employee_id),stamp,ev.timezone,(p_action->>'id')::uuid),p_action) returning * into u;
 end if;
 return jsonb_build_object('intent_id',u.id,'user_id',u.user_id,'bucket_id',u.bucket_id,'object_path',u.object_path,'sha256',u.sha256);
end $$;
create function public.verify_security_presence_upload(p_intent_id uuid,p_sha256 text) returns void
language plpgsql security definer set search_path='' as $$
declare u snr_private.security_presence_uploads;
begin
 select * into u from snr_private.security_presence_uploads where id=p_intent_id for update;
 if u.id is null or u.sha256 is distinct from p_sha256 or not exists(select 1 from storage.objects where bucket_id=u.bucket_id and name=u.object_path
 and (metadata->>'size')::bigint=u.byte_size and metadata->>'mimetype'='image/jpeg') then
 raise exception using errcode='PT409',message='attendance_photo_not_uploaded';end if;
 update snr_private.security_presence_uploads set verified_at=coalesce(verified_at,clock_timestamp()) where id=u.id;
end $$;
create function public.commit_security_presence(p_flow_id uuid,p_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare f snr_private.security_attendance_flows;u snr_private.security_presence_uploads;ch snr_private.security_presence_challenges;ev public.attendance_events;fix jsonb;
begin
 f:=snr_private.security_flow(p_flow_id);
 select * into u from snr_private.security_presence_uploads where id=p_id and user_id=f.user_id and flow_id=f.id and auth_session=f.auth_session for update;
 if u.id is null then raise exception using errcode='PT403',message='workforce_access_denied';end if;
 if u.committed_at is null then
 select * into ch from snr_private.security_presence_challenges where id=u.challenge_id for share;
 if ch.expires_at<=clock_timestamp() then raise exception using errcode='PT409',message='security_check_expired';end if;
 if u.verified_at is null then raise exception using errcode='PT409',message='attendance_photo_not_uploaded';end if;
 select * into ev from public.attendance_events where organization_id=f.organization_id and employee_id=f.employee_id order by sequence_no desc limit 1;
 if ev.id is distinct from ch.session_id then raise exception using errcode='PT409',message='attendance_changed';end if;
 if not exists(select 1 from snr_private.security_identity_challenges ic join snr_private.security_attendance_credentials c on c.id=ic.credential_id
 where ic.id=u.identity_id and ic.flow_id=f.id and ic.user_id=f.user_id and ic.action_hash=u.action_hash and ic.verified_at is not null and ic.expires_at>clock_timestamp()
 and c.version=ic.credential_version and c.approved_at is not null and c.revoked_at is null) then
 raise exception using errcode='PT403',message='attendance_passkey_required';end if;
 fix:=public.security_attendance_location(f.id,f.employee_id,'clock_out',ev.id,u.payload->'location');
 fix:=fix||(select jsonb_build_object('area_version',version,'store_latitude',latitude,'store_longitude',longitude) from snr_private.site_attendance_areas where organization_id=f.organization_id and site_id=ev.site_id);
 insert into snr_private.security_presence_evidence(challenge_id,request_id,identity_id,organization_id,employee_id,user_id,session_id,bucket_id,object_path,sha256,captured_at,location,store_check)
 values(ch.id,u.id,u.identity_id,f.organization_id,f.employee_id,f.user_id,ev.id,u.bucket_id,u.object_path,u.sha256,(u.payload#>>'{evidence,photo,captured_at}')::timestamptz,u.payload->'location',fix);
 update snr_private.security_presence_uploads set committed_at=clock_timestamp() where id=u.id returning * into u;
 perform snr_private.workforce_audit(f.organization_id,'attendance.security_check.completed','security_check',ch.id);
 end if;
 return jsonb_build_object('id',u.id,'event_type','security_check','occurred_at',u.committed_at,'photo_saved',true,'location_saved',true,'replayed',true);
end $$;

create function snr_private.can_read_security_photo(bucket text,path text) returns boolean
language plpgsql security definer stable set search_path='' as $$
declare ctx public.organization_memberships;
begin
 if bucket<>'attendance-security-checks' or auth.uid() is null then return false;end if;
 ctx:=snr_private.workforce_context(false);
 return exists(select 1 from snr_private.security_presence_evidence e where e.bucket_id=bucket and e.object_path=path and e.organization_id=ctx.organization_id
 and (ctx.role='hr' or(ctx.role='employee' and e.user_id=ctx.user_id)));
end $$;
revoke all on function snr_private.can_read_security_photo(text,text) from public;
grant execute on function snr_private.can_read_security_photo(text,text) to anon,authenticated;
create policy security_photo_read on storage.objects for select to authenticated using(bucket_id='attendance-security-checks' and snr_private.can_read_security_photo(bucket_id,name));
create policy security_photo_boundary on storage.objects as restrictive for select to public using(bucket_id<>'attendance-security-checks' or snr_private.can_read_security_photo(bucket_id,name));
create policy security_photo_no_insert on storage.objects as restrictive for insert to public with check(bucket_id<>'attendance-security-checks');
create policy security_photo_no_update on storage.objects as restrictive for update to public using(bucket_id<>'attendance-security-checks') with check(bucket_id<>'attendance-security-checks');
create policy security_photo_no_delete on storage.objects as restrictive for delete to public using(bucket_id<>'attendance-security-checks');

create function public.hr_security_presence_report(p_from date,p_to date) returns jsonb
language plpgsql security definer set search_path='' as $$
declare ctx public.organization_memberships;result jsonb;
begin
 ctx:=snr_private.workforce_context(true);
 if p_from is null or p_to is null or p_to<p_from or p_to-p_from>31 then raise exception using errcode='PT422',message='invalid_attendance_filters';end if;
 select coalesce(jsonb_agg(row_data order by due_at desc),'[]') into result from (
 select ch.due_at,jsonb_build_object('id',ch.id,'employee_id',ch.employee_id,'display_name',e.display_name,'slot',ch.slot,'due_at',ch.due_at,'expires_at',ch.expires_at,
 'status',case when proof.challenge_id is not null then 'completed' when closed.occurred_at<ch.due_at then 'cancelled' when closed.id is not null or ch.expires_at<=clock_timestamp() then 'missed' else 'pending' end,
 'photo',case when proof.challenge_id is null then null else jsonb_build_object('bucket_id',proof.bucket_id,'object_path',proof.object_path,'captured_at',proof.captured_at) end) as row_data
 from snr_private.security_presence_challenges ch join public.employee_profiles e on e.id=ch.employee_id
 left join snr_private.security_presence_evidence proof on proof.challenge_id=ch.id
 left join public.attendance_events closed on closed.session_id=ch.session_id and closed.event_type='clock_out'
 where ch.organization_id=ctx.organization_id and ch.due_at>=(p_from::timestamp at time zone 'UTC') and ch.due_at<((p_to+1)::timestamp at time zone 'UTC')
 order by ch.due_at desc limit 500) bounded;
 perform snr_private.workforce_audit(ctx.organization_id,'attendance.security_checks.viewed','organization',ctx.organization_id);
 return jsonb_build_object('rows',result,'limit',500);
end $$;

create function public.security_presence_details(p_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare ctx public.organization_memberships;proof snr_private.security_presence_evidence;
begin
 ctx:=snr_private.workforce_context(false);
 select * into proof from snr_private.security_presence_evidence where challenge_id=p_id and organization_id=ctx.organization_id
 and (ctx.role='hr' or(ctx.role='employee' and user_id=ctx.user_id));
 if proof.challenge_id is null then raise exception using errcode='PT404',message='record_unavailable';end if;
 perform snr_private.workforce_audit(ctx.organization_id,'attendance.security_photo.viewed','security_check',p_id);
 return jsonb_build_object('bucket_id',proof.bucket_id,'object_path',proof.object_path,'captured_at',proof.captured_at,'recorded_at',proof.recorded_at,
 'distance_meters',proof.store_check->'distance_meters','radius_meters',proof.store_check->'radius_meters');
end $$;

-- New security functions are narrow JWT-scoped RPCs; helpers remain private.
do $$ declare f record;begin
 for f in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='snr_private' and (p.proname like 'security_%' or p.proname in('prepare_photo_before_security','record_storage_before_security')) loop
 execute format('revoke all on function %s from public,anon,authenticated',f.signature);
 end loop;
 for f in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and (p.proname like 'security_%' or p.proname in('hr_security_attendance','hr_security_presence_report','prepare_security_attendance_photo','prepare_security_presence_photo','commit_security_presence')) loop
 execute format('revoke all on function %s from public,anon',f.signature);
 execute format('grant execute on function %s to authenticated',f.signature);
 end loop;
end $$;
revoke all on function public.complete_security_identity(uuid,uuid,jsonb,bigint),public.verify_security_presence_upload(uuid,text) from public,anon,authenticated;
grant execute on function public.complete_security_identity(uuid,uuid,jsonb,bigint),public.verify_security_presence_upload(uuid,text) to service_role;
commit;
