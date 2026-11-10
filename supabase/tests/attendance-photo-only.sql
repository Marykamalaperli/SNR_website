-- Disposable local Storage metadata + real RLS/transactions. Not a live upload test.
begin;
select set_config('test.storage.photo',jsonb_build_object('jpeg_base64','/9j/4AAQSkZJRgABAQAAAQABAAD/4gHYSUNDX1BST0ZJTEUAAQEAAAHIAAAAAAQwAABtbnRyUkdCIFhZWiAH4AABAAEAAAAAAABhY3NwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAA9tYAAQAAAADTLQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAlkZXNjAAAA8AAAACRyWFlaAAABFAAAABRnWFlaAAABKAAAABRiWFlaAAABPAAAABR3dHB0AAABUAAAABRyVFJDAAABZAAAAChnVFJDAAABZAAAAChiVFJDAAABZAAAAChjcHJ0AAABjAAAADxtbHVjAAAAAAAAAAEAAAAMZW5VUwAAAAgAAAAcAHMAUgBHAEJYWVogAAAAAAAAb6IAADj1AAADkFhZWiAAAAAAAABimQAAt4UAABjaWFlaIAAAAAAAACSgAAAPhAAAts9YWVogAAAAAAAA9tYAAQAAAADTLXBhcmEAAAAAAAQAAAACZmYAAPKnAAANWQAAE9AAAApbAAAAAAAAAABtbHVjAAAAAAAAAAEAAAAMZW5VUwAAACAAAAAcAEcAbwBvAGcAbABlACAASQBuAGMALgAgADIAMAAxADb/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAAIAAgDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAj/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFAEBAAAAAAAAAAAAAAAAAAAAAP/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/AJ/AB//Z','captured_at',clock_timestamp(),'consent_version','attendance-photo-location-v1')::text,true);
select set_config('test.storage.fix',jsonb_build_object('latitude',12.971599,'longitude',77.594566,'accuracy_meters',8,'captured_at',clock_timestamp(),'consent_version','attendance-location-v1')::text,true);
select set_config('test.storage.previous',(select id::text from public.attendance_events where employee_id='e4000000-0000-4000-8000-000000000004' order by sequence_no desc limit 1),true);
select set_config('test.storage.events',(select count(*)::text from public.attendance_events),true);
select set_config('test.storage.oldphotos',(select count(*)::text from snr_private.attendance_evidence),true);
select set_config('test.storage.action',jsonb_build_object('id','ec000000-0000-4000-8000-000000000001','type','clock_out',
 'previousId',current_setting('test.storage.previous'),'employeeId','e4000000-0000-4000-8000-000000000004',
 'location',current_setting('test.storage.fix')::jsonb,'evidence',jsonb_build_object('photo',current_setting('test.storage.photo')::jsonb))::text,true);
