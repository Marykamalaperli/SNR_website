-- Disposable database only. The legacy fixture was committed before migration 0006.
begin;
select set_config('test.geo_in',(select id::text from public.attendance_events where idempotency_key='e7000000-0000-4000-8000-000000000001'),true);
select set_config('test.geo_fix',jsonb_build_object('latitude',12.971599123,'longitude',77.594566234,
 'accuracy_meters',8.4,'captured_at',clock_timestamp(),'consent_version','attendance-location-v1')::text,true);

set role anon;
do $$ begin
 begin perform public.attendance_location_details(gen_random_uuid());raise exception 'Anonymous GPS access';exception when insufficient_privilege then null;end;
end $$;
reset role;
set role authenticated;
select set_config('request.jwt.claims','{"sub":"e1000000-0000-4000-8000-000000000002"}',true);
do $$ declare data jsonb;begin
 assert public.attendance_workspace()->>'status'='clocked_in';
 assert public.attendance_workspace()->>'location_required'='true';
 assert public.attendance_workspace()->>'last_event_id'=current_setting('test.geo_in');
 data:=public.attendance_records(current_date,current_date);
 assert data->'rows'->0->>'clock_in_location_available'='false';
 assert data->'rows'->0->>'clock_in'= (select to_jsonb(occurred_at)#>>'{}' from public.attendance_events where id=current_setting('test.geo_in')::uuid);
 begin perform public.record_attendance('clock_out',gen_random_uuid(),current_setting('test.geo_in')::uuid);raise exception 'Legacy bypass';exception when sqlstate 'PT409' then assert sqlerrm='attendance_location_required';end;
 begin perform snr_private.record_attendance_without_location('clock_out',gen_random_uuid(),current_setting('test.geo_in')::uuid);raise exception 'Private bypass';exception when insufficient_privilege then null;end;
 begin perform 1 from snr_private.attendance_locations;raise exception 'Direct GPS read';exception when insufficient_privilege then null;end;
end $$;
reset role;
\echo 'PASS: migration preserves legacy attendance and blocks anonymous/private/old-API location bypasses'

set role authenticated;
select set_config('request.jwt.claims','{"sub":"e1000000-0000-4000-8000-000000000002"}',true);
do $$ declare bad jsonb;fix jsonb:=current_setting('test.geo_fix')::jsonb;eid uuid:='e4000000-0000-4000-8000-000000000002';begin
 for bad in select unnest(array[
   null::jsonb,'{}'::jsonb,fix-'consent_version',fix||'{"consent_version":"forged"}',
   fix||'{"latitude":91}',fix||'{"longitude":-181}',fix||'{"accuracy_meters":-1}',fix||'{"latitude":"12.5"}',
   fix||'{"captured_at":"infinity"}',fix||'{"captured_at":"invalid"}',fix||'{"captured_at":"now"}',fix||'{"organization_id":"forged"}'
 ]) loop
  begin perform public.record_attendance('clock_out',gen_random_uuid(),current_setting('test.geo_in')::uuid,bad,eid);raise exception 'Invalid location admitted';exception when sqlstate 'PT422' then null;end;
 end loop;
 begin perform public.record_attendance('clock_out',gen_random_uuid(),current_setting('test.geo_in')::uuid,
   fix||jsonb_build_object('captured_at',clock_timestamp()-interval '5 minutes'),eid);raise exception 'Stale location';exception when sqlstate 'PT422' then assert sqlerrm='stale_attendance_location';end;
 begin perform public.record_attendance('clock_out',gen_random_uuid(),current_setting('test.geo_in')::uuid,
   fix||jsonb_build_object('captured_at',clock_timestamp()+interval '5 minutes'),eid);raise exception 'Future location';exception when sqlstate 'PT422' then null;end;
 begin perform public.record_attendance('clock_out',gen_random_uuid(),current_setting('test.geo_in')::uuid,fix,'e4000000-0000-4000-8000-000000000004');raise exception 'Wrong subject';exception when sqlstate 'PT409' then null;end;
 assert (select count(*) from public.attendance_events)=1;
end $$;
reset role;
do $$ begin
 assert (select count(*) from snr_private.attendance_locations)=0;
 assert (select count(*) from public.audit_events where action='attendance.clock_out')=0;
end $$;
\echo 'PASS: location consent, numeric bounds, freshness and employee snapshots fail without partial events/audits'

set role authenticated;
select set_config('request.jwt.claims','{"sub":"e1000000-0000-4000-8000-000000000002"}',true);
do $$ declare receipt jsonb;fix jsonb:=current_setting('test.geo_fix')::jsonb;data jsonb;begin
 receipt:=public.record_attendance('clock_out','e7000000-0000-4000-8000-000000000002',current_setting('test.geo_in')::uuid,fix,'e4000000-0000-4000-8000-000000000002');
 assert receipt->>'location_saved'='true';
 assert receipt->>'replayed'='false';
 perform set_config('test.geo_out',receipt->>'id',true);
 assert public.record_attendance('clock_out','e7000000-0000-4000-8000-000000000002',current_setting('test.geo_in')::uuid,fix,'e4000000-0000-4000-8000-000000000002')->>'replayed'='true';
 begin perform public.record_attendance('clock_out','e7000000-0000-4000-8000-000000000002',current_setting('test.geo_in')::uuid,fix||'{"latitude":13}','e4000000-0000-4000-8000-000000000002');raise exception 'Changed replay';exception when sqlstate 'PT409' then null;end;
 begin perform public.record_attendance('clock_in','e7000000-0000-4000-8000-000000000001',null,fix,'e4000000-0000-4000-8000-000000000002');raise exception 'Legacy backfill';exception when sqlstate 'PT409' then assert sqlerrm='legacy_attendance_request';end;
 data:=public.attendance_location_details(current_setting('test.geo_in')::uuid);
 assert data->'clock_in'='null'::jsonb;
 assert (data->'clock_out'->>'latitude')::double precision=12.971599123;
 assert (data->'clock_out'->>'longitude')::double precision=77.594566234;
 assert data->'clock_out'->>'accuracy_meters'='8.4';
 assert public.attendance_records(current_date,current_date)->'rows'->0->>'clock_out_location_available'='true';
end $$;
reset role;
do $$ begin
 assert (select count(*) from snr_private.attendance_locations)=1;
 assert (select count(*) from public.audit_events where action='attendance.clock_out')=1;
 assert (select recorded_at from snr_private.attendance_locations)=(select occurred_at from public.attendance_events where id=current_setting('test.geo_out')::uuid);
 begin update snr_private.attendance_locations set latitude=0;raise exception 'GPS rewrite';exception when raise_exception then if sqlerrm='GPS rewrite' then raise;end if;end;
end $$;
\echo 'PASS: legacy checkout saves new GPS atomically; replay binds the original fix and retains immutable coordinates'

-- Force a failure after the normal event/audit insert to check the transaction boundary.
create function snr_private.test_reject_location() returns trigger language plpgsql as $$
begin raise exception using errcode='PT422',message='invalid_attendance_location';end $$;
create trigger test_reject_location before insert on snr_private.attendance_locations
  for each row execute function snr_private.test_reject_location();
set role authenticated;
select set_config('request.jwt.claims','{"sub":"e1000000-0000-4000-8000-000000000002"}',true);
do $$ begin
 begin perform public.record_attendance('clock_in','e7000000-0000-4000-8000-000000000003',current_setting('test.geo_out')::uuid,
   current_setting('test.geo_fix')::jsonb,'e4000000-0000-4000-8000-000000000002');raise exception 'Partial punch committed';exception when sqlstate 'PT422' then null;end;
 assert (select count(*) from public.attendance_events)=2;
end $$;
reset role;
drop trigger test_reject_location on snr_private.attendance_locations;
drop function snr_private.test_reject_location();
do $$ begin
 assert (select count(*) from snr_private.attendance_locations)=1;
 assert (select count(*) from public.audit_events where action like 'attendance.clock_%')=2;
end $$;
\echo 'PASS: failed location persistence rolls back the associated normal punch and audit atomically'

set role authenticated;
select set_config('request.jwt.claims','{"sub":"e1000000-0000-4000-8000-000000000003"}',true);
do $$ declare data jsonb;begin
 data:=public.attendance_records(current_date,current_date);
 assert data->>'total'='1';
 assert not(data->'rows'->0 ? 'clock_out_location_available');
 assert strpos(data::text,'latitude')=0;
 begin perform public.attendance_location_details(current_setting('test.geo_in')::uuid);raise exception 'Supervisor GPS';exception when sqlstate 'PT403' then null;end;
end $$;
select set_config('request.jwt.claims','{"sub":"e1000000-0000-4000-8000-000000000004"}',true);
do $$ begin
 begin perform public.attendance_location_details(current_setting('test.geo_in')::uuid);raise exception 'Other employee GPS';exception when sqlstate 'PT404' then null;end;
end $$;
select set_config('request.jwt.claims','{"sub":"e1000000-0000-4000-8000-000000000005"}',true);
do $$ begin
 begin perform public.attendance_location_details(current_setting('test.geo_in')::uuid);raise exception 'Foreign HR GPS';exception when sqlstate 'PT404' then null;end;
end $$;
select set_config('request.jwt.claims','{"sub":"e1000000-0000-4000-8000-000000000001"}',true);
do $$ declare data jsonb;begin
 data:=public.attendance_location_details(current_setting('test.geo_in')::uuid);
 assert data->'clock_out'->>'accuracy_meters'='8.4';
 assert (select count(*) from public.audit_events)=0;
 assert strpos(public.attendance_records(current_date,current_date)::text,'latitude')=0;
end $$;
reset role;
do $$ begin assert (select count(*) from public.audit_events where action='attendance.location.viewed')=2;end $$;
\echo 'PASS: precise locations are restricted to employee/HR, audited on view and absent from list/supervisor/foreign projections'

do $$ declare n integer;begin
 for n in select unnest(array[1,3,7,8]) loop
  perform set_config('request.jwt.claims',jsonb_build_object('sub','e1000000-0000-4000-8000-'||lpad(n::text,12,'0'))::text,true);
  set local role authenticated;
  begin perform public.record_attendance('clock_in',gen_random_uuid(),null,current_setting('test.geo_fix')::jsonb,'e4000000-0000-4000-8000-000000000002');raise exception 'Non-employee GPS punch';exception when sqlstate 'PT403' then null;end;
  reset role;
 end loop;
end $$;
\echo 'PASS: HR, supervisors, owners and auditors cannot submit location punches for employees'

-- A deliberately old captured-at fixture tests late recovery without a two-minute sleep.
-- Only the owner test role can make this fixture; the exposed writer rejects stale new fixes.
select set_config('test.geo_late_fix',(current_setting('test.geo_fix')::jsonb||jsonb_build_object('captured_at',clock_timestamp()-interval '10 minutes'))::text,true);
select set_config('request.jwt.claims','{"sub":"e1000000-0000-4000-8000-000000000004"}',true);
select set_config('test.geo_late',snr_private.record_attendance_without_location('clock_in','e7000000-0000-4000-8000-000000000004',null)->>'id',true);
insert into snr_private.attendance_locations(organization_id,event_id,latitude,longitude,accuracy_meters,captured_at,recorded_at,consent_version)
select organization_id,id,12.971599123,77.594566234,8.4,(current_setting('test.geo_late_fix')::jsonb->>'captured_at')::timestamptz,occurred_at,'attendance-location-v1'
 from public.attendance_events where id=current_setting('test.geo_late')::uuid;
set role authenticated;
do $$ begin
 assert public.record_attendance('clock_in','e7000000-0000-4000-8000-000000000004',null,current_setting('test.geo_late_fix')::jsonb,'e4000000-0000-4000-8000-000000000004')->>'replayed'='true';
end $$;
reset role;
update public.organization_memberships set active=false where user_id='e1000000-0000-4000-8000-000000000004';
set role authenticated;
do $$ begin
 begin perform public.attendance_location_details(current_setting('test.geo_late')::uuid);raise exception 'Revoked GPS read';exception when sqlstate 'PT403' then null;end;
 begin perform public.record_attendance('clock_in','e7000000-0000-4000-8000-000000000004',null,current_setting('test.geo_late_fix')::jsonb,'e4000000-0000-4000-8000-000000000004');raise exception 'Revoked replay';exception when sqlstate 'PT403' then null;end;
end $$;
reset role;
rollback;
\echo 'PASS: old committed GPS requests recover exactly; revocation denies subsequent location access and replay'
