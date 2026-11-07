-- Disposable local PostgreSQL only; fixtures from the upgrade suites are synthetic.
begin;
select set_config('test.store_fix',jsonb_build_object('latitude',12.971599,'longitude',77.594566,
 'accuracy_meters',8,'captured_at',clock_timestamp(),'consent_version','attendance-location-v1')::text,true);
select set_config('test.store_previous',(select id::text from public.attendance_events where idempotency_key='e8000000-0000-4000-8000-000000000002'),true);
select set_config('test.store_legacy',(select id::text from public.attendance_events where idempotency_key='e7000000-0000-4000-8000-000000000001'),true);
do $$ begin
 assert (select count(*) from snr_private.attendance_locations where store_rule_version is null)=2;
 assert snr_private.store_distance_meters(0,0,0,0)=0;
 assert abs(snr_private.store_distance_meters(0,0,1,0)-111194.9266)<0.01;
 assert snr_private.store_distance_meters(0,179.9,0,-179.9) between 22238 and 22240;
 assert snr_private.store_distance_meters(90,0,90,180)<0.001;
end $$;
set role anon;
do $$ begin
 begin perform public.hr_site_attendance_area(gen_random_uuid());raise exception 'Anonymous store access';exception when insufficient_privilege then null;end;
end $$;
reset role;
set role authenticated;
do $$ declare n integer;begin
 foreach n in array array[2,3,7,8] loop
  perform set_config('request.jwt.claims',jsonb_build_object('sub','e1000000-0000-4000-8000-'||lpad(n::text,12,'0'))::text,true);
  begin perform public.hr_site_attendance_area('e3000000-0000-4000-8000-000000000001');raise exception 'Non HR store read';exception when sqlstate 'PT403' then null;end;
  begin perform public.hr_save_site_attendance_area('e3000000-0000-4000-8000-000000000001',null,12.971599,77.594566,100);raise exception 'Non HR store edit';exception when sqlstate 'PT403' then null;end;
 end loop;
 begin perform 1 from snr_private.site_attendance_areas;raise exception 'Direct store read';exception when insufficient_privilege then null;end;
 begin perform snr_private.enforce_attendance_store_area();raise exception 'Private trigger call';exception when insufficient_privilege then null;end;
end $$;
select set_config('request.jwt.claims','{"sub":"e1000000-0000-4000-8000-000000000005"}',true);
do $$ begin
 begin perform public.hr_site_attendance_area('e3000000-0000-4000-8000-000000000001');raise exception 'Foreign HR read';exception when sqlstate 'PT404' then null;end;
 begin perform public.hr_save_site_attendance_area('e3000000-0000-4000-8000-000000000001',null,12.971599,77.594566,100);raise exception 'Foreign HR edit';exception when sqlstate 'PT404' then null;end;
end $$;
select set_config('request.jwt.claims','{"sub":"e1000000-0000-4000-8000-000000000004"}',true);
do $$ begin
 assert public.attendance_workspace()->>'store_geofence_required'='true';
 assert public.attendance_workspace()->'attendance_area'->>'configured'='false';
 begin perform public.record_attendance('clock_in',gen_random_uuid(),current_setting('test.store_previous')::uuid,current_setting('test.store_fix')::jsonb,'e4000000-0000-4000-8000-000000000004');raise exception 'Unset store clock-in';exception when sqlstate 'PT409' then assert sqlerrm='store_area_not_configured';end;
end $$;
select set_config('request.jwt.claims','{"sub":"e1000000-0000-4000-8000-000000000002"}',true);
do $$ begin
 begin perform public.record_attendance('clock_out',gen_random_uuid(),current_setting('test.store_legacy')::uuid,current_setting('test.store_fix')::jsonb,'e4000000-0000-4000-8000-000000000002');raise exception 'Unset store clock-out';exception when sqlstate 'PT409' then assert sqlerrm='store_area_not_configured';end;
end $$;
reset role;
do $$ begin
 assert (select count(*) from public.attendance_events)=3;
 assert (select count(*) from snr_private.attendance_locations)=2;
 assert (select count(*) from public.audit_events where action like 'attendance.clock_%')=3;
end $$;
\echo 'PASS: store rules fail closed for both punches; role/organization boundaries and legacy GPS are preserved'

