-- Local harness only. All fixtures roll back. The caller runs as real database roles.
begin;
insert into auth.users(id,email,email_confirmed_at)
select ('70000000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid,
  'staff-' || n || '@example.invalid',case when n=7 then null else now() end from generate_series(1,35) n;
insert into public.organizations(id,name) values
 ('71000000-0000-4000-8000-000000000001','Workforce one'),('71000000-0000-4000-8000-000000000002','Workforce two');
insert into public.organization_memberships(organization_id,user_id,role,active) values
 ('71000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000001','hr',true),
 ('71000000-0000-4000-8000-000000000002','70000000-0000-4000-8000-000000000004','hr',true),
 ('71000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000005','system_owner',true),
 ('71000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000006','security_auditor',true),
 ('71000000-0000-4000-8000-000000000002','70000000-0000-4000-8000-000000000009','employee',true),
 ('71000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000010','hr',true),
 ('71000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000011','employee',false);

set role anon;
do $$ begin
  begin perform public.workforce_directory(); raise exception 'Anonymous directory allowed'; exception when insufficient_privilege then null; end;
  begin perform public.hr_save_department(null,null,'Denied'); raise exception 'Anonymous save allowed'; exception when insufficient_privilege then null; end;
end $$;
reset role;
\echo 'PASS: workforce functions deny anonymous execution'

set role authenticated;
select set_config('request.jwt.claims','{"sub":"70000000-0000-4000-8000-000000000001"}',true);
do $$ declare site uuid; department uuid; shift uuid; employee uuid; setup jsonb; begin
  site := public.hr_save_site(null,null,'Main office','Asia/Kolkata');
  department := public.hr_save_department(null,null,'Operations');
  shift := public.hr_save_shift(null,null,'General',site,'09:00','18:00');
  employee := public.hr_save_employee(null,null,null,'staff-2@example.invalid','First employee','SNR-002',site,department,'employee',true);
  perform public.hr_save_employee(null,null,null,'staff-3@example.invalid','Team supervisor','SNR-003',site,department,'supervisor',true);
  setup := public.hr_organization_setup();
  assert setup->'organization'->>'name'='Workforce one';
  assert jsonb_array_length(setup->'sites')=1;
  assert setup->'counts'->>'active_employees'='2';
  assert setup->'counts'->>'supervisors'='1';
  assert public.workforce_directory()->>'total'='2';
  assert (select count(*) from public.audit_events)=0, 'HR must not inherit audit reading';
  begin insert into public.sites(organization_id,name) values ('71000000-0000-4000-8000-000000000001','Browser insert');
    raise exception 'Direct table write allowed'; exception when insufficient_privilege then null; end;
  begin perform snr_private.workforce_audit('71000000-0000-4000-8000-000000000001','forged','site',site);
    raise exception 'Audit forging allowed'; exception when insufficient_privilege then null; end;
end $$;
reset role;
do $$ begin
  assert (select count(*) from public.audit_events)=5, 'Each successful save needs one audit event';
  assert (select count(*) from public.supervisor_assignments)=1;
end $$;
\echo 'PASS: HR setup, employee/supervisor onboarding, atomic audit and direct-write denial'

set role authenticated;
select set_config('request.jwt.claims','{"sub":"70000000-0000-4000-8000-000000000001"}',true);
do $$ declare site uuid; department uuid; e public.employee_profiles; mv integer; begin
  select id into site from public.sites limit 1;
  select id into department from public.departments limit 1;
  begin perform public.hr_save_employee(null,null,null,'staff-7@example.invalid','Unconfirmed','BAD',site,department,'employee',true);
    raise exception 'Unconfirmed account admitted'; exception when sqlstate 'PT422' then null; end;
  begin perform public.hr_save_employee(null,null,null,'missing@example.invalid','Missing','BAD',site,department,'employee',true);
    raise exception 'Missing account admitted'; exception when sqlstate 'PT422' then null; end;
  begin perform public.hr_save_employee(null,null,null,'staff-9@example.invalid','Other tenant','BAD',site,department,'employee',true);
    raise exception 'Cross-tenant account admitted'; exception when sqlstate 'PT409' then null; end;
  begin perform public.hr_save_employee(null,null,null,'staff-10@example.invalid','Protected HR','BAD',site,department,'employee',true);
    raise exception 'HR downgraded via onboarding'; exception when sqlstate 'PT403' then null; end;
  begin perform public.hr_save_employee(null,null,null,'staff-11@example.invalid','Revoked','BAD',site,department,'employee',true);
    raise exception 'Revoked account silently re-enabled'; exception when sqlstate 'PT409' then null; end;
  begin perform public.hr_save_employee(null,null,null,'staff-8@example.invalid','Escalation','BAD',site,department,'hr',true);
    raise exception 'HR role provisioning allowed'; exception when sqlstate 'PT422' then null; end;
  begin perform public.hr_save_employee(null,null,null,'staff-2@example.invalid','Duplicate','SNR-002',site,department,'employee',true);
    raise exception 'Duplicate profile allowed'; exception when sqlstate 'PT409' then null; end;
  begin perform public.hr_save_site(null,null,' main OFFICE ','Asia/Kolkata');
    raise exception 'Duplicate normalized site allowed'; exception when sqlstate 'PT409' then null; end;
  begin perform public.hr_save_site(null,null,'Bad timezone','Not/AZone');
    raise exception 'Invalid zone allowed'; exception when sqlstate 'PT422' then null; end;
  begin perform public.hr_save_shift(null,null,'Zero duration',site,'09:00','09:00');
    raise exception 'Zero duration shift allowed'; exception when sqlstate 'PT422' then null; end;
  perform public.hr_save_shift(null,null,'Night',site,'22:00','06:00');
  select * into e from public.employee_profiles where employee_number='SNR-002';
  select (row->>'membership_version')::integer into mv
    from jsonb_array_elements(public.workforce_directory()->'rows') row where row->>'id'=e.id::text;
  perform public.hr_save_employee(e.id,e.version,mv,null,'Updated employee',e.employee_number,site,department,'employee',true);
  begin perform public.hr_save_employee(e.id,e.version,mv,null,'Stale edit',e.employee_number,site,department,'employee',true);
    raise exception 'Stale profile overwritten'; exception when sqlstate 'PT409' then null; end;
  perform public.hr_save_department(department,1,'Operations updated');
  begin perform public.hr_save_department(department,1,'Stale department');
    raise exception 'Stale setup overwritten'; exception when sqlstate 'PT409' then null; end;
end $$;
reset role;
do $$ begin
  assert (select count(*) from public.employee_profiles)=2;
  assert (select count(*) from public.audit_events)=8, 'Failed requests must leave no audit/partial state';
  assert not exists(select 1 from public.organization_memberships where user_id='70000000-0000-4000-8000-000000000008');
end $$;
\echo 'PASS: confirmed-account checks, protected roles, duplicates, validation, overnight shifts and stale edits'

-- An external owner edit increments membership version too.
update public.organization_memberships set active=false where user_id='70000000-0000-4000-8000-000000000002';
set role authenticated;
select set_config('request.jwt.claims','{"sub":"70000000-0000-4000-8000-000000000001"}',true);
do $$ declare e public.employee_profiles; row jsonb; begin
  select * into e from public.employee_profiles where employee_number='SNR-002';
  begin perform public.hr_save_employee(e.id,e.version,2,null,e.display_name,e.employee_number,e.site_id,e.department_id,'employee',true);
    raise exception 'Stale access snapshot re-enabled account'; exception when sqlstate 'PT409' then null; end;
  select value into row from jsonb_array_elements(public.workforce_directory(p_status=>'inactive')->'rows') where value->>'id'=e.id::text;
  assert row is not null;
  perform public.hr_save_employee(e.id,e.version,(row->>'membership_version')::integer,null,e.display_name,e.employee_number,e.site_id,e.department_id,'employee',true);
end $$;
reset role;
\echo 'PASS: external access changes invalidate stale forms; explicit current edits can restore access'

set role authenticated;
select set_config('request.jwt.claims','{"sub":"70000000-0000-4000-8000-000000000001"}',true);
do $$ declare site uuid; department uuid; begin
  site := public.hr_save_site(null,null,'Branch','UTC');
  department := public.hr_save_department(null,null,'Other department');
  perform public.hr_save_employee(null,null,null,'staff-8@example.invalid','Other team employee','SNR-008',site,department,'employee',true);
end $$;
select set_config('request.jwt.claims','{"sub":"70000000-0000-4000-8000-000000000002","user_metadata":{"role":"hr"}}',true);
do $$ declare data jsonb; begin
  data := public.workforce_directory();
  assert data->>'total'='1';
  assert data->'rows'->0->>'display_name'='Updated employee';
  assert data->'rows'->0->>'is_self'='true';
  assert data->'rows'->0->>'email' is null;
  begin perform public.hr_organization_setup(); raise exception 'Employee obtained HR setup'; exception when sqlstate 'PT403' then null; end;
  begin perform public.hr_save_department(null,null,'Spoofed role'); raise exception 'Employee wrote setup'; exception when sqlstate 'PT403' then null; end;
end $$;
select set_config('request.jwt.claims','{"sub":"70000000-0000-4000-8000-000000000003"}',true);
do $$ declare data jsonb; begin
  data := public.workforce_directory();
  assert data->>'total'='2', 'Supervisor must see only assigned department/site';
  assert not exists(select 1 from jsonb_array_elements(data->'rows') r where r->>'employee_number'='SNR-008');
  begin perform public.hr_save_department(null,null,'Denied'); raise exception 'Supervisor obtained HR writes'; exception when sqlstate 'PT403' then null; end;
end $$;
select set_config('request.jwt.claims','{"sub":"70000000-0000-4000-8000-000000000004"}',true);
do $$ begin
  assert public.workforce_directory()->>'total'='0';
end $$;
reset role;
-- IDs are known inputs in real tampering attempts. Capture one as a transaction-local setting.
select set_config('test.other_site',(select id::text from public.sites where name='Main office'),true);
set role authenticated;
select set_config('request.jwt.claims','{"sub":"70000000-0000-4000-8000-000000000004"}',true);
do $$ begin
  begin perform public.hr_save_site(current_setting('test.other_site')::uuid,1,'Cross tenant','UTC');
    raise exception 'Cross tenant update allowed'; exception when sqlstate 'PT404' then null; end;
  begin perform public.hr_save_shift(null,null,'Cross tenant',current_setting('test.other_site')::uuid,'09:00','18:00');
    raise exception 'Cross tenant site reference allowed'; exception when sqlstate 'PT422' then null; end;
end $$;
select set_config('request.jwt.claims','{"sub":"70000000-0000-4000-8000-000000000005"}',true);
do $$ begin
  begin perform public.workforce_directory(); raise exception 'Owner inherited directory'; exception when sqlstate 'PT403' then null; end;
end $$;
select set_config('request.jwt.claims','{"sub":"70000000-0000-4000-8000-000000000006"}',true);
do $$ begin
  begin perform public.hr_organization_setup(); raise exception 'Auditor inherited HR'; exception when sqlstate 'PT403' then null; end;
end $$;
reset role;
\echo 'PASS: employee ownership, supervisor scopes, tenant tampering and exact role boundaries'

-- Populate enough records to exercise database pagination rather than frontend slicing.
insert into public.organization_memberships(organization_id,user_id,role)
select '71000000-0000-4000-8000-000000000001',u.id,'employee' from auth.users u
where u.email ~ '^staff-(1[4-9]|2[0-9]|3[0-5])@';
insert into public.employee_profiles(organization_id,user_id,department_id,site_id,employee_number,display_name)
select m.organization_id,m.user_id,(select id from public.departments where name='Operations updated'),
 (select id from public.sites where name='Main office'),'PAGE-'||u.email,'Paged '||u.email
from public.organization_memberships m join auth.users u on u.id=m.user_id where u.email ~ '^staff-(1[4-9]|2[0-9]|3[0-5])@';
set role authenticated;
select set_config('request.jwt.claims','{"sub":"70000000-0000-4000-8000-000000000001"}',true);
do $$ declare one jsonb; two jsonb; begin
  one := public.workforce_directory(p_search=>'Paged');
  two := public.workforce_directory(p_search=>'Paged',p_page=>2);
  assert one->>'total'='22';
  assert jsonb_array_length(one->'rows')=20 and jsonb_array_length(two->'rows')=2;
  assert not exists(select 1 from jsonb_array_elements(one->'rows') a join jsonb_array_elements(two->'rows') b on a->>'id'=b->>'id');
  assert public.workforce_directory(p_search=>'%')->>'total'='0', 'Search must treat wildcard text literally';
  begin perform public.workforce_directory(p_page=>0); raise exception 'Invalid pagination accepted'; exception when sqlstate 'PT422' then null; end;
end $$;
reset role;
\echo 'PASS: bounded pagination and literal search'

insert into public.shift_assignments(organization_id,employee_id,shift_id,starts_on)
select e.organization_id,e.id,s.id,current_date from public.employee_profiles e
join public.shifts s on s.organization_id=e.organization_id and s.name='General'
where e.employee_number='SNR-002';
set role authenticated;
select set_config('request.jwt.claims','{"sub":"70000000-0000-4000-8000-000000000001"}',true);
do $$ declare shift public.shifts; supervisor jsonb; begin
  select * into shift from public.shifts where name='General';
  begin perform public.hr_save_shift(shift.id,shift.version,shift.name,shift.site_id,'10:00','19:00');
    raise exception 'Assigned shift history changed'; exception when sqlstate 'PT409' then null; end;
  perform public.hr_save_shift(shift.id,shift.version,'General renamed',shift.site_id,shift.starts_at,shift.ends_at);
  select value into supervisor from jsonb_array_elements(public.workforce_directory(p_search=>'SNR-003')->'rows') where value->>'employee_number'='SNR-003';
  perform public.hr_save_employee((supervisor->>'id')::uuid,(supervisor->>'version')::integer,
    (supervisor->>'membership_version')::integer,null,'Team supervisor','SNR-003',
    (select id from public.sites where name='Branch'),(select id from public.departments where name='Other department'),'supervisor',true);
end $$;
select set_config('request.jwt.claims','{"sub":"70000000-0000-4000-8000-000000000003"}',true);
do $$ declare data jsonb; begin
  data := public.workforce_directory();
  assert data->>'total'='2';
  assert not exists(select 1 from jsonb_array_elements(data->'rows') r where r->>'employee_number'='SNR-002'), 'Old supervisor scope retained';
end $$;
reset role;
\echo 'PASS: assigned shift schedule protection and immediate supervisor scope changes'

insert into public.organization_memberships(organization_id,user_id,role) values
 ('71000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000012','hr'),
 ('71000000-0000-4000-8000-000000000002','70000000-0000-4000-8000-000000000012','employee');
set role authenticated;
select set_config('request.jwt.claims','{"sub":"70000000-0000-4000-8000-000000000012"}',true);
do $$ begin
  begin perform public.workforce_directory(); raise exception 'Ambiguous tenant read allowed'; exception when sqlstate 'PT409' then null; end;
  begin perform public.hr_save_department(null,null,'Ambiguous tenant'); raise exception 'Ambiguous tenant write allowed'; exception when sqlstate 'PT409' then null; end;
end $$;
select set_config('request.jwt.claims','{"sub":"70000000-0000-4000-8000-000000000013"}',true);
do $$ begin
  begin perform public.workforce_directory(); raise exception 'Unassigned user read allowed'; exception when sqlstate 'PT403' then null; end;
end $$;
reset role;
update public.organization_memberships set active=false where user_id='70000000-0000-4000-8000-000000000001';
set role authenticated;
select set_config('request.jwt.claims','{"sub":"70000000-0000-4000-8000-000000000001"}',true);
do $$ begin
  begin perform public.hr_save_department(null,null,'Revoked HR'); raise exception 'Revoked HR wrote'; exception when sqlstate 'PT403' then null; end;
  begin perform public.workforce_directory(); raise exception 'Revoked HR read'; exception when sqlstate 'PT403' then null; end;
end $$;
reset role;
rollback;
\echo 'PASS: ambiguous/unassigned accounts and revoked-HR denial; all workforce fixtures rolled back'