-- Even a permissive unrelated policy cannot expose these buckets or allow writes.
create policy test_storage_broad on storage.objects to public using(true) with check(true);
set role authenticated;
select set_config('request.jwt.claims','{"sub":"e1000000-0000-4000-8000-000000000004"}',true);
do $$ declare result jsonb;begin
 assert public.attendance_workspace()->>'storage_required'='true';
 assert public.attendance_workspace()->>'qr_required'='false';
 assert public.attendance_workspace()->>'attendance_capture_policy'='store-50m-photo-v1';
 assert public.attendance_workspace()->'attendance_area'->>'radius_meters'='50';
 begin perform public.verify_attendance_qr('obsolete');raise exception 'QR verifier still enabled';exception when sqlstate 'PT409' then assert sqlerrm='store_qr_disabled';end;
 -- 55 metres was inside the previous 100-metre area, but cannot open a camera now.
 begin perform public.validate_attendance_location('e4000000-0000-4000-8000-000000000004','clock_out',current_setting('test.storage.previous')::uuid,current_setting('test.storage.fix')::jsonb||jsonb_build_object('latitude',12.971599+55.0/111194.93));raise exception '55-metre camera allowed';exception when sqlstate 'PT409' then assert sqlerrm='outside_store_area';end;
 perform public.validate_attendance_location('e4000000-0000-4000-8000-000000000004','clock_out',current_setting('test.storage.previous')::uuid,current_setting('test.storage.fix')::jsonb||jsonb_build_object('latitude',12.971599+40.0/111194.93));
 begin perform public.validate_attendance_location('e4000000-0000-4000-8000-000000000004','clock_out',current_setting('test.storage.previous')::uuid,current_setting('test.storage.fix')::jsonb||jsonb_build_object('latitude',12.971599+45.0/111194.93));raise exception 'Uncertain camera allowed';exception when sqlstate 'PT409' then assert sqlerrm='store_location_uncertain';end;
 begin perform public.prepare_attendance_photo(jsonb_set(current_setting('test.storage.action')::jsonb,'{location,latitude}',to_jsonb(12.971599+55.0/111194.93)));raise exception '55-metre upload allowed';exception when sqlstate 'PT409' then assert sqlerrm='outside_store_area';end;
 assert public.validate_attendance_location('e4000000-0000-4000-8000-000000000004','clock_out',current_setting('test.storage.previous')::uuid,current_setting('test.storage.fix')::jsonb)->>'distance_meters'='0';
 begin perform public.validate_attendance_location('e4000000-0000-4000-8000-000000000004','clock_out',current_setting('test.storage.previous')::uuid,current_setting('test.storage.fix')::jsonb||'{"latitude":13}');raise exception 'Outside camera allowed';exception when sqlstate 'PT409' then assert sqlerrm='outside_store_area';end;
 begin perform public.prepare_attendance_photo(jsonb_set(current_setting('test.storage.action')::jsonb,'{evidence,photo,captured_at}',to_jsonb(clock_timestamp()-interval '1 minute')));raise exception 'Stale shutter accepted';exception when sqlstate 'PT422' then null;end;
 result:=public.prepare_attendance_photo(current_setting('test.storage.action')::jsonb);
 assert result->>'bucket_id'='attendance-clock-out';
 assert result->>'object_path' ~ '^e2000000-0000-4000-8000-000000000001/e1000000-0000-4000-8000-000000000004/e1000000-0000-4000-8000-000000000004_[0-9]{4}-[0-9]{2}-[0-9]{2}_[0-9]{2}-[0-9]{2}-[0-9]{2}[.][0-9]{6}_ec000000-0000-4000-8000-000000000001[.]jpg$';
 perform set_config('test.storage.path',result->>'object_path',true);
 perform set_config('test.storage.hash',result->>'sha256',true);
 begin insert into storage.objects(bucket_id,name,metadata) values('attendance-clock-out',result->>'object_path','{}');raise exception 'Browser upload accepted';exception when insufficient_privilege then null;end;
 begin perform public.verify_attendance_photo_upload('ec000000-0000-4000-8000-000000000001',result->>'sha256');raise exception 'Browser verified itself';exception when insufficient_privilege then null;end;
 begin perform public.record_attendance_storage('ec000000-0000-4000-8000-000000000001','e4000000-0000-4000-8000-000000000004');raise exception 'Missing upload committed';exception when sqlstate 'PT409' then assert sqlerrm='attendance_photo_not_uploaded';end;
end $$;
reset role;
do $$ begin
 assert (select count(*) from public.attendance_events)=current_setting('test.storage.events')::int;
 assert (select count(*) from snr_private.attendance_storage_evidence)=0;
 assert (select count(*) from storage.buckets where public and id in('attendance-clock-in','attendance-clock-out'))=0;
end $$;
insert into storage.objects(bucket_id,name,metadata)
 select bucket_id,object_path,jsonb_build_object('size',byte_size,'mimetype','image/jpeg') from snr_private.attendance_photo_uploads where id='ec000000-0000-4000-8000-000000000001';
set role authenticated;
do $$ begin assert (select count(*) from storage.objects where bucket_id='attendance-clock-out')=0;end $$;
reset role;
set role service_role;
select public.verify_attendance_photo_upload('ec000000-0000-4000-8000-000000000001',current_setting('test.storage.hash'));
reset role;
update snr_private.site_attendance_areas set latitude=latitude+0.001 where site_id='e3000000-0000-4000-8000-000000000001';
set role authenticated;
do $$ begin
 begin perform public.record_attendance_storage('ec000000-0000-4000-8000-000000000001','e4000000-0000-4000-8000-000000000004');raise exception 'Outdated store allowed commit';exception when sqlstate 'PT409' then assert sqlerrm='outside_store_area';end;