set role authenticated;
select set_config('request.jwt.claims','{"sub":"e1000000-0000-4000-8000-000000000001"}',true);
do $$ declare radius integer;lat double precision;begin
 foreach radius in array array[null,0,9,1001] loop
  begin perform public.hr_save_site_attendance_area('e3000000-0000-4000-8000-000000000001',null,12.971599,77.594566,radius);raise exception 'Invalid radius';exception when sqlstate 'PT422' then null;end;
 end loop;
 foreach lat in array array[null,91,'NaN'::double precision,'Infinity'::double precision] loop
  begin perform public.hr_save_site_attendance_area('e3000000-0000-4000-8000-000000000001',null,lat,77.594566,100);raise exception 'Invalid latitude';exception when sqlstate 'PT422' then null;end;
 end loop;
 begin perform public.hr_save_site_attendance_area('e3000000-0000-4000-8000-000000000001',null,12.971599,-181,100);raise exception 'Invalid longitude';exception when sqlstate 'PT422' then null;end;
 assert public.hr_site_attendance_area('e3000000-0000-4000-8000-000000000001')->>'latitude' is null;
 assert public.hr_save_site_attendance_area('e3000000-0000-4000-8000-000000000001',null,12.971599,77.594566,100)->>'version'='1';
 begin perform public.hr_save_site_attendance_area('e3000000-0000-4000-8000-000000000001',null,0,0,100);raise exception 'Duplicate creation lost update';exception when sqlstate 'PT409' then assert sqlerrm='record_changed';end;
 begin perform public.hr_save_site_attendance_area('e3000000-0000-4000-8000-000000000001',9,0,0,100);raise exception 'Stale store edit';exception when sqlstate 'PT409' then assert sqlerrm='record_changed';end;
 assert public.hr_site_attendance_area('e3000000-0000-4000-8000-000000000001')->>'latitude'='12.971599';
 assert public.hr_organization_setup()->'sites'->0->>'attendance_area_configured'='true';
 assert not(public.hr_organization_setup()->'sites'->0 ? 'latitude');
end $$;
select set_config('request.jwt.claims','{"sub":"e1000000-0000-4000-8000-000000000004"}',true);
do $$ declare bad jsonb;fix jsonb:=current_setting('test.store_fix')::jsonb;receipt jsonb;begin
 assert public.attendance_workspace()->'attendance_area'->>'radius_meters'='100';
 assert not(public.attendance_workspace()->'attendance_area' ? 'latitude');
 for bad in select unnest(array[fix||'{"latitude":13}',fix||'{"latitude":12.972599}']) loop
  begin perform public.record_attendance('clock_in',gen_random_uuid(),current_setting('test.store_previous')::uuid,bad,'e4000000-0000-4000-8000-000000000004');raise exception 'Outside clock-in';exception when sqlstate 'PT409' then assert sqlerrm='outside_store_area';end;
 end loop;
 for bad in select unnest(array[fix||'{"accuracy_meters":101}',fix||'{"latitude":12.972449,"accuracy_meters":10}']) loop
  begin perform public.record_attendance('clock_in',gen_random_uuid(),current_setting('test.store_previous')::uuid,bad,'e4000000-0000-4000-8000-000000000004');raise exception 'Uncertain clock-in';exception when sqlstate 'PT409' then assert sqlerrm='store_location_uncertain';end;
 end loop;
 receipt:=public.record_attendance('clock_in','e9000000-0000-4000-8000-000000000001',current_setting('test.store_previous')::uuid,fix,'e4000000-0000-4000-8000-000000000004');
 perform set_config('test.store_in',receipt->>'id',true);
 assert receipt->>'location_saved'='true';
end $$;
reset role;
do $$ begin
 assert (select count(*) from public.attendance_events)=4;
 assert (select count(*) from snr_private.attendance_locations)=3;
 assert (select count(*) from public.audit_events where action like 'attendance.clock_%')=4;
 assert (select store_policy_version from snr_private.attendance_locations where event_id=current_setting('test.store_in')::uuid)=1;
 assert (select store_distance_meters from snr_private.attendance_locations where event_id=current_setting('test.store_in')::uuid)=0;
end $$;
\echo 'PASS: HR configuration uses versions; outside and uncertain positions cannot leave partial clock-ins'

set role authenticated;
select set_config('request.jwt.claims','{"sub":"e1000000-0000-4000-8000-000000000001"}',true);
select public.hr_save_site_attendance_area('e3000000-0000-4000-8000-000000000001',1,13,77.594566,100);
select set_config('request.jwt.claims','{"sub":"e1000000-0000-4000-8000-000000000004"}',true);
do $$ declare fix jsonb:=current_setting('test.store_fix')::jsonb;begin
 assert public.record_attendance('clock_in','e9000000-0000-4000-8000-000000000001',current_setting('test.store_previous')::uuid,fix,'e4000000-0000-4000-8000-000000000004')->>'replayed'='true';
 begin perform public.record_attendance('clock_out',gen_random_uuid(),current_setting('test.store_in')::uuid,fix,'e4000000-0000-4000-8000-000000000004');raise exception 'Old policy allowed new out';exception when sqlstate 'PT409' then assert sqlerrm='outside_store_area';end;
 assert public.attendance_workspace()->>'status'='clocked_in';
