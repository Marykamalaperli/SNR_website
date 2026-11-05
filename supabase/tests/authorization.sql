-- Execute only against the disposable database created by scripts/test-supabase.sh.
\set ON_ERROR_STOP on
begin;
insert into auth.users(id, email, email_confirmed_at)
select ('00000000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid,
  'test-' || n || '@example.invalid', now() from generate_series(1,9) n;
insert into public.organizations(id,name) values
 ('10000000-0000-4000-8000-000000000001','Organization one'),
 ('10000000-0000-4000-8000-000000000002','Organization two');
insert into public.organization_memberships(organization_id,user_id,role) values
 ('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','employee'),
 ('10000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000002','employee'),
 ('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000003','supervisor'),
 ('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000004','hr'),
 ('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000005','security_auditor'),
 ('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000006','system_owner'),
 ('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000008','employee'),
 ('10000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000008','employee'),
 ('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000009','employee');
insert into public.sites(id,organization_id,name) values
 ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','Site one'),
 ('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','Site two'),
 ('20000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000002','Other organization site');
insert into public.departments(id,organization_id,name) values
 ('30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','Team one'),
 ('30000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','Team two'),
 ('30000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000002','Other organization team');
insert into public.employee_profiles(id,organization_id,user_id,department_id,site_id,employee_number,display_name) values
 ('40000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','TEST-1','Employee one'),
 ('40000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000003','TEST-2','Other organization employee'),
 ('40000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000009','30000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002','TEST-3','Other team employee');
insert into public.supervisor_assignments values
 ('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000003','30000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001');
insert into public.audit_events(organization_id,actor_user_id,action,subject_type,subject_id,request_id) values
 ('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000004','test','employee','40000000-0000-4000-8000-000000000001','test-request-123');
insert into public.document_metadata(organization_id,owner_employee_id,name,category) values
 ('10000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','Private test metadata','test');

set role anon;
do $$ begin
  begin perform public.current_workspace(); raise exception 'Anonymous RPC unexpectedly allowed';
    exception when insufficient_privilege then null; end;
end $$;
reset role;
\echo 'PASS: anonymous workspace execution denied'

set role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000001","user_metadata":{"role":"hr"}}',true);
do $$ declare workspace jsonb; begin
  workspace := public.current_workspace();
  assert workspace->>'role' = 'employee', 'User metadata must not grant HR';
  assert workspace->>'user_id' = '00000000-0000-4000-8000-000000000001';
  assert workspace->>'organization_name' = 'Organization one';
  assert workspace->>'display_name' = 'Employee one';
  assert (select count(*) from public.employee_profiles) = 1, 'Employee read isolation failed';
  assert (select count(*) from public.organizations) = 1, 'Tenant read isolation failed';
  assert (select count(*) from public.document_metadata) = 0, 'Documents must remain private';
  begin update public.organization_memberships set role='hr'; raise exception 'Role self-assignment allowed';
    exception when insufficient_privilege then null; end;
  begin insert into public.organizations(name) values ('Unauthorized'); raise exception 'Browser write allowed';
    exception when insufficient_privilege then null; end;
end $$;
reset role;
\echo 'PASS: employee ownership, tenant isolation, metadata spoofing and write denial'

set role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000003"}',true);
do $$ declare workspace jsonb; begin
  workspace := public.current_workspace();
  assert workspace->>'role' = 'supervisor';
  assert jsonb_array_length(workspace->'team_ids') = 1;
  assert workspace->'site_ids' = '["20000000-0000-4000-8000-000000000001"]'::jsonb;
  assert (select count(*) from public.employee_profiles) = 1, 'Supervisor team/site isolation failed';
end $$;
reset role;
\echo 'PASS: supervisor department and site scope'

set role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000004"}',true);
do $$ begin
  assert public.current_workspace()->>'role' = 'hr';
  assert (select count(*) from public.employee_profiles) = 2, 'HR organization scope failed';
  assert (select count(*) from public.audit_events) = 0, 'HR inherited auditor privileges';
end $$;
reset role;
\echo 'PASS: HR organization scope without audit inheritance'

set role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000005"}',true);
do $$ begin
  assert public.current_workspace()->>'role' = 'security_auditor';
  assert (select count(*) from public.employee_profiles) = 0, 'Auditor inherited HR privileges';
  assert (select count(*) from public.audit_events) = 1;
end $$;
reset role;
\echo 'PASS: auditor is a distinct capability'

set role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000006"}',true);
do $$ begin
  assert public.current_workspace()->>'role' = 'system_owner';
  assert (select count(*) from public.employee_profiles) = 0, 'Owner inherited HR privileges';
  assert (select count(*) from public.audit_events) = 0, 'Owner inherited audit privileges';
end $$;
reset role;
\echo 'PASS: system owner has no implicit HR/auditor access'

set role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000007"}',true);
do $$ begin
  begin perform public.current_workspace(); raise exception 'Unassigned user allowed';
    exception when sqlstate 'PT403' then null; end;
end $$;
reset role;
\echo 'PASS: authenticated but unassigned user denied'

set role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000008"}',true);
do $$ begin
  begin perform public.current_workspace(); raise exception 'Ambiguous organization auto-selected';
    exception when sqlstate 'PT409' then null; end;
end $$;
reset role;
\echo 'PASS: multiple organizations require explicit future selection'

update public.organization_memberships set active=false where user_id='00000000-0000-4000-8000-000000000001';
set role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000001"}',true);
do $$ begin
  begin perform public.current_workspace(); raise exception 'Revoked member still authorized';
    exception when sqlstate 'PT403' then null; end;
  assert (select count(*) from public.employee_profiles) = 0, 'Revoked member can still read';
end $$;
reset role;
\echo 'PASS: membership revocation removes workspace and data access'
rollback;
\echo 'All 9 PostgreSQL authorization scenarios passed; fixtures rolled back.'
