-- Synthetic upgrade fixtures only. The disposable container is removed afterward.
-- Create a real 0005 open punch before applying 0006, to prove existing data survives.
insert into auth.users(id,email,email_confirmed_at)
select ('e1000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'location-'||n||'@example.invalid',now()
from generate_series(1,8)n;
insert into public.organizations(id,name,timezone) values
 ('e2000000-0000-4000-8000-000000000001','Location one','UTC'),
 ('e2000000-0000-4000-8000-000000000002','Location two','UTC');
insert into public.organization_memberships(organization_id,user_id,role)
select ('e2000000-0000-4000-8000-'||lpad(case when n in(5,6) then '2' else '1' end,12,'0'))::uuid,
 ('e1000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
 case when n in(1,5) then 'hr' when n=3 then 'supervisor' when n=7 then 'system_owner'
 when n=8 then 'security_auditor' else 'employee' end from generate_series(1,8)n;
insert into public.sites(id,organization_id,name,timezone) values
 ('e3000000-0000-4000-8000-000000000001','e2000000-0000-4000-8000-000000000001','Location main','UTC'),
 ('e3000000-0000-4000-8000-000000000002','e2000000-0000-4000-8000-000000000002','Location foreign','UTC');
insert into public.departments(id,organization_id,name) values
 ('e5000000-0000-4000-8000-000000000001','e2000000-0000-4000-8000-000000000001','Operations'),
 ('e5000000-0000-4000-8000-000000000002','e2000000-0000-4000-8000-000000000002','Foreign');
insert into public.employee_profiles(id,organization_id,user_id,site_id,department_id,employee_number,display_name)
select ('e4000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
 ('e2000000-0000-4000-8000-'||lpad(case when n=6 then '2' else '1' end,12,'0'))::uuid,
 ('e1000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
 ('e3000000-0000-4000-8000-'||lpad(case when n=6 then '2' else '1' end,12,'0'))::uuid,
 ('e5000000-0000-4000-8000-'||lpad(case when n=6 then '2' else '1' end,12,'0'))::uuid,
 'GEO-'||n,'Location person '||n from unnest(array[2,4,6,7])n;
insert into public.supervisor_assignments values
 ('e2000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000003','e5000000-0000-4000-8000-000000000001','e3000000-0000-4000-8000-000000000001');
insert into public.shifts(id,organization_id,site_id,name,starts_at,ends_at,timezone) values
 ('e6000000-0000-4000-8000-000000000001','e2000000-0000-4000-8000-000000000001','e3000000-0000-4000-8000-000000000001','Day','00:00','23:59:59','UTC');
insert into public.shift_assignments(organization_id,employee_id,shift_id,starts_on)
select 'e2000000-0000-4000-8000-000000000001',id,'e6000000-0000-4000-8000-000000000001',current_date
from public.employee_profiles where organization_id='e2000000-0000-4000-8000-000000000001';
begin;
set role authenticated;
select set_config('request.jwt.claims','{"sub":"e1000000-0000-4000-8000-000000000002"}',true);
select public.record_attendance('clock_in','e7000000-0000-4000-8000-000000000001',null);
commit;