end $$;
select set_config('request.jwt.claims','{"sub":"e1000000-0000-4000-8000-000000000001"}',true);
select public.hr_save_site_attendance_area('e3000000-0000-4000-8000-000000000001',2,12.971599,77.594566,100);
reset role;
update public.sites set active=false where id='e3000000-0000-4000-8000-000000000001';
set role authenticated;
select set_config('request.jwt.claims','{"sub":"e1000000-0000-4000-8000-000000000004"}',true);
do $$ declare fix jsonb:=current_setting('test.store_fix')::jsonb;receipt jsonb;data jsonb;begin
 begin perform public.record_attendance('clock_out',gen_random_uuid(),current_setting('test.store_in')::uuid,fix||'{"latitude":13}','e4000000-0000-4000-8000-000000000004');raise exception 'Outside clock-out';exception when sqlstate 'PT409' then assert sqlerrm='outside_store_area';end;
 begin perform public.record_attendance('clock_out',gen_random_uuid(),current_setting('test.store_in')::uuid,fix||'{"accuracy_meters":101}','e4000000-0000-4000-8000-000000000004');raise exception 'Uncertain clock-out';exception when sqlstate 'PT409' then assert sqlerrm='store_location_uncertain';end;
 receipt:=public.record_attendance('clock_out','e9000000-0000-4000-8000-000000000002',current_setting('test.store_in')::uuid,fix,'e4000000-0000-4000-8000-000000000004');
 assert receipt->>'location_saved'='true';
 assert public.record_attendance('clock_out','e9000000-0000-4000-8000-000000000002',current_setting('test.store_in')::uuid,fix,'e4000000-0000-4000-8000-000000000004')->>'replayed'='true';
 data:=public.attendance_location_details(current_setting('test.store_in')::uuid);
 assert data->'clock_in'->>'store_policy_version'='1';
 assert data->'clock_out'->>'store_policy_version'='3';
 assert data->'clock_out'->>'store_radius_meters'='100';
 assert data->'clock_in'->>'latitude'='12.971599';
end $$;
select set_config('request.jwt.claims','{"sub":"e1000000-0000-4000-8000-000000000002"}',true);
do $$ declare data jsonb;begin
 perform public.record_attendance('clock_out','e9000000-0000-4000-8000-000000000003',current_setting('test.store_legacy')::uuid,current_setting('test.store_fix')::jsonb,'e4000000-0000-4000-8000-000000000002');
 data:=public.attendance_location_details(current_setting('test.store_legacy')::uuid);
 assert data->'clock_in'='null'::jsonb;
 assert data->'clock_out'->>'store_rule_version'='store-radius-v1';
 begin perform public.attendance_location_details(current_setting('test.store_in')::uuid);raise exception 'Other employee GPS';exception when sqlstate 'PT404' then null;end;
end $$;
select set_config('request.jwt.claims','{"sub":"e1000000-0000-4000-8000-000000000003"}',true);
do $$ begin
 begin perform public.attendance_location_details(current_setting('test.store_in')::uuid);raise exception 'Supervisor GPS';exception when sqlstate 'PT403' then null;end;
end $$;
reset role;
do $$ begin
 assert (select count(*) from public.attendance_events)=6;
 assert (select count(*) from snr_private.attendance_locations)=5;
 assert (select count(*) from public.audit_events where action like 'attendance.clock_%')=6;
 assert (select count(*) from public.audit_events where action='site.attendance_area.saved')=3;
 assert (select count(*) from snr_private.attendance_locations where store_rule_version is null)=2;
 assert not exists(select 1 from snr_private.attendance_locations l join public.attendance_events ev on ev.id=l.event_id
   where l.store_site_id is not null and l.store_site_id<>ev.site_id);
 begin update snr_private.attendance_locations set store_radius_meters=1000 where store_rule_version is not null;raise exception 'Store history rewritten';exception when raise_exception then if sqlerrm='Store history rewritten' then raise;end if;end;
end $$;
\echo 'PASS: clock-out checks the open store; accepted replays and immutable policy snapshots survive config changes'
rollback;