end $$;
reset role;
update snr_private.site_attendance_areas set latitude=12.971599 where site_id='e3000000-0000-4000-8000-000000000001';
set role authenticated;
do $$ declare receipt jsonb;begin
 receipt:=public.record_attendance_storage('ec000000-0000-4000-8000-000000000001','e4000000-0000-4000-8000-000000000004');
 assert receipt->>'storage_saved'='true';
 assert receipt->>'qr_required'='false' and receipt->>'qr_verified'='false';
 assert public.attendance_location_details(current_setting('test.storage.previous')::uuid)->'clock_out'->>'store_radius_meters'='50';
 assert public.attendance_location_details(current_setting('test.storage.previous')::uuid)->'clock_out'->'photo'->>'qr_verified'='false';
 assert public.attendance_location_details(current_setting('test.storage.previous')::uuid)->'clock_in'->'photo'->>'qr_verified'='true';
 assert public.prepare_attendance_photo(current_setting('test.storage.action')::jsonb)->'receipt'->>'replayed'='true';
 assert public.attendance_location_details(current_setting('test.storage.previous')::uuid)->'clock_out'->'photo'->>'bucket_id'='attendance-clock-out';
 assert public.attendance_location_details(current_setting('test.storage.previous')::uuid)->'clock_in'->'photo'->>'jpeg_base64' is not null;
 assert (select count(*) from storage.objects where bucket_id='attendance-clock-out')=1;
 begin update storage.objects set name='replaced' where bucket_id='attendance-clock-out';assert not found;end;
 delete from storage.objects where bucket_id='attendance-clock-out';assert not found;
 begin perform public.record_attendance('clock_in',gen_random_uuid(),(receipt->>'id')::uuid,current_setting('test.storage.fix')::jsonb,'e4000000-0000-4000-8000-000000000004',current_setting('test.storage.action')::jsonb->'evidence');raise exception 'Old writer bypass';exception when sqlstate 'PT409' then assert sqlerrm='attendance_storage_required';end;
end $$;
select set_config('request.jwt.claims','{"sub":"e1000000-0000-4000-8000-000000000002"}',true);
do $$ begin assert (select count(*) from storage.objects where bucket_id='attendance-clock-out')=0;end $$;
select set_config('request.jwt.claims','{"sub":"e1000000-0000-4000-8000-000000000003"}',true);
do $$ begin assert (select count(*) from storage.objects where bucket_id='attendance-clock-out')=0;end $$;
select set_config('request.jwt.claims','{"sub":"e1000000-0000-4000-8000-000000000005"}',true);
do $$ begin assert (select count(*) from storage.objects where bucket_id='attendance-clock-out')=0;end $$;
select set_config('request.jwt.claims','{"sub":"e1000000-0000-4000-8000-000000000001"}',true);
do $$ declare area jsonb;begin
 assert (select count(*) from storage.objects where bucket_id='attendance-clock-out')=1;
 begin perform public.hr_attendance_qr('e3000000-0000-4000-8000-000000000001');raise exception 'HR QR still enabled';exception when sqlstate 'PT409' then assert sqlerrm='store_qr_disabled';end;
 area:=public.hr_site_attendance_area('e3000000-0000-4000-8000-000000000001');
 begin perform public.hr_save_site_attendance_area('e3000000-0000-4000-8000-000000000001',(area->>'version')::int,12.971599,77.594566,100,'');raise exception 'HR enlarged radius';exception when sqlstate 'PT422' then assert sqlerrm='invalid_store_area';end;
 perform set_config('test.storage.newsite',public.hr_save_attendance_site(null,null,'Photo only store','Asia/Kolkata',12.971599,77.594566,50,null,'https://maps.google.com/?q=12.971599,77.594566')::text,true);
 perform public.hr_save_site_attendance_area('e3000000-0000-4000-8000-000000000001',(area->>'version')::int,12.971599,77.594566,50,'https://maps.google.com/?q=12.971599,77.594566');
 assert public.hr_site_attendance_area('e3000000-0000-4000-8000-000000000001')->>'map_url'='https://maps.google.com/?q=12.971599,77.594566';
end $$;
reset role;
do $$ begin
 assert (select count(*) from public.attendance_events)=current_setting('test.storage.events')::int+1;
 assert (select count(*) from snr_private.attendance_evidence)=current_setting('test.storage.oldphotos')::int;
 assert (select count(*) from snr_private.attendance_storage_evidence)=1;
 assert not exists(select 1 from snr_private.site_attendance_qr where site_id=current_setting('test.storage.newsite')::uuid);
 assert not exists(select 1 from snr_private.site_attendance_areas where radius_meters<>50);
 assert exists(select 1 from snr_private.attendance_locations where store_radius_meters=100);
 begin update snr_private.site_attendance_areas set radius_meters=100 where site_id='e3000000-0000-4000-8000-000000000001';raise exception 'Fixed radius constraint bypassed';exception when check_violation then null;end;
