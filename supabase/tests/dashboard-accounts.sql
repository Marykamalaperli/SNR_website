-- Local only: real PostgreSQL role checks; GoTrue admin writes are simulated by owner SQL.
begin;
insert into auth.users(id,email,email_confirmed_at) values
 ('81000000-0000-4000-8000-000000000001','account-admin@example.invalid',now()),
 ('81000000-0000-4000-8000-000000000002','existing-worker@example.invalid',now()),
 ('81000000-0000-4000-8000-000000000003','other-admin@example.invalid',now()),
 ('81000000-0000-4000-8000-000000000005','account-auditor@example.invalid',now());
insert into public.organizations(id,name) values
 ('82000000-0000-4000-8000-000000000001','Account organization'),('82000000-0000-4000-8000-000000000002','Other account organization');
insert into public.organization_memberships(organization_id,user_id,role) values
 ('82000000-0000-4000-8000-000000000001','81000000-0000-4000-8000-000000000001','hr'),
 ('82000000-0000-4000-8000-000000000001','81000000-0000-4000-8000-000000000002','employee'),
 ('82000000-0000-4000-8000-000000000002','81000000-0000-4000-8000-000000000003','hr'),
 ('82000000-0000-4000-8000-000000000001','81000000-0000-4000-8000-000000000005','security_auditor');
insert into public.sites(id,organization_id,name) values ('83000000-0000-4000-8000-000000000001','82000000-0000-4000-8000-000000000001','Account site');
insert into public.departments(id,organization_id,name) values ('84000000-0000-4000-8000-000000000001','82000000-0000-4000-8000-000000000001','Account department');
insert into public.sites(id,organization_id,name) values ('83000000-0000-4000-8000-000000000002','82000000-0000-4000-8000-000000000002','Foreign site');
insert into public.departments(id,organization_id,name) values ('84000000-0000-4000-8000-000000000002','82000000-0000-4000-8000-000000000002','Foreign department');
select set_config('test.account_profile','{"display_name":"New staff member","employee_number":"ACCOUNT-1","site_id":"83000000-0000-4000-8000-000000000001","department_id":"84000000-0000-4000-8000-000000000001","role":"employee","active":true}',true);

set role anon;
do $$ begin
  begin perform public.hr_pending_staff_accounts();raise exception 'Anonymous account listing';exception when insufficient_privilege then null;end;
end $$;
set role authenticated;
select set_config('request.jwt.claims','{"sub":"81000000-0000-4000-8000-000000000002","user_metadata":{"role":"hr"}}',true);
do $$ begin
  begin perform public.hr_pending_staff_accounts();raise exception 'Employee account administration';exception when sqlstate 'PT403' then null;end;
  begin perform public.hr_begin_staff_account('85000000-0000-4000-8000-000000000001','create',null,null,null,'new-staff@example.invalid',current_setting('test.account_profile')::jsonb,repeat('a',64));
    raise exception 'Employee account creation';exception when sqlstate 'PT403' then null;end;
end $$;
select set_config('request.jwt.claims','{"sub":"81000000-0000-4000-8000-000000000001"}',true);
do $$ declare op jsonb;begin
  op:=public.hr_begin_staff_account('85000000-0000-4000-8000-000000000001','create',null,null,null,'new-staff@example.invalid',current_setting('test.account_profile')::jsonb,repeat('a',64));
  assert op->>'status'='pending';
  assert jsonb_array_length(public.hr_pending_staff_accounts())=1;
  begin perform 1 from snr_private.staff_account_operations;raise exception 'Private operation records exposed';exception when insufficient_privilege then null;end;
  begin perform public.hr_complete_staff_account('85000000-0000-4000-8000-000000000001');
    raise exception 'Unverified Auth account completed';exception when sqlstate 'PT409' then null;end;
  begin perform public.hr_begin_staff_account('85000000-0000-4000-8000-000000000001','create',null,null,null,'new-staff@example.invalid',current_setting('test.account_profile')::jsonb,repeat('b',64));
    raise exception 'Changed request reused';exception when sqlstate 'PT409' then null;end;
  begin perform public.hr_begin_staff_account('85000000-0000-4000-8000-000000000001','create',null,null,null,'new-staff@example.invalid',current_setting('test.account_profile')::jsonb,repeat('a',64));
    raise exception 'Concurrent request admitted';exception when sqlstate 'PT409' then null;end;
  begin perform public.hr_begin_staff_account('85000000-0000-4000-8000-000000000099','create',null,null,null,'other-staff@example.invalid',
    current_setting('test.account_profile')::jsonb||'{"role":"hr","password":"must-never-be-persisted"}'::jsonb,repeat('a',64));
    raise exception 'Privileged role/password payload admitted';exception when sqlstate 'PT422' then null;end;
