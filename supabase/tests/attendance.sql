-- Disposable harness only. All records roll back; never apply to a live project.
begin;
set time zone 'UTC';
insert into auth.users(id,email,email_confirmed_at)
select ('c1000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'attendance-'||n||'@example.invalid',now()
from generate_series(1,14)n;
insert into public.organizations(id,name,timezone) values
 ('c2000000-0000-4000-8000-000000000001','Attendance one','UTC'),
 ('c2000000-0000-4000-8000-000000000002','Attendance two','UTC');
insert into public.organization_memberships(organization_id,user_id,role,active)
select ('c2000000-0000-4000-8000-'||lpad(case when n in(5,6) then '2' else '1' end,12,'0'))::uuid,
 ('c1000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
 case when n in(1,5) then 'hr' when n in(3,12) then 'supervisor' when n=7 then 'security_auditor'
 when n=8 then 'system_owner' else 'employee' end,n<>9 from generate_series(1,14)n;
insert into public.sites(id,organization_id,name,timezone) values
 ('c3000000-0000-4000-8000-000000000001','c2000000-0000-4000-8000-000000000001','Main','UTC'),
 ('c3000000-0000-4000-8000-000000000002','c2000000-0000-4000-8000-000000000001','Branch','UTC'),
 ('c3000000-0000-4000-8000-000000000003','c2000000-0000-4000-8000-000000000002','Foreign','UTC');
insert into public.departments(id,organization_id,name) values
 ('c5000000-0000-4000-8000-000000000001','c2000000-0000-4000-8000-000000000001','Operations'),
 ('c5000000-0000-4000-8000-000000000002','c2000000-0000-4000-8000-000000000001','Other'),
 ('c5000000-0000-4000-8000-000000000003','c2000000-0000-4000-8000-000000000002','Foreign');
insert into public.employee_profiles(id,organization_id,user_id,site_id,department_id,employee_number,display_name,active)
select ('c4000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
 ('c2000000-0000-4000-8000-'||lpad(case when n=6 then '2' else '1' end,12,'0'))::uuid,
 ('c1000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
 ('c3000000-0000-4000-8000-'||lpad(case when n=6 then '3' when n in(4,14) then '2' else '1' end,12,'0'))::uuid,
 ('c5000000-0000-4000-8000-'||lpad(case when n=6 then '3' when n in(4,13) then '2' else '1' end,12,'0'))::uuid,
 'ATT-'||n,'Attendance person '||n,n<>10 from unnest(array[2,4,6,9,10,11,13,14])n;
insert into public.supervisor_assignments values
 ('c2000000-0000-4000-8000-000000000001','c1000000-0000-4000-8000-000000000003','c5000000-0000-4000-8000-000000000001','c3000000-0000-4000-8000-000000000001');
insert into public.shifts(id,organization_id,site_id,name,starts_at,ends_at,timezone) values
 ('c6000000-0000-4000-8000-000000000001','c2000000-0000-4000-8000-000000000001','c3000000-0000-4000-8000-000000000001','Day','00:00','23:59:59','UTC'),
 ('c6000000-0000-4000-8000-000000000002','c2000000-0000-4000-8000-000000000001','c3000000-0000-4000-8000-000000000002','Branch day','00:00','23:59:59','UTC'),
 ('c6000000-0000-4000-8000-000000000003','c2000000-0000-4000-8000-000000000002','c3000000-0000-4000-8000-000000000003','Foreign','00:00','23:59:59','UTC'),
 ('c6000000-0000-4000-8000-000000000004','c2000000-0000-4000-8000-000000000001','c3000000-0000-4000-8000-000000000001','Night','22:00','06:00','UTC'),
 ('c6000000-0000-4000-8000-000000000005','c2000000-0000-4000-8000-000000000001','c3000000-0000-4000-8000-000000000001','DST','01:00','04:00','America/New_York');

set role anon;
do $$ begin
  begin perform public.attendance_workspace();raise exception 'Anonymous attendance allowed';exception when insufficient_privilege then null;end;
  begin perform public.record_attendance('clock_in',gen_random_uuid(),null);raise exception 'Anonymous punch allowed';exception when insufficient_privilege then null;end;
end $$;
reset role;
set role authenticated;
select set_config('request.jwt.claims','{"sub":"c1000000-0000-4000-8000-000000000002","user_metadata":{"role":"hr"}}',true);
do $$ begin
  assert public.attendance_workspace()->>'status'='clocked_out';
  assert public.attendance_workspace()->'shift'='null'::jsonb;
  begin perform public.record_attendance('clock_in',gen_random_uuid(),null);raise exception 'Unassigned shift punch allowed';exception when sqlstate 'PT409' then null;end;
  begin perform public.hr_employee_shifts('c4000000-0000-4000-8000-000000000002');raise exception 'Employee gained HR scheduling';exception when sqlstate 'PT403' then null;end;
  begin perform snr_private.attendance_shift('c2000000-0000-4000-8000-000000000001','c4000000-0000-4000-8000-000000000002',now());raise exception 'Private resolver exposed';exception when insufficient_privilege then null;end;
  begin insert into public.shift_assignments(organization_id,employee_id,shift_id,starts_on) values('c2000000-0000-4000-8000-000000000001','c4000000-0000-4000-8000-000000000002','c6000000-0000-4000-8000-000000000001',current_date);raise exception 'Direct plan write allowed';exception when insufficient_privilege then null;end;
end $$;
reset role;
\echo 'PASS: attendance anonymous/private/direct-write denial and missing-shift protection'

set role authenticated;
select set_config('request.jwt.claims','{"sub":"c1000000-0000-4000-8000-000000000001"}',true);
do $$ declare plan uuid;begin
  begin perform public.hr_save_employee_shift('c4000000-0000-4000-8000-000000000002',1,null,null,'c6000000-0000-4000-8000-000000000003',current_date,null);raise exception 'Foreign shift allowed';exception when sqlstate 'PT422' then null;end;
  begin perform public.hr_save_employee_shift('c4000000-0000-4000-8000-000000000002',1,null,null,'c6000000-0000-4000-8000-000000000002',current_date,null);raise exception 'Other site allowed';exception when sqlstate 'PT422' then null;end;
  begin perform public.hr_save_employee_shift('c4000000-0000-4000-8000-000000000002',1,null,null,'c6000000-0000-4000-8000-000000000001',current_date-1,null);raise exception 'Backdated plan allowed';exception when sqlstate 'PT422' then null;end;
  plan:=public.hr_save_employee_shift('c4000000-0000-4000-8000-000000000002',1,null,null,'c6000000-0000-4000-8000-000000000001',current_date,null);
  perform set_config('test.attendance_plan',plan::text,true);
  assert public.hr_employee_shifts('c4000000-0000-4000-8000-000000000002')->>'employee_version'='2';
  begin perform public.hr_save_employee_shift('c4000000-0000-4000-8000-000000000002',1,plan,1,'c6000000-0000-4000-8000-000000000001',current_date,current_date+1);raise exception 'Stale plan save allowed';exception when sqlstate 'PT409' then null;end;
  begin perform public.hr_save_employee_shift('c4000000-0000-4000-8000-000000000002',2,null,null,'c6000000-0000-4000-8000-000000000001',current_date+1,null);raise exception 'Overlapping plan allowed';exception when sqlstate 'PT409' then null;end;
  perform public.hr_save_employee_shift('c4000000-0000-4000-8000-000000000004',1,null,null,'c6000000-0000-4000-8000-000000000002',current_date,null);
end $$;
reset role;
\echo 'PASS: HR scheduling enforces tenant/site/date bounds, snapshots and overlap checks'

set role authenticated;
select set_config('request.jwt.claims','{"sub":"c1000000-0000-4000-8000-000000000002"}',true);
do $$ declare receipt jsonb;stamp timestamptz:=clock_timestamp();begin
  receipt:=public.record_attendance('clock_in','c7000000-0000-4000-8000-000000000001',null);
  perform set_config('test.attendance_in',receipt->>'id',true);
  assert receipt->>'replayed'='false';
  assert (receipt->>'occurred_at')::timestamptz between stamp and clock_timestamp();
  assert public.attendance_workspace()->>'status'='clocked_in';
  assert jsonb_array_length(public.attendance_workspace()->'schedule')=1;
  assert (select count(*) from public.attendance_events)=1;
  assert (select bool_and(actor_user_id=auth.uid() and occurred_at=recorded_at and attendance_date=current_date and timezone='UTC') from public.attendance_events);
  assert public.record_attendance('clock_in','c7000000-0000-4000-8000-000000000001',null)->>'replayed'='true';
  assert (select count(*) from public.attendance_events)=1;
  begin perform public.record_attendance('clock_out','c7000000-0000-4000-8000-000000000001',null);raise exception 'Changed replay accepted';exception when sqlstate 'PT409' then null;end;
  begin perform public.record_attendance('clock_out',gen_random_uuid(),null);raise exception 'Stale expected event accepted';exception when sqlstate 'PT409' then null;end;
  begin perform public.record_attendance('clock_in',gen_random_uuid(),(receipt->>'id')::uuid);raise exception 'Second open session allowed';exception when sqlstate 'PT409' then null;end;
  begin perform public.record_attendance('correction',gen_random_uuid(),(receipt->>'id')::uuid);raise exception 'Correction spoof allowed';exception when sqlstate 'PT422' then null;end;
  begin execute 'select public.record_attendance(''clock_in'',gen_random_uuid(),null,now()-interval ''1 day'')';raise exception 'Caller timestamp accepted';exception when undefined_function then null;end;
  begin update public.attendance_events set occurred_at=now();raise exception 'Direct history edit accepted';exception when insufficient_privilege then null;end;
end $$;
reset role;
do $$ begin
  assert (select count(*) from public.audit_events where action='attendance.clock_in')=1;
  begin update public.attendance_events set occurred_at=now();raise exception 'Owner could rewrite history';exception when raise_exception then if sqlerrm='Owner could rewrite history' then raise;end if;end;
  begin update public.employee_profiles set site_id='c3000000-0000-4000-8000-000000000002' where employee_number='ATT-2';raise exception 'Open session changed site';exception when sqlstate 'PT409' then null;end;
  begin update public.organization_memberships set role='supervisor' where user_id='c1000000-0000-4000-8000-000000000002';raise exception 'Open session changed role';exception when sqlstate 'PT409' then null;end;
end $$;
\echo 'PASS: server timing, keyed replay, stale-state/duplicate denial, audit and append-only history'

update public.organization_memberships set active=false where user_id='c1000000-0000-4000-8000-000000000002';
set role authenticated;
select set_config('request.jwt.claims','{"sub":"c1000000-0000-4000-8000-000000000002"}',true);
do $$ begin
  begin perform public.record_attendance('clock_out',gen_random_uuid(),current_setting('test.attendance_in')::uuid);raise exception 'Revoked employee punched';exception when sqlstate 'PT403' then null;end;
  begin perform public.attendance_records(current_date,current_date);raise exception 'Revoked employee read';exception when sqlstate 'PT403' then null;end;
end $$;
reset role;
update public.organization_memberships set active=true where user_id='c1000000-0000-4000-8000-000000000002';
set role authenticated;
select set_config('request.jwt.claims','{"sub":"c1000000-0000-4000-8000-000000000002"}',true);
do $$ declare receipt jsonb;begin
  receipt:=public.record_attendance('clock_out','c7000000-0000-4000-8000-000000000002',current_setting('test.attendance_in')::uuid);
  assert public.attendance_workspace()->>'status'='clocked_out';
  assert public.attendance_records(current_date,current_date)->'summary'->>'sessions'='1';
  assert public.attendance_records(current_date,current_date)->'summary'->>'open'='0';
  assert public.attendance_records(current_date,current_date)->'rows'->0->>'duration_seconds' is not null;
  receipt:=public.record_attendance('clock_in','c7000000-0000-4000-8000-000000000003',(receipt->>'id')::uuid);
  perform public.record_attendance('clock_out','c7000000-0000-4000-8000-000000000004',(receipt->>'id')::uuid);
  assert public.attendance_records(current_date,current_date)->>'total'='2';
  assert public.record_attendance('clock_in','c7000000-0000-4000-8000-000000000001',null)->>'replayed'='true';
  assert public.attendance_workspace()->>'status'='clocked_out';
  assert public.attendance_records(current_date,current_date,'','c3000000-0000-4000-8000-000000000002')->>'total'='0';
  begin perform public.attendance_records(current_date-31,current_date);raise exception 'Unbounded dates allowed';exception when sqlstate 'PT422' then null;end;
  begin perform public.attendance_records(current_date,current_date,'',null,null,'all',0);raise exception 'Invalid page allowed';exception when sqlstate 'PT422' then null;end;
end $$;
select set_config('request.jwt.claims','{"sub":"c1000000-0000-4000-8000-000000000004"}',true);
select public.record_attendance('clock_in','c7000000-0000-4000-8000-000000000001',null);
reset role;
\echo 'PASS: revocation is immediate; completed and repeated daily sessions preserve identity and durations'

set role authenticated;
select set_config('request.jwt.claims','{"sub":"c1000000-0000-4000-8000-000000000003"}',true);
do $$ begin
  assert public.attendance_records(current_date,current_date)->>'total'='2';
  assert (select count(*) from public.attendance_events)=4;
  assert jsonb_array_length(public.attendance_workspace()->'sites')=1;
  assert public.attendance_records(current_date,current_date,'','c3000000-0000-4000-8000-000000000002')->>'total'='0';
  begin perform public.record_attendance('clock_in',gen_random_uuid(),null);raise exception 'Supervisor inherited own punches';exception when sqlstate 'PT403' then null;end;
end $$;
select set_config('request.jwt.claims','{"sub":"c1000000-0000-4000-8000-000000000001"}',true);
do $$ begin
  assert public.attendance_records(current_date,current_date)->>'total'='3';
  assert public.attendance_records(current_date,current_date,'',null,null,'open')->>'total'='1';
  assert public.attendance_records(current_date,current_date,'ATT-2')->>'total'='2';
  assert public.attendance_records(current_date,current_date,'%')->>'total'='0';
  assert (select count(*) from public.audit_events)=0;
  begin perform public.record_attendance('clock_in',gen_random_uuid(),null);raise exception 'HR inherited employee punches';exception when sqlstate 'PT403' then null;end;
  begin perform public.hr_save_employee_shift('c4000000-0000-4000-8000-000000000002',2,current_setting('test.attendance_plan')::uuid,1,'c6000000-0000-4000-8000-000000000001',current_date,null,true);raise exception 'Used assignment cancelled';exception when sqlstate 'PT409' then null;end;
end $$;
select set_config('request.jwt.claims','{"sub":"c1000000-0000-4000-8000-000000000005"}',true);
do $$ begin assert public.attendance_records(current_date,current_date)->>'total'='0';
  begin perform public.hr_employee_shifts('c4000000-0000-4000-8000-000000000002');raise exception 'Foreign employee schedule read';exception when sqlstate 'PT404' then null;end;
end $$;
reset role;
\echo 'PASS: self/team/HR/tenant filters, HR audit isolation and read-only supervisor access'

-- Historical team access is checked against both current scope and immutable event scope.
update public.employee_profiles set site_id='c3000000-0000-4000-8000-000000000002',department_id='c5000000-0000-4000-8000-000000000002' where employee_number='ATT-2';
insert into public.supervisor_assignments values
 ('c2000000-0000-4000-8000-000000000001','c1000000-0000-4000-8000-000000000003','c5000000-0000-4000-8000-000000000002','c3000000-0000-4000-8000-000000000002');
set role authenticated;
select set_config('request.jwt.claims','{"sub":"c1000000-0000-4000-8000-000000000003"}',true);
do $$ begin
  assert public.attendance_records(current_date,current_date)->>'total'='1';
  assert (select count(*) from public.attendance_events)=1;
end $$;
select set_config('request.jwt.claims','{"sub":"c1000000-0000-4000-8000-000000000002"}',true);
do $$ begin assert public.attendance_records(current_date,current_date)->>'total'='2';end $$;
reset role;
\echo 'PASS: employee moves preserve own history and prevent supervisor historical-scope leakage'

-- A resolver probe covers midnight and DST without exposing a caller-controlled clock API.
insert into public.shift_assignments(organization_id,employee_id,shift_id,starts_on,ends_on) values
 ('c2000000-0000-4000-8000-000000000001','c4000000-0000-4000-8000-000000000011','c6000000-0000-4000-8000-000000000004','2026-11-06','2026-11-07'),
 ('c2000000-0000-4000-8000-000000000001','c4000000-0000-4000-8000-000000000011','c6000000-0000-4000-8000-000000000005','2026-03-08','2026-03-08');
do $$ declare shift jsonb;begin
  shift:=snr_private.attendance_shift('c2000000-0000-4000-8000-000000000001','c4000000-0000-4000-8000-000000000011','2026-11-07T01:00:00Z');
  assert shift->>'work_date'='2026-11-06';
  assert (shift->>'scheduled_end')::timestamptz='2026-11-07T06:00:00Z'::timestamptz;
  shift:=snr_private.attendance_shift('c2000000-0000-4000-8000-000000000001','c4000000-0000-4000-8000-000000000011','2026-03-08T06:30:00Z');
  assert (shift->>'scheduled_end')::timestamptz-(shift->>'scheduled_start')::timestamptz=interval '2 hours';
end $$;
\echo 'PASS: overnight work dates and DST use the assigned IANA time zone'

-- An open overnight session retains its original date even after its assignment
-- expires and its site is deactivated. Only normal checkout is requested by staff.
insert into public.shift_assignments(id,organization_id,employee_id,shift_id,starts_on,ends_on) values
 ('c8000000-0000-4000-8000-000000000013','c2000000-0000-4000-8000-000000000001','c4000000-0000-4000-8000-000000000013','c6000000-0000-4000-8000-000000000004',current_date-1,current_date-1);
insert into public.attendance_events(id,sequence_no,organization_id,employee_id,shift_id,site_id,department_id,event_type,
  occurred_at,recorded_at,actor_user_id,idempotency_key,session_id,shift_assignment_id,attendance_date,timezone,scheduled_start,scheduled_end)
values('c9000000-0000-4000-8000-000000000013',1,'c2000000-0000-4000-8000-000000000001','c4000000-0000-4000-8000-000000000013',
  'c6000000-0000-4000-8000-000000000004','c3000000-0000-4000-8000-000000000001','c5000000-0000-4000-8000-000000000002','clock_in',
  (current_date-1)+time '22:00',(current_date-1)+time '22:00','c1000000-0000-4000-8000-000000000013',
  'c7000000-0000-4000-8000-000000000013','c9000000-0000-4000-8000-000000000013','c8000000-0000-4000-8000-000000000013',
  current_date-1,'UTC',(current_date-1)+time '22:00',current_date+time '06:00');
update public.sites set active=false where id='c3000000-0000-4000-8000-000000000001';
set role authenticated;
select set_config('request.jwt.claims','{"sub":"c1000000-0000-4000-8000-000000000013"}',true);
select public.record_attendance('clock_out','c7000000-0000-4000-8000-000000000014','c9000000-0000-4000-8000-000000000013');
do $$ declare row jsonb;begin
  row:=public.attendance_records(current_date-1,current_date)->'rows'->0;
  assert (row->>'attendance_date')::date=current_date-1;
  assert row->>'status'='closed';
  assert (row->>'duration_seconds')::bigint>0;
end $$;
select set_config('request.jwt.claims','{"sub":"c1000000-0000-4000-8000-000000000011"}',true);
do $$ begin
  begin perform public.record_attendance('clock_in',gen_random_uuid(),null);raise exception 'Inactive site accepted clock-in';exception when sqlstate 'PT409' then assert sqlerrm='attendance_site_inactive';end;
end $$;
reset role;
update public.sites set active=true where id='c3000000-0000-4000-8000-000000000001';
\echo 'PASS: overnight checkout keeps its original work date and can finish after site deactivation'

set role authenticated;
select set_config('request.jwt.claims','{"sub":"c1000000-0000-4000-8000-000000000001"}',true);
do $$ declare plan uuid;begin
  plan:=public.hr_save_employee_shift('c4000000-0000-4000-8000-000000000014',1,null,null,'c6000000-0000-4000-8000-000000000002',current_date,null);
  perform public.hr_save_employee_shift('c4000000-0000-4000-8000-000000000014',2,plan,1,'c6000000-0000-4000-8000-000000000002',current_date,null,true);
  assert public.hr_employee_shifts('c4000000-0000-4000-8000-000000000014')->'assignments'->0->>'cancelled'='true';
  perform public.hr_save_employee_shift('c4000000-0000-4000-8000-000000000014',3,null,null,'c6000000-0000-4000-8000-000000000002',current_date,null);
end $$;
select set_config('request.jwt.claims','{"sub":"c1000000-0000-4000-8000-000000000014"}',true);
select public.record_attendance('clock_in','c7000000-0000-4000-8000-000000000015',null);
select set_config('request.jwt.claims','{"sub":"c1000000-0000-4000-8000-000000000003"}',true);
do $$ begin
  assert public.attendance_records(current_date-1,current_date)->>'total'='1';
  assert (select count(*) from public.attendance_events)=1;
end $$;
reset role;
\echo 'PASS: unused cancellation retains records; multiple supervisor scopes do not cross-combine department/site pairs'

update public.organizations set timezone='Pacific/Kiritimati' where id='c2000000-0000-4000-8000-000000000001';
set role authenticated;
select set_config('request.jwt.claims','{"sub":"c1000000-0000-4000-8000-000000000014"}',true);
do $$ begin
  assert public.attendance_workspace()->>'timezone'='UTC';
  assert (public.attendance_workspace()->>'today')::date=(clock_timestamp() at time zone 'UTC')::date;
end $$;
reset role;
\echo 'PASS: employee history defaults follow the assigned shift zone across organization date boundaries'

insert into public.shift_assignments(id,organization_id,employee_id,shift_id,starts_on) values
 ('c8000000-0000-4000-8000-000000000006','c2000000-0000-4000-8000-000000000002','c4000000-0000-4000-8000-000000000006','c6000000-0000-4000-8000-000000000003',current_date);
with samples as (select gen_random_uuid() as id,n from generate_series(1,23)n)
insert into public.attendance_events(id,sequence_no,organization_id,employee_id,shift_id,site_id,department_id,event_type,
  occurred_at,recorded_at,actor_user_id,idempotency_key,session_id,shift_assignment_id,attendance_date,timezone,scheduled_start,scheduled_end)
select id,n*2-1,'c2000000-0000-4000-8000-000000000002','c4000000-0000-4000-8000-000000000006','c6000000-0000-4000-8000-000000000003',
 'c3000000-0000-4000-8000-000000000003','c5000000-0000-4000-8000-000000000003','clock_in',
 current_date+n*interval '2 minutes',current_date+n*interval '2 minutes','c1000000-0000-4000-8000-000000000006',gen_random_uuid(),id,
 'c8000000-0000-4000-8000-000000000006',current_date,'UTC',current_date+time '00:00',current_date+time '23:59:59' from samples;
insert into public.attendance_events(sequence_no,organization_id,employee_id,shift_id,site_id,department_id,event_type,
 occurred_at,recorded_at,actor_user_id,idempotency_key,session_id,shift_assignment_id,attendance_date,timezone,previous_event_id,scheduled_start,scheduled_end)
select sequence_no+1,organization_id,employee_id,shift_id,site_id,department_id,'clock_out',occurred_at+interval '1 minute',
 recorded_at+interval '1 minute',actor_user_id,gen_random_uuid(),id,shift_assignment_id,attendance_date,timezone,id,scheduled_start,scheduled_end
from public.attendance_events where organization_id='c2000000-0000-4000-8000-000000000002' and event_type='clock_in';
set role authenticated;
select set_config('request.jwt.claims','{"sub":"c1000000-0000-4000-8000-000000000006"}',true);
do $$ declare data jsonb;begin
 data:=public.attendance_records(current_date,current_date);
 assert data->>'total'='23';assert jsonb_array_length(data->'rows')=20;
 assert data->'summary'->>'completed_seconds'='1380';
 data:=public.attendance_records(current_date,current_date,'',null,null,'all',2);
 assert jsonb_array_length(data->'rows')=3;
 assert data->'summary'->>'completed_seconds'='1380';
end $$;
select set_config('request.jwt.claims','{"sub":"c1000000-0000-4000-8000-000000000001"}',true);
do $$ begin assert public.attendance_records(current_date,current_date)->>'total'='4';end $$;
reset role;
\echo 'PASS: 20-row pages keep full filtered totals/durations without counting another tenant'

do $$ declare n integer;begin
  for n in select unnest(array[7,8,9,10]) loop
    perform set_config('request.jwt.claims',jsonb_build_object('sub','c1000000-0000-4000-8000-'||lpad(n::text,12,'0'))::text,true);
    set local role authenticated;
    begin perform public.record_attendance('clock_in',gen_random_uuid(),null);raise exception 'Unauthorized role/profile punched';exception when sqlstate 'PT403' then null;end;
    reset role;
  end loop;
end $$;
rollback;
\echo 'PASS: protected roles, revoked users and inactive profiles remain denied; attendance fixtures rolled back'