end $$;
set role anon;
select set_config('request.jwt.claims','{}',true);
do $$ begin
 assert (select count(*) from storage.objects where bucket_id='attendance-clock-out')=0;
 begin insert into storage.objects(bucket_id,name,metadata) values('attendance-clock-out','anonymous.jpg','{}');raise exception 'Anonymous bucket write';exception when insufficient_privilege then null;end;
end $$;
reset role;

select set_config('test.storage.action',jsonb_build_object('id','ec000000-0000-4000-8000-000000000002','type','clock_in',
 'previousId',(select id from public.attendance_events where employee_id='e4000000-0000-4000-8000-000000000004' order by sequence_no desc limit 1),
 'employeeId','e4000000-0000-4000-8000-000000000004',
 'location',current_setting('test.storage.fix')::jsonb||jsonb_build_object('captured_at',clock_timestamp()),
 'evidence',jsonb_build_object('photo',current_setting('test.storage.photo')::jsonb||jsonb_build_object('captured_at',clock_timestamp())))::text,true);
set role authenticated;
select set_config('request.jwt.claims','{"sub":"e1000000-0000-4000-8000-000000000004"}',true);
do $$ declare intent jsonb;begin
 intent:=public.prepare_attendance_photo(current_setting('test.storage.action')::jsonb);
 assert intent->>'bucket_id'='attendance-clock-in';
 perform set_config('test.storage.hash',intent->>'sha256',true);
end $$;
reset role;
insert into storage.objects(bucket_id,name,metadata) select bucket_id,object_path,jsonb_build_object('size',byte_size,'mimetype','image/jpeg') from snr_private.attendance_photo_uploads where id='ec000000-0000-4000-8000-000000000002';
set role service_role;
select public.verify_attendance_photo_upload('ec000000-0000-4000-8000-000000000002',current_setting('test.storage.hash'));
reset role;
set role authenticated;
do $$ declare receipt jsonb;begin
 receipt:=public.record_attendance_storage('ec000000-0000-4000-8000-000000000002','e4000000-0000-4000-8000-000000000004');
 assert receipt->>'event_type'='clock_in' and receipt->>'storage_saved'='true' and receipt->>'qr_required'='false' and receipt->>'qr_verified'='false';
 assert public.prepare_attendance_photo(current_setting('test.storage.action')::jsonb)->'receipt'->>'replayed'='true';
end $$;
reset role;

select set_config('test.storage.action',jsonb_build_object('id','ec000000-0000-4000-8000-000000000003','type','clock_out',
 'previousId',(select id from public.attendance_events where employee_id='e4000000-0000-4000-8000-000000000004' order by sequence_no desc limit 1),
 'employeeId','e4000000-0000-4000-8000-000000000004',
 'location',current_setting('test.storage.fix')::jsonb||jsonb_build_object('captured_at',clock_timestamp()),
 'evidence',jsonb_build_object('photo',current_setting('test.storage.photo')::jsonb||jsonb_build_object('captured_at',clock_timestamp())))::text,true);
set role authenticated;
select set_config('request.jwt.claims','{"sub":"e1000000-0000-4000-8000-000000000004"}',true);
do $$ declare intent jsonb;begin
 intent:=public.prepare_attendance_photo(current_setting('test.storage.action')::jsonb);
 assert intent->>'bucket_id'='attendance-clock-out';
 perform set_config('test.storage.hash',intent->>'sha256',true);
end $$;
reset role;
insert into storage.objects(bucket_id,name,metadata) select bucket_id,object_path,jsonb_build_object('size',byte_size,'mimetype','image/jpeg') from snr_private.attendance_photo_uploads where id='ec000000-0000-4000-8000-000000000003';
set role service_role;
select public.verify_attendance_photo_upload('ec000000-0000-4000-8000-000000000003',current_setting('test.storage.hash'));
reset role;
set role authenticated;
do $$ declare receipt jsonb;begin
 receipt:=public.record_attendance_storage('ec000000-0000-4000-8000-000000000003','e4000000-0000-4000-8000-000000000004');
 assert receipt->>'event_type'='clock_out' and receipt->>'storage_saved'='true' and receipt->>'qr_required'='false' and receipt->>'qr_verified'='false';
 assert public.prepare_attendance_photo(current_setting('test.storage.action')::jsonb)->'receipt'->>'replayed'='true';
end $$;
reset role;
\echo 'PASS: photo-only clock-in/out, fixed 50-metre preflight/commit, no QR provisioning, private Storage and unchanged history'
rollback;