end $$;
reset role;
\echo 'PASS: dashboard account role checks, private ledger, spoofing/replay and unverified-Auth denial'

-- Simulate successful GoTrue create; only admin Auth APIs may set app_metadata in production.
insert into auth.users(id,email,email_confirmed_at,raw_app_meta_data) values
 ('81000000-0000-4000-8000-000000000004','new-staff@example.invalid',now(),
 '{"snr_admin_operation":"85000000-0000-4000-8000-000000000001","snr_admin_actor":"81000000-0000-4000-8000-000000000001","snr_admin_organization":"82000000-0000-4000-8000-000000000001"}');
set role authenticated;
select set_config('request.jwt.claims','{"sub":"81000000-0000-4000-8000-000000000003"}',true);
do $$ begin
  begin perform public.hr_begin_staff_account('85000000-0000-4000-8000-000000000098','link',null,null,null,'new-staff@example.invalid',
    '{"display_name":"Foreign claimant","employee_number":"FOREIGN-1","site_id":"83000000-0000-4000-8000-000000000002","department_id":"84000000-0000-4000-8000-000000000002","role":"employee","active":true}',repeat('a',64));
    raise exception 'Foreign HR captured an account before its profile completed';exception when sqlstate 'PT409' then null;end;
end $$;
select set_config('request.jwt.claims','{"sub":"81000000-0000-4000-8000-000000000001"}',true);
do $$ declare result jsonb;begin
  result:=public.hr_recover_staff_account('85000000-0000-4000-8000-000000000001');
  assert result->>'status'='completed';
  assert public.workforce_directory()->>'total'='1';
  assert jsonb_array_length(public.hr_pending_staff_accounts())=0;
  assert public.hr_complete_staff_account('85000000-0000-4000-8000-000000000001')->>'status'='completed';
  assert public.hr_begin_staff_account('85000000-0000-4000-8000-000000000001','create',null,null,null,'new-staff@example.invalid',current_setting('test.account_profile')::jsonb,repeat('a',64))->>'status'='completed';
end $$;
reset role;
do $$ begin assert (select count(*) from public.audit_events)=3;assert (select count(*) from public.employee_profiles)=1;end $$;
\echo 'PASS: interrupted account creation recovers one profile and audited completion; retries are idempotent'

select set_config('test.employee_id',(select id::text from public.employee_profiles where employee_number='ACCOUNT-1'),true);
set role authenticated;
select set_config('request.jwt.claims','{"sub":"81000000-0000-4000-8000-000000000001"}',true);
do $$ declare op jsonb;begin
  op:=public.hr_begin_staff_account('85000000-0000-4000-8000-000000000002','credentials',current_setting('test.employee_id')::uuid,1,1,'updated-staff@example.invalid','{}',repeat('b',64));
  assert op->>'profile_version'='2';
  assert public.hr_staff_account_context('85000000-0000-4000-8000-000000000002',(op->>'lease_token')::uuid)->>'account_user_id'='81000000-0000-4000-8000-000000000004';
  begin perform public.hr_save_employee(current_setting('test.employee_id')::uuid,2,1,null,'Competing edit','ACCOUNT-1',
    '83000000-0000-4000-8000-000000000001','84000000-0000-4000-8000-000000000001','employee',true);
    raise exception 'Profile changed during pending account request';exception when sqlstate 'PT409' then null;end;
