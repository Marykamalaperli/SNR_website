-- Optional shared-device attendance, with two independently authenticated people.
-- Apply after 0014. Personal passkeys and existing evidence remain unchanged.
begin;

-- The service-role JWT has no employee sub. Attribute the existing registration
-- audit to the Auth-verified subject supplied by the gateway, then restore claims.
alter function public.complete_security_identity(uuid,uuid,jsonb,bigint) set schema snr_private;
alter function snr_private.complete_security_identity(uuid,uuid,jsonb,bigint) rename to complete_identity_before_service_actor;
create function public.complete_security_identity(p_id uuid,p_user_id uuid,p_registration jsonb default null,p_counter bigint default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare claims text:=current_setting('request.jwt.claims',true);result jsonb;
begin
 perform set_config('request.jwt.claims',(coalesce(nullif(claims,'')::jsonb,'{}')||jsonb_build_object('sub',p_user_id))::text,true);
 result:=snr_private.complete_identity_before_service_actor(p_id,p_user_id,p_registration,p_counter);
 perform set_config('request.jwt.claims',coalesce(claims,''),true);
 return result;
exception when others then
 perform set_config('request.jwt.claims',coalesce(claims,''),true);
 raise;
end $$;
revoke all on function snr_private.complete_identity_before_service_actor(uuid,uuid,jsonb,bigint) from public,anon,authenticated,service_role;
revoke all on function public.complete_security_identity(uuid,uuid,jsonb,bigint) from public,anon,authenticated;
grant execute on function public.complete_security_identity(uuid,uuid,jsonb,bigint) to service_role;

create table snr_private.security_station_operators (
 employee_id uuid primary key references public.employee_profiles(id),organization_id uuid not null,
 site_id uuid not null references public.sites(id),enabled boolean not null default false,version integer not null default 1
);
create table snr_private.security_station_visits (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,
 operator_employee_id uuid not null,operator_user_id uuid not null,operator_flow_id uuid not null,
 operator_auth_session uuid not null,operator_version integer not null,
 employee_id uuid not null,user_id uuid not null,flow_id uuid not null,auth_session uuid not null,
 site_id uuid not null,created_at timestamptz not null default clock_timestamp(),
 expires_at timestamptz not null default clock_timestamp()+interval '5 minutes',finished_at timestamptz,
 check(operator_user_id<>user_id),check(operator_employee_id<>employee_id)
);
create table snr_private.security_station_evidence (
 request_id uuid primary key,organization_id uuid not null,employee_id uuid not null,user_id uuid not null,
 visit_id uuid not null unique references snr_private.security_station_visits(id),
 operator_employee_id uuid not null,operator_user_id uuid not null,operator_name text not null,
 identity_id uuid not null unique references snr_private.security_identity_challenges(id),
 recorded_at timestamptz not null default clock_timestamp()
);
create index security_station_operator_recent on snr_private.security_station_visits(operator_employee_id,created_at desc);
create index security_station_operator_flow on snr_private.security_station_visits(operator_flow_id,operator_user_id);
create index security_station_current_checks on snr_private.security_presence_challenges(organization_id,expires_at,due_at);
create trigger security_station_evidence_immutable before update or delete on snr_private.security_station_evidence
 for each row execute function snr_private.reject_history_mutation();
alter table snr_private.security_identity_challenges drop constraint security_identity_challenges_kind_check;
alter table snr_private.security_identity_challenges add constraint security_identity_challenges_kind_check check(kind in('register','punch','check','station'));
alter table snr_private.security_identity_challenges add column station_visit_id uuid references snr_private.security_station_visits(id);
do $$ declare tbl text;begin
 foreach tbl in array array['security_station_operators','security_station_visits','security_station_evidence'] loop
 execute format('alter table snr_private.%I enable row level security',tbl);
 execute format('revoke all on snr_private.%I from public,anon,authenticated',tbl);
 end loop;
end $$;

create function public.hr_attendance_station(p_employee_id uuid,p_enabled boolean default null,p_version integer default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare ctx public.organization_memberships;e public.employee_profiles;o snr_private.security_station_operators;
begin
 ctx:=snr_private.employee_qr_context(true);
 select * into e from public.employee_profiles where id=p_employee_id and organization_id=ctx.organization_id and active
 and exists(select 1 from public.organization_memberships m where m.organization_id=ctx.organization_id and m.user_id=employee_profiles.user_id and m.role='employee' and m.active) for share;
 if e.id is null then raise exception using errcode='PT404',message='record_unavailable';end if;
 select * into o from snr_private.security_station_operators where employee_id=e.id for update;
 if p_enabled is not null then
 if coalesce(o.version,0) is distinct from p_version then raise exception using errcode='PT409',message='record_changed';end if;
 if p_enabled and (e.site_id is null or not exists(select 1 from public.sites where id=e.site_id and organization_id=e.organization_id and active)
 or not exists(select 1 from snr_private.security_attendance_credentials where employee_id=e.id and approved_at is not null and revoked_at is null)) then
 raise exception using errcode='PT409',message='station_operator_setup_required';end if;
 insert into snr_private.security_station_operators(employee_id,organization_id,site_id,enabled)
 values(e.id,e.organization_id,e.site_id,p_enabled) on conflict(employee_id) do update set site_id=excluded.site_id,enabled=excluded.enabled,version=security_station_operators.version+1 returning * into o;
 update snr_private.security_station_visits set expires_at=least(expires_at,clock_timestamp()) where operator_employee_id=e.id and finished_at is null;
 perform snr_private.workforce_audit(ctx.organization_id,case when p_enabled then 'attendance.station_operator.enabled' else 'attendance.station_operator.disabled' end,'employee',e.id);
 end if;
 return jsonb_build_object('enabled',coalesce(o.enabled,false) and o.site_id=e.site_id,'version',coalesce(o.version,0),'site_name',(select name from public.sites where id=e.site_id));
end $$;

-- Employee claims come from a caller-JWT RPC, never from an employee selector.
create function public.security_station_employee_context(p_flow_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare f snr_private.security_attendance_flows;
begin
 f:=snr_private.security_flow(p_flow_id);
 return jsonb_build_object('flow_id',f.id,'user_id',f.user_id,'employee_number',(select employee_number from public.employee_profiles where id=f.employee_id));
end $$;
create function public.security_station_context(p_flow_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare f snr_private.security_attendance_flows;e public.employee_profiles;o snr_private.security_station_operators;ctx jsonb;
begin
 f:=snr_private.security_flow(p_flow_id);select * into e from public.employee_profiles where id=f.employee_id;
 select * into o from snr_private.security_station_operators where employee_id=e.id and organization_id=e.organization_id and site_id=e.site_id and enabled for share;
 if o.employee_id is null or not exists(select 1 from public.sites where id=o.site_id and active) then raise exception using errcode='PT403',message='station_operator_required';end if;
 ctx:=public.security_identity_context(f.id);
 if ctx->'credential' is null or ctx->'credential'='null'::jsonb then raise exception using errcode='PT403',message='attendance_passkey_required';end if;
 return ctx||jsonb_build_object('flow_id',f.id,'site_id',o.site_id,'site_name',(select name from public.sites where id=o.site_id));
end $$;

-- Derive the site from the latest open session, including an overnight session.
create function snr_private.security_station_site(p_employee_id uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare ev public.attendance_events;
begin
 select * into ev from public.attendance_events where employee_id=p_employee_id order by sequence_no desc limit 1;
 if ev.event_type='clock_in' then return ev.site_id;end if;
 return (select site_id from public.employee_profiles where id=p_employee_id);
end $$;

create function snr_private.security_station_visit(p_id uuid) returns snr_private.security_station_visits
language plpgsql security definer set search_path='' as $$
declare v snr_private.security_station_visits;
begin
 select * into v from snr_private.security_station_visits where id=p_id;
 if v.id is null then raise exception using errcode='PT403',message='station_visit_required';end if;
 perform pg_advisory_xact_lock(hashtextextended('workforce-people:'||v.organization_id::text,0));
 select * into v from snr_private.security_station_visits where id=p_id for update;
 if v.expires_at<=clock_timestamp() or v.finished_at is not null
 or not exists(select 1 from snr_private.security_attendance_flows where employee_id=v.employee_id and id=v.flow_id and user_id=v.user_id and auth_session=v.auth_session and expires_at>clock_timestamp())
 or not exists(select 1 from snr_private.security_attendance_flows where employee_id=v.operator_employee_id and id=v.operator_flow_id and user_id=v.operator_user_id and auth_session=v.operator_auth_session and expires_at>clock_timestamp())
 or not exists(select 1 from snr_private.security_station_operators o join public.employee_profiles e on e.id=o.employee_id
 join public.organization_memberships m on m.organization_id=e.organization_id and m.user_id=e.user_id join auth.users u on u.id=e.user_id
 join public.sites s on s.id=o.site_id and s.organization_id=o.organization_id
 where o.employee_id=v.operator_employee_id and o.organization_id=v.organization_id and o.site_id=v.site_id and o.version=v.operator_version and o.enabled
 and e.active and e.site_id=o.site_id and e.user_id=v.operator_user_id and m.active and m.role='employee' and s.active
 and u.email_confirmed_at is not null and (to_jsonb(u)->>'deleted_at') is null and coalesce((to_jsonb(u)->>'banned_until')::timestamptz,'-infinity'::timestamptz)<=clock_timestamp())
 or not exists(select 1 from public.employee_profiles e join public.organization_memberships m on m.organization_id=e.organization_id and m.user_id=e.user_id join auth.users u on u.id=e.user_id
 where e.id=v.employee_id and e.organization_id=v.organization_id and e.user_id=v.user_id and e.active and m.active and m.role='employee'
 and u.email_confirmed_at is not null and (to_jsonb(u)->>'deleted_at') is null and coalesce((to_jsonb(u)->>'banned_until')::timestamptz,'-infinity'::timestamptz)<=clock_timestamp())
 or snr_private.security_station_site(v.employee_id) is distinct from v.site_id then
 raise exception using errcode='PT403',message='station_visit_required';end if;
 return v;
end $$;

-- Only the gateway, after verifying both JWTs with Auth and the scoped context
-- RPCs above, can open a visit. Neither a browser ID nor the QR grants authority.
create function public.open_security_station_visit(p_operator_flow_id uuid,p_operator_user_id uuid,p_employee_flow_id uuid,p_employee_user_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare g snr_private.security_attendance_flows;f snr_private.security_attendance_flows;o snr_private.security_station_operators;v snr_private.security_station_visits;
begin
 select * into g from snr_private.security_attendance_flows where id=p_operator_flow_id and user_id=p_operator_user_id and expires_at>clock_timestamp();
 select * into f from snr_private.security_attendance_flows where id=p_employee_flow_id and user_id=p_employee_user_id and expires_at>clock_timestamp();
 if g.id is null or f.id is null or g.organization_id<>f.organization_id or g.user_id=f.user_id then raise exception using errcode='PT403',message='station_different_employee_required';end if;
 perform pg_advisory_xact_lock(hashtextextended('workforce-people:'||g.organization_id::text,0));
 select * into o from snr_private.security_station_operators where employee_id=g.employee_id and enabled;
 if o.employee_id is null then raise exception using errcode='PT403',message='station_operator_required';end if;
 select * into v from snr_private.security_station_visits where operator_employee_id=g.employee_id and expires_at>clock_timestamp() and finished_at is null;
 if v.id is not null and v.operator_flow_id=g.id and v.flow_id=f.id and v.auth_session=f.auth_session then
 v:=snr_private.security_station_visit(v.id);
 return jsonb_build_object('visit_id',v.id,'expires_at',v.expires_at);end if;
 if (select count(*) from snr_private.security_station_visits where operator_employee_id=g.employee_id and created_at>clock_timestamp()-interval '1 minute')>=6 then
 raise exception using errcode='PT429',message='attendance_photo_rate_limit';end if;
 if exists(select 1 from snr_private.security_station_visits where operator_employee_id=g.employee_id and expires_at>clock_timestamp() and finished_at is null) then
 raise exception using errcode='PT409',message='station_busy';end if;
 insert into snr_private.security_station_visits(organization_id,operator_employee_id,operator_user_id,operator_flow_id,operator_auth_session,operator_version,employee_id,user_id,flow_id,auth_session,site_id)
 values(g.organization_id,g.employee_id,g.user_id,g.id,g.auth_session,o.version,f.employee_id,f.user_id,f.id,f.auth_session,o.site_id) returning * into v;
 v:=snr_private.security_station_visit(v.id);
 insert into public.audit_events(organization_id,actor_user_id,action,subject_type,subject_id,request_id)
 values(v.organization_id,v.operator_user_id,'attendance.station_visit.opened','employee',v.employee_id,gen_random_uuid()::text);
 return jsonb_build_object('visit_id',v.id,'expires_at',v.expires_at);
end $$;

create function public.security_station_close(p_flow_id uuid,p_visit_id uuid default null) returns void
language plpgsql security definer set search_path='' as $$
declare f snr_private.security_attendance_flows;v snr_private.security_station_visits;
begin
 f:=snr_private.security_flow(p_flow_id);
 for v in select * from snr_private.security_station_visits where (p_visit_id is null or id=p_visit_id) and operator_user_id=f.user_id and operator_flow_id=f.id for update loop
 update snr_private.security_station_visits set expires_at=least(expires_at,clock_timestamp()) where id=v.id;
 update snr_private.security_attendance_flows set expires_at=least(expires_at,clock_timestamp()) where id=v.flow_id;
 end loop;
end $$;

create function public.security_begin_station_identity(p_flow_id uuid,p_visit_id uuid,p_rp_id text,p_action jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare ctx jsonb;v snr_private.security_station_visits;c snr_private.security_attendance_credentials;ch snr_private.security_identity_challenges;expiry timestamptz;
begin
 ctx:=public.security_station_context(p_flow_id);v:=snr_private.security_station_visit(p_visit_id);
 if v.operator_flow_id<>p_flow_id or v.operator_user_id<>auth.uid() or p_action is null or length(p_action::text)>215000
 or p_action->>'employeeId' is distinct from v.employee_id::text or coalesce(p_action->>'type','') not in('clock_in','clock_out','security_check')
 or p_rp_id is distinct from ctx#>>'{credential,rp_id}' then raise exception using errcode='PT403',message='station_visit_required';end if;
 if (select count(*) from snr_private.security_identity_challenges where credential_id=ctx#>>'{credential,id}' and created_at>clock_timestamp()-interval '1 minute')>=12 then
 raise exception using errcode='PT429',message='attendance_photo_rate_limit';end if;
 select * into c from snr_private.security_attendance_credentials where id=ctx#>>'{credential,id}' for share;
 expiry:=least(v.expires_at,clock_timestamp()+interval '2 minutes');
 if p_action->>'type'='security_check' then
 select least(expiry,expires_at) into expiry from snr_private.security_presence_challenges where id=(p_action->>'checkId')::uuid and employee_id=v.employee_id and due_at<=clock_timestamp();
 if expiry is null or expiry<=clock_timestamp() then raise exception using errcode='PT409',message='security_check_expired';end if;
 end if;
 insert into snr_private.security_identity_challenges(organization_id,employee_id,user_id,flow_id,auth_session,kind,challenge,rp_id,action_hash,credential_id,credential_version,expires_at,station_visit_id)
 values(v.organization_id,v.employee_id,v.user_id,v.flow_id,v.auth_session,'station',
 rtrim(translate(encode(uuid_send(gen_random_uuid())||uuid_send(gen_random_uuid()),'base64'),'+/','-_'),'='),p_rp_id,
 encode(sha256(convert_to(p_action::text,'UTF8')),'hex'),c.id,c.version,expiry,v.id) returning * into ch;
 return jsonb_build_object('id',ch.id,'expires_at',ch.expires_at,'challenge',ch.challenge);
end $$;

create function public.security_station_identity_challenge(p_flow_id uuid,p_visit_id uuid,p_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare ctx jsonb;v snr_private.security_station_visits;ch snr_private.security_identity_challenges;
begin
 ctx:=public.security_station_context(p_flow_id);v:=snr_private.security_station_visit(p_visit_id);
 if v.operator_flow_id<>p_flow_id or v.operator_user_id<>auth.uid() then raise exception using errcode='PT403',message='station_visit_required';end if;
 select * into ch from snr_private.security_identity_challenges where id=p_id and station_visit_id=v.id and kind='station' and expires_at>clock_timestamp() and verified_at is null and consumed_at is null;
 if ch.id is null or ch.credential_id is distinct from ctx#>>'{credential,id}' then raise exception using errcode='PT403',message='attendance_passkey_required';end if;
 return ctx||jsonb_build_object('id',ch.id,'kind','station','challenge',ch.challenge,'rp_id',ch.rp_id);
end $$;

create function public.complete_security_station_identity(p_id uuid,p_user_id uuid,p_counter bigint) returns jsonb
language plpgsql security definer set search_path='' as $$
declare ch snr_private.security_identity_challenges;v snr_private.security_station_visits;c snr_private.security_attendance_credentials;
begin
 select * into ch from snr_private.security_identity_challenges where id=p_id and kind='station';
 v:=snr_private.security_station_visit(ch.station_visit_id);
 select * into ch from snr_private.security_identity_challenges where id=p_id for update;
 select * into c from snr_private.security_attendance_credentials where id=ch.credential_id and employee_id=v.operator_employee_id and user_id=p_user_id and approved_at is not null and revoked_at is null for update;
 if p_user_id is distinct from v.operator_user_id or ch.expires_at<=clock_timestamp() or ch.verified_at is not null or ch.consumed_at is not null
 or c.id is null or c.version<>ch.credential_version or p_counter is null or p_counter<0 or ((c.counter>0 or p_counter>0) and p_counter<=c.counter) then
 raise exception using errcode='PT403',message='attendance_passkey_required';end if;
 update snr_private.security_attendance_credentials set counter=p_counter where id=c.id;
 update snr_private.security_identity_challenges set verified_at=clock_timestamp() where id=ch.id;
 return jsonb_build_object('id',ch.id,'status','verified');
end $$;

-- Recheck the operator grant, both sessions, site, key version and exact photo /
-- location payload at preparation AND commit. Personal proofs keep their rules.
create function snr_private.security_station_proof(p_id uuid,p_employee_id uuid,p_flow_id uuid,p_hash text) returns snr_private.security_station_visits
language plpgsql security definer set search_path='' as $$
declare v snr_private.security_station_visits;ch snr_private.security_identity_challenges;
begin
 select * into ch from snr_private.security_identity_challenges where id=p_id and kind='station' and employee_id=p_employee_id and flow_id=p_flow_id;
 v:=snr_private.security_station_visit(ch.station_visit_id);
 if ch.user_id is distinct from auth.uid() or ch.auth_session is distinct from snr_private.security_auth_session()
 or ch.verified_at is null or ch.expires_at<=clock_timestamp() or ch.action_hash is distinct from p_hash
 or not exists(select 1 from snr_private.security_attendance_credentials where id=ch.credential_id and employee_id=v.operator_employee_id and user_id=v.operator_user_id
 and version=ch.credential_version and approved_at is not null and revoked_at is null) then
 raise exception using errcode='PT403',message='attendance_passkey_required';end if;
 return v;
end $$;
alter function snr_private.security_authorize_action(uuid,uuid,jsonb,text) rename to security_authorize_personal_action;
create function snr_private.security_authorize_action(p_flow_id uuid,p_identity_id uuid,p_action jsonb,p_kind text) returns snr_private.security_attendance_flows
language plpgsql security definer set search_path='' as $$
declare f snr_private.security_attendance_flows;ch snr_private.security_identity_challenges;h text;
begin
 if not exists(select 1 from snr_private.security_identity_challenges where id=p_identity_id and kind='station') then
 return snr_private.security_authorize_personal_action(p_flow_id,p_identity_id,p_action,p_kind);end if;
 f:=snr_private.security_flow(p_flow_id);h:=encode(sha256(convert_to(p_action::text,'UTF8')),'hex');
 perform snr_private.security_station_proof(p_identity_id,f.employee_id,f.id,h);
 if p_action->>'employeeId' is distinct from f.employee_id::text
 or (p_kind='punch' and coalesce(p_action->>'type','') not in('clock_in','clock_out')) or (p_kind='check' and p_action->>'type' is distinct from 'security_check') then
 raise exception using errcode='PT403',message='workforce_access_denied';end if;
 select * into ch from snr_private.security_identity_challenges where id=p_identity_id for update;
 if ch.consumed_at is not null and not exists(select 1 from snr_private.security_punch_permits where id=(p_action->>'id')::uuid and identity_id=ch.id and action_hash=h)
 and not exists(select 1 from snr_private.security_presence_uploads where id=(p_action->>'id')::uuid and identity_id=ch.id and action_hash=h) then
 raise exception using errcode='PT409',message='attendance_request_changed';end if;
 update snr_private.security_identity_challenges set consumed_at=coalesce(consumed_at,clock_timestamp()) where id=ch.id;
 return f;
end $$;

create function snr_private.security_station_record(p_id uuid,p_identity_id uuid,p_employee_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare ch snr_private.security_identity_challenges;v snr_private.security_station_visits;
begin
 select * into ch from snr_private.security_identity_challenges where id=p_identity_id and kind='station';
 if ch.id is null then return;end if;
 select * into v from snr_private.security_station_visits where id=ch.station_visit_id;
 insert into snr_private.security_station_evidence(request_id,organization_id,employee_id,user_id,visit_id,operator_employee_id,operator_user_id,operator_name,identity_id)
 values(p_id,v.organization_id,p_employee_id,v.user_id,v.id,v.operator_employee_id,v.operator_user_id,(select display_name from public.employee_profiles where id=v.operator_employee_id),ch.id);
 update snr_private.security_station_visits set finished_at=clock_timestamp() where id=v.id;
 perform snr_private.workforce_audit(v.organization_id,'attendance.station.recorded','employee',p_employee_id);
end $$;
alter function public.record_attendance_storage(uuid,uuid) set schema snr_private;
alter function snr_private.record_attendance_storage(uuid,uuid) rename to record_storage_personal_security;
create function public.record_attendance_storage(p_request_id uuid,p_employee_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare e public.employee_profiles;p snr_private.security_punch_permits;receipt jsonb;fresh boolean;
begin
 e:=snr_private.security_employee();
 select * into p from snr_private.security_punch_permits where id=p_request_id and employee_id=e.id and user_id=e.user_id;
 fresh:=not exists(select 1 from snr_private.attendance_photo_uploads where id=p_request_id and event_id is not null);
 if fresh and exists(select 1 from snr_private.security_identity_challenges where id=p.identity_id and kind='station') then
 perform snr_private.security_station_proof(p.identity_id,e.id,p.flow_id,p.action_hash);end if;
 receipt:=snr_private.record_storage_personal_security(p_request_id,p_employee_id);
 if fresh then perform snr_private.security_station_record(p_request_id,p.identity_id,e.id);end if;
 return receipt;
end $$;
alter function public.commit_security_presence(uuid,uuid) set schema snr_private;
alter function snr_private.commit_security_presence(uuid,uuid) rename to commit_personal_security_presence;
create function public.commit_security_presence(p_flow_id uuid,p_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare f snr_private.security_attendance_flows;u snr_private.security_presence_uploads;receipt jsonb;
begin
 f:=snr_private.security_flow(p_flow_id);
 select * into u from snr_private.security_presence_uploads where id=p_id and user_id=f.user_id and flow_id=f.id;
 if u.committed_at is null and exists(select 1 from snr_private.security_identity_challenges where id=u.identity_id and kind='station') then
 perform snr_private.security_station_proof(u.identity_id,f.employee_id,f.id,u.action_hash);end if;
 receipt:=snr_private.commit_personal_security_presence(p_flow_id,p_id);
 if u.committed_at is null then perform snr_private.security_station_record(p_id,u.identity_id,f.employee_id);end if;
 return receipt;
end $$;

-- Guards see only currently due requests at their authorized site, never future
-- schedules, private photos or a staff attendance history.
create function public.security_station_due(p_flow_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare ctx jsonb;rows jsonb;
begin
 ctx:=public.security_station_context(p_flow_id);
 select coalesce(jsonb_agg(jsonb_build_object('id',ch.id,'display_name',e.display_name,'expires_at',ch.expires_at) order by ch.expires_at),'[]') into rows
 from snr_private.security_presence_challenges ch join public.employee_profiles e on e.id=ch.employee_id
 join public.organization_memberships m on m.organization_id=e.organization_id and m.user_id=e.user_id
 join public.attendance_events ev on ev.id=ch.session_id
 where ch.organization_id=(select organization_id from public.employee_profiles where id=(ctx->>'employee_id')::uuid)
 and ev.site_id=(ctx->>'site_id')::uuid and e.active and m.active and m.role='employee'
 and ch.due_at<=clock_timestamp() and ch.expires_at>clock_timestamp()
 and not exists(select 1 from snr_private.security_presence_evidence where challenge_id=ch.id)
 and not exists(select 1 from public.attendance_events where employee_id=e.id and sequence_no>ev.sequence_no);
 return jsonb_build_object('requests',rows,'server_time',clock_timestamp());
end $$;

-- Existing detail readers still authorize and audit the employee/HR access.
alter function public.attendance_location_details(uuid) set schema snr_private;
alter function snr_private.attendance_location_details(uuid) rename to location_details_before_station;
create function public.attendance_location_details(p_session_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;kind text;proof jsonb;
begin
 result:=snr_private.location_details_before_station(p_session_id);
 foreach kind in array array['clock_in','clock_out'] loop
 select jsonb_build_object('operator_name',s.operator_name,'recorded_at',s.recorded_at) into proof
 from public.attendance_events ev join snr_private.attendance_photo_uploads u on u.event_id=ev.id
 join snr_private.security_station_evidence s on s.request_id=u.id
 where ev.session_id=p_session_id and ev.event_type=kind;
 if result->kind is not null and result->kind<>'null'::jsonb and proof is not null then result:=jsonb_set(result,array[kind,'supervised_by'],proof);end if;
 end loop;
 return result;
end $$;

do $$ declare f record;begin
 for f in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='snr_private' and (p.proname like 'security_station_%' or p.proname in('security_authorize_action','security_authorize_personal_action','record_storage_personal_security','commit_personal_security_presence','location_details_before_station')) loop
 execute format('revoke all on function %s from public,anon,authenticated',f.signature);
 end loop;
 for f in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and (p.proname like 'security_station_%' or p.proname in('hr_attendance_station','security_begin_station_identity','record_attendance_storage','commit_security_presence','attendance_location_details')) loop
 execute format('revoke all on function %s from public,anon',f.signature);
 execute format('grant execute on function %s to authenticated',f.signature);
 end loop;
end $$;
revoke all on function public.open_security_station_visit(uuid,uuid,uuid,uuid),public.complete_security_station_identity(uuid,uuid,bigint) from public,anon,authenticated;
grant execute on function public.open_security_station_visit(uuid,uuid,uuid,uuid),public.complete_security_station_identity(uuid,uuid,bigint) to service_role;
commit;