end $$;
select set_config('request.jwt.claims','{"sub":"81000000-0000-4000-8000-000000000003"}',true);
do $$ begin
  begin perform public.hr_complete_staff_account('85000000-0000-4000-8000-000000000002');raise exception 'Cross-tenant completion';exception when sqlstate 'PT404' then null;end;
  begin perform public.hr_begin_staff_account('85000000-0000-4000-8000-000000000003','credentials',current_setting('test.employee_id')::uuid,2,1,'stolen@example.invalid','{}',repeat('c',64));
    raise exception 'Cross-tenant account update';exception when sqlstate 'PT404' then null;end;
end $$;
reset role;
do $$ begin
  begin update public.organization_memberships set role='hr' where user_id='81000000-0000-4000-8000-000000000004';
    raise exception 'Account promoted during credential request';exception when sqlstate 'PT409' then null;end;
  begin delete from public.organization_memberships where user_id='81000000-0000-4000-8000-000000000004';
    raise exception 'Account relationship removed during credential request';exception when sqlstate 'PT409' then null;end;
end $$;
update auth.users set email='updated-staff@example.invalid',raw_app_meta_data=jsonb_set(raw_app_meta_data,'{snr_admin_operation}','"85000000-0000-4000-8000-000000000002"')
  where id='81000000-0000-4000-8000-000000000004';
set role authenticated;
select set_config('request.jwt.claims','{"sub":"81000000-0000-4000-8000-000000000001"}',true);
do $$ begin
  assert public.hr_complete_staff_account('85000000-0000-4000-8000-000000000002')->>'status'='completed';
  assert public.workforce_directory()->'rows'->0->>'email'='updated-staff@example.invalid';
  assert public.workforce_directory()->'rows'->0->>'version'='2';
  begin perform public.hr_begin_staff_account('85000000-0000-4000-8000-000000000003','credentials',current_setting('test.employee_id')::uuid,1,1,'stale@example.invalid','{}',repeat('c',64));
    raise exception 'Stale credential update';exception when sqlstate 'PT409' then null;end;
  perform public.hr_begin_staff_account('85000000-0000-4000-8000-000000000004','credentials',current_setting('test.employee_id')::uuid,2,1,'not-applied@example.invalid','{}',repeat('d',64));
  begin perform public.hr_recover_staff_account('85000000-0000-4000-8000-000000000004');
    raise exception 'In-flight request falsely closed';exception when sqlstate 'PT409' then null;end;
end $$;
reset role;
update snr_private.staff_account_operations set lease_until=clock_timestamp()-interval '1 second' where id='85000000-0000-4000-8000-000000000004';
set role authenticated;
select set_config('request.jwt.claims','{"sub":"81000000-0000-4000-8000-000000000001"}',true);
do $$ declare result jsonb;op jsonb;begin
  result:=public.hr_recover_staff_account('85000000-0000-4000-8000-000000000004');
  assert result->>'status'='failed';assert result->>'profile_version'='3';
  assert public.workforce_directory()->'rows'->0->>'email'='updated-staff@example.invalid';
  op:=public.hr_begin_staff_account('85000000-0000-4000-8000-000000000005','credentials',current_setting('test.employee_id')::uuid,3,1,'rejected@example.invalid','{}',repeat('e',64));
  assert public.hr_close_staff_account('85000000-0000-4000-8000-000000000005',(op->>'lease_token')::uuid)->>'status'='failed';
end $$;
reset role;
\echo 'PASS: scoped credential edits, reserved snapshots, email reads, interrupted recovery and safe request closure'

insert into auth.users(id,email) values ('81000000-0000-4000-8000-000000000006','legacy-unconfirmed@example.invalid');
set role authenticated;
select set_config('request.jwt.claims','{"sub":"81000000-0000-4000-8000-000000000001"}',true);
do $$ declare op jsonb;begin
  op:=public.hr_begin_staff_account('85000000-0000-4000-8000-000000000006','link',null,null,null,'legacy-unconfirmed@example.invalid',
    current_setting('test.account_profile')::jsonb||'{"employee_number":"ACCOUNT-2"}',repeat('f',64));
  assert op->>'account_user_id'='81000000-0000-4000-8000-000000000006';
  assert public.hr_staff_account_context('85000000-0000-4000-8000-000000000006',(op->>'lease_token')::uuid)->>'action'='link';
  begin perform public.hr_begin_staff_account('85000000-0000-4000-8000-000000000007','link',null,null,null,'account-admin@example.invalid',
    current_setting('test.account_profile')::jsonb||'{"employee_number":"ACCOUNT-3"}',repeat('a',64));
    raise exception 'HR protected account reclaimed';exception when sqlstate 'PT403' then null;end;
end $$;
reset role;
update auth.users set email_confirmed_at=now(),raw_app_meta_data=
 '{"snr_admin_operation":"85000000-0000-4000-8000-000000000006","snr_admin_actor":"81000000-0000-4000-8000-000000000001","snr_admin_organization":"82000000-0000-4000-8000-000000000001"}'
 where id='81000000-0000-4000-8000-000000000006';
set role authenticated;
select set_config('request.jwt.claims','{"sub":"81000000-0000-4000-8000-000000000001"}',true);
do $$ begin assert public.hr_complete_staff_account('85000000-0000-4000-8000-000000000006')->>'status'='completed';end $$;
reset role;
\echo 'PASS: existing unconfirmed accounts link through server-confirmed Auth metadata; protected accounts stay blocked'

set role authenticated;
select set_config('request.jwt.claims','{"sub":"81000000-0000-4000-8000-000000000001"}',true);
do $$ begin
  assert public.hr_workspace_settings()->>'version'='1';
  perform public.hr_save_workspace_settings(1,'Updated organization','UTC','People Administrator');
  assert public.current_workspace()->>'organization_name'='Updated organization';
  assert public.current_workspace()->>'display_name'='People Administrator';
  assert public.current_workspace()->>'role'='hr';
  assert public.hr_workspace_settings()->>'version'='2';
  assert (select timezone from public.sites limit 1)='Asia/Kolkata', 'Existing site zone was overwritten';
  begin perform public.hr_save_workspace_settings(1,'Stale organization','UTC','Stale name');
    raise exception 'Stale settings accepted';exception when sqlstate 'PT409' then null;end;
  begin perform public.hr_save_workspace_settings(2,'Updated organization','Invalid/Zone','People Administrator');
    raise exception 'Invalid settings zone accepted';exception when sqlstate 'PT422' then null;end;
end $$;
select set_config('request.jwt.claims','{"sub":"81000000-0000-4000-8000-000000000002"}',true);
do $$ begin
  begin perform public.hr_workspace_settings();raise exception 'Employee obtained settings';exception when sqlstate 'PT403' then null;end;
end $$;
reset role;
\echo 'PASS: HR workspace/name settings preserve roles, tenant scope, site zones and stale-edit protection'

update public.organization_memberships set active=false where user_id='81000000-0000-4000-8000-000000000001';
set role authenticated;
select set_config('request.jwt.claims','{"sub":"81000000-0000-4000-8000-000000000001"}',true);
do $$ begin
  begin perform public.hr_pending_staff_accounts();raise exception 'Revoked HR listing';exception when sqlstate 'PT403' then null;end;
  begin perform public.hr_recover_staff_account('85000000-0000-4000-8000-000000000001');raise exception 'Revoked HR recovery';exception when sqlstate 'PT403' then null;end;
end $$;
reset role;
do $$ begin
  assert not exists(select 1 from snr_private.staff_account_operations where profile_data::text like '%password%');
  assert (select count(*) from auth.users where id='81000000-0000-4000-8000-000000000004')=1;
end $$;
rollback;
\echo 'PASS: revoked-HR denial, no password storage and no destructive account cleanup; account fixtures rolled back'
