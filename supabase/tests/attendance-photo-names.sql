-- Date-first folders and profile names with actual RLS, legacy intent and retries.
begin;
do $$ declare id1 uuid:='ed000000-0000-4000-8000-000000000010';id2 uuid:='ed000000-0000-4000-8000-000000000011';p text;begin
 p:=snr_private.attendance_photo_object_path('  Mary / Kamal  ','2026-11-11T20:00:00.123456Z','Asia/Kolkata',id1);
 assert p='2026-11-12/Mary_Kamal_2026-11-12_01-30-00.123456_'||id1||'.jpg';
 assert snr_private.attendance_photo_object_path('Mary Kamal','2026-11-11T20:00:00.123456Z','UTC',id1)
  ='2026-11-11/Mary_Kamal_2026-11-11_20-00-00.123456_'||id1||'.jpg';
 assert p<>snr_private.attendance_photo_object_path('Mary Kamal','2026-11-11T20:00:00.123456Z','Asia/Kolkata',id2);
 assert snr_private.attendance_photo_object_path('../../Alice? #& Bob','2026-11-11T20:00:00Z','UTC',id1)
  ='2026-11-11/Alice_Bob_2026-11-11_20-00-00.000000_'||id1||'.jpg';
 assert snr_private.attendance_photo_object_path('మేరీ','2026-11-11T20:00:00Z','UTC',id1)
  ='2026-11-11/Employee_2026-11-11_20-00-00.000000_'||id1||'.jpg';
 assert length(split_part(split_part(snr_private.attendance_photo_object_path(repeat('A',120),'2026-11-11T20:00:00Z','UTC',id1),'/',2),'_',1))=80;
end $$;
select set_config('test.names.oldpath',(select object_path from snr_private.attendance_photo_uploads where id='ed000000-0000-4000-8000-000000000001'),true);
select set_config('test.names.oldaction',jsonb_set((select payload-'photo_sha256' from snr_private.attendance_photo_uploads where id='ed000000-0000-4000-8000-000000000001'),'{evidence,photo,jpeg_base64}',to_jsonb('/9j/4AAQSkZJRgABAQAAAQABAAD/4gHYSUNDX1BST0ZJTEUAAQEAAAHIAAAAAAQwAABtbnRyUkdCIFhZWiAH4AABAAEAAAAAAABhY3NwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAA9tYAAQAAAADTLQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAlkZXNjAAAA8AAAACRyWFlaAAABFAAAABRnWFlaAAABKAAAABRiWFlaAAABPAAAABR3dHB0AAABUAAAABRyVFJDAAABZAAAAChnVFJDAAABZAAAAChiVFJDAAABZAAAAChjcHJ0AAABjAAAADxtbHVjAAAAAAAAAAEAAAAMZW5VUwAAAAgAAAAcAHMAUgBHAEJYWVogAAAAAAAAb6IAADj1AAADkFhZWiAAAAAAAABimQAAt4UAABjaWFlaIAAAAAAAACSgAAAPhAAAts9YWVogAAAAAAAA9tYAAQAAAADTLXBhcmEAAAAAAAQAAAACZmYAAPKnAAANWQAAE9AAAApbAAAAAAAAAABtbHVjAAAAAAAAAAEAAAAMZW5VUwAAACAAAAAcAEcAbwBvAGcAbABlACAASQBuAGMALgAgADIAMAAxADb/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAAIAAgDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAj/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFAEBAAAAAAAAAAAAAAAAAAAAAP/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/AJ/AB//Z'::text))::text,true);
update public.employee_profiles set display_name='Mary Kamal' where id='e4000000-0000-4000-8000-000000000004';
create policy test_named_storage_broad on storage.objects to public using(true) with check(true);
set role authenticated;
select set_config('request.jwt.claims','{"sub":"e1000000-0000-4000-8000-000000000004"}',true);
do $$ declare receipt jsonb;begin
 -- A profile change or naming upgrade must not regenerate an existing path.
 assert public.prepare_attendance_photo(current_setting('test.names.oldaction')::jsonb)->>'object_path'=current_setting('test.names.oldpath');
 receipt:=public.record_attendance_storage('ed000000-0000-4000-8000-000000000001','e4000000-0000-4000-8000-000000000004');
 assert receipt->>'storage_saved'='true';
 assert public.prepare_attendance_photo(current_setting('test.names.oldaction')::jsonb)->'receipt'->>'replayed'='true';
 assert public.attendance_location_details((current_setting('test.names.oldaction')::jsonb->>'previousId')::uuid)->'clock_out'->'photo'->>'object_path'=current_setting('test.names.oldpath');
end $$;
reset role;
select set_config('test.storage.photo',jsonb_build_object('jpeg_base64','/9j/4AAQSkZJRgABAQAAAQABAAD/4gHYSUNDX1BST0ZJTEUAAQEAAAHIAAAAAAQwAABtbnRyUkdCIFhZWiAH4AABAAEAAAAAAABhY3NwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAA9tYAAQAAAADTLQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAlkZXNjAAAA8AAAACRyWFlaAAABFAAAABRnWFlaAAABKAAAABRiWFlaAAABPAAAABR3dHB0AAABUAAAABRyVFJDAAABZAAAAChnVFJDAAABZAAAAChiVFJDAAABZAAAAChjcHJ0AAABjAAAADxtbHVjAAAAAAAAAAEAAAAMZW5VUwAAAAgAAAAcAHMAUgBHAEJYWVogAAAAAAAAb6IAADj1AAADkFhZWiAAAAAAAABimQAAt4UAABjaWFlaIAAAAAAAACSgAAAPhAAAts9YWVogAAAAAAAA9tYAAQAAAADTLXBhcmEAAAAAAAQAAAACZmYAAPKnAAANWQAAE9AAAApbAAAAAAAAAABtbHVjAAAAAAAAAAEAAAAMZW5VUwAAACAAAAAcAEcAbwBvAGcAbABlACAASQBuAGMALgAgADIAMAAxADb/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAAIAAgDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAj/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFAEBAAAAAAAAAAAAAAAAAAAAAP/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/AJ/AB//Z','captured_at',clock_timestamp(),'consent_version','attendance-photo-location-v1')::text,true);
select set_config('test.names.action',jsonb_build_object('id','ed000000-0000-4000-8000-000000000002','type','clock_in',
 'previousId',(select id from public.attendance_events where employee_id='e4000000-0000-4000-8000-000000000004' order by sequence_no desc limit 1),
 'employeeId','e4000000-0000-4000-8000-000000000004',
 'location',jsonb_build_object('latitude',12.971599,'longitude',77.594566,'accuracy_meters',8,'captured_at',clock_timestamp(),'consent_version','attendance-location-v1'),
 'evidence',jsonb_build_object('photo',current_setting('test.storage.photo')::jsonb))::text,true);
set role authenticated;
select set_config('request.jwt.claims','{"sub":"e1000000-0000-4000-8000-000000000004"}',true);
do $$ declare intent jsonb;begin
 begin perform public.prepare_attendance_photo(current_setting('test.names.action')::jsonb||'{"display_name":"Forged Person"}');raise exception 'Caller named their own file';exception when sqlstate 'PT422' then null;end;
 intent:=public.prepare_attendance_photo(current_setting('test.names.action')::jsonb);
 assert intent->>'bucket_id'='attendance-clock-in';
 assert intent->>'object_path' ~ '^([0-9]{4}-[0-9]{2}-[0-9]{2})/Mary_Kamal_\1_[0-9]{2}-[0-9]{2}-[0-9]{2}[.][0-9]{6}_ed000000-0000-4000-8000-000000000002[.]jpg$';
 perform set_config('test.names.path',intent->>'object_path',true);
 perform set_config('test.names.hash',intent->>'sha256',true);
end $$;
reset role;
update public.employee_profiles set display_name='Renamed Person' where id='e4000000-0000-4000-8000-000000000004';
set role authenticated;
do $$ begin assert public.prepare_attendance_photo(current_setting('test.names.action')::jsonb)->>'object_path'=current_setting('test.names.path');end $$;
reset role;
do $$ begin
 assert (select employee_name from snr_private.attendance_photo_uploads where object_path=current_setting('test.names.path'))='Mary Kamal';
 assert (select filename_timezone from snr_private.attendance_photo_uploads where object_path=current_setting('test.names.path'))='UTC';
end $$;
insert into storage.objects(bucket_id,name,metadata) select bucket_id,object_path,jsonb_build_object('size',byte_size,'mimetype','image/jpeg')
 from snr_private.attendance_photo_uploads where id='ed000000-0000-4000-8000-000000000002';
set role authenticated;
do $$ begin assert (select count(*) from storage.objects where bucket_id='attendance-clock-in' and name=current_setting('test.names.path'))=0;end $$;
reset role;
set role service_role;
select public.verify_attendance_photo_upload('ed000000-0000-4000-8000-000000000002',current_setting('test.names.hash'));
reset role;
set role authenticated;
do $$ declare receipt jsonb;begin
 receipt:=public.record_attendance_storage('ed000000-0000-4000-8000-000000000002','e4000000-0000-4000-8000-000000000004');
 assert receipt->>'storage_saved'='true';
 assert public.prepare_attendance_photo(current_setting('test.names.action')::jsonb)->'receipt'->>'replayed'='true';
 assert (select count(*) from storage.objects where bucket_id='attendance-clock-in' and name=current_setting('test.names.path'))=1;
end $$;
select set_config('request.jwt.claims','{"sub":"e1000000-0000-4000-8000-000000000002"}',true);
do $$ begin assert (select count(*) from storage.objects where name=current_setting('test.names.path'))=0;end $$;
select set_config('request.jwt.claims','{"sub":"e1000000-0000-4000-8000-000000000003"}',true);
do $$ begin assert (select count(*) from storage.objects where name=current_setting('test.names.path'))=0;end $$;
select set_config('request.jwt.claims','{"sub":"e1000000-0000-4000-8000-000000000005"}',true);
do $$ begin assert (select count(*) from storage.objects where name=current_setting('test.names.path'))=0;end $$;
select set_config('request.jwt.claims','{"sub":"e1000000-0000-4000-8000-000000000001"}',true);
do $$ begin assert (select count(*) from storage.objects where bucket_id='attendance-clock-in' and name=current_setting('test.names.path'))=1;end $$;
reset role;
set role anon;
select set_config('request.jwt.claims','{}',true);
do $$ begin assert (select count(*) from storage.objects where name=current_setting('test.names.path'))=0;end $$;
reset role;
select set_config('test.storage.photo',jsonb_build_object('jpeg_base64','/9j/4AAQSkZJRgABAQAAAQABAAD/4gHYSUNDX1BST0ZJTEUAAQEAAAHIAAAAAAQwAABtbnRyUkdCIFhZWiAH4AABAAEAAAAAAABhY3NwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAA9tYAAQAAAADTLQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAlkZXNjAAAA8AAAACRyWFlaAAABFAAAABRnWFlaAAABKAAAABRiWFlaAAABPAAAABR3dHB0AAABUAAAABRyVFJDAAABZAAAAChnVFJDAAABZAAAAChiVFJDAAABZAAAAChjcHJ0AAABjAAAADxtbHVjAAAAAAAAAAEAAAAMZW5VUwAAAAgAAAAcAHMAUgBHAEJYWVogAAAAAAAAb6IAADj1AAADkFhZWiAAAAAAAABimQAAt4UAABjaWFlaIAAAAAAAACSgAAAPhAAAts9YWVogAAAAAAAA9tYAAQAAAADTLXBhcmEAAAAAAAQAAAACZmYAAPKnAAANWQAAE9AAAApbAAAAAAAAAABtbHVjAAAAAAAAAAEAAAAMZW5VUwAAACAAAAAcAEcAbwBvAGcAbABlACAASQBuAGMALgAgADIAMAAxADb/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAAIAAgDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAj/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFAEBAAAAAAAAAAAAAAAAAAAAAP/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/AJ/AB//Z','captured_at',clock_timestamp(),'consent_version','attendance-photo-location-v1')::text,true);
-- The opening shift/event uses UTC; a later site-zone change must not rename checkout.
update public.sites set timezone='Asia/Kolkata' where id='e3000000-0000-4000-8000-000000000001';
select set_config('test.names.action',jsonb_build_object('id','ed000000-0000-4000-8000-000000000003','type','clock_out',
 'previousId',(select id from public.attendance_events where employee_id='e4000000-0000-4000-8000-000000000004' order by sequence_no desc limit 1),
 'employeeId','e4000000-0000-4000-8000-000000000004',
 'location',jsonb_build_object('latitude',12.971599,'longitude',77.594566,'accuracy_meters',8,'captured_at',clock_timestamp(),'consent_version','attendance-location-v1'),
 'evidence',jsonb_build_object('photo',current_setting('test.storage.photo')::jsonb))::text,true);
set role authenticated;
select set_config('request.jwt.claims','{"sub":"e1000000-0000-4000-8000-000000000004"}',true);
do $$ declare intent jsonb;begin
 begin perform public.prepare_attendance_photo(current_setting('test.names.action')::jsonb||'{"display_name":"Forged Person"}');raise exception 'Caller named their own file';exception when sqlstate 'PT422' then null;end;
 intent:=public.prepare_attendance_photo(current_setting('test.names.action')::jsonb);
 assert intent->>'bucket_id'='attendance-clock-out';
 assert intent->>'object_path' ~ '^([0-9]{4}-[0-9]{2}-[0-9]{2})/Renamed_Person_\1_[0-9]{2}-[0-9]{2}-[0-9]{2}[.][0-9]{6}_ed000000-0000-4000-8000-000000000003[.]jpg$';
 perform set_config('test.names.path',intent->>'object_path',true);
 perform set_config('test.names.hash',intent->>'sha256',true);
end $$;
reset role;
do $$ begin
 assert (select employee_name from snr_private.attendance_photo_uploads where object_path=current_setting('test.names.path'))='Renamed Person';
 assert (select filename_timezone from snr_private.attendance_photo_uploads where object_path=current_setting('test.names.path'))='UTC';
end $$;
insert into storage.objects(bucket_id,name,metadata) select bucket_id,object_path,jsonb_build_object('size',byte_size,'mimetype','image/jpeg')
 from snr_private.attendance_photo_uploads where id='ed000000-0000-4000-8000-000000000003';
set role authenticated;
do $$ begin assert (select count(*) from storage.objects where bucket_id='attendance-clock-out' and name=current_setting('test.names.path'))=0;end $$;
reset role;
set role service_role;
select public.verify_attendance_photo_upload('ed000000-0000-4000-8000-000000000003',current_setting('test.names.hash'));
reset role;
set role authenticated;
do $$ declare receipt jsonb;begin
 receipt:=public.record_attendance_storage('ed000000-0000-4000-8000-000000000003','e4000000-0000-4000-8000-000000000004');
 assert receipt->>'storage_saved'='true';
 assert public.prepare_attendance_photo(current_setting('test.names.action')::jsonb)->'receipt'->>'replayed'='true';
 assert (select count(*) from storage.objects where bucket_id='attendance-clock-out' and name=current_setting('test.names.path'))=1;
end $$;
select set_config('request.jwt.claims','{"sub":"e1000000-0000-4000-8000-000000000002"}',true);
do $$ begin assert (select count(*) from storage.objects where name=current_setting('test.names.path'))=0;end $$;
select set_config('request.jwt.claims','{"sub":"e1000000-0000-4000-8000-000000000003"}',true);
do $$ begin assert (select count(*) from storage.objects where name=current_setting('test.names.path'))=0;end $$;
select set_config('request.jwt.claims','{"sub":"e1000000-0000-4000-8000-000000000005"}',true);
do $$ begin assert (select count(*) from storage.objects where name=current_setting('test.names.path'))=0;end $$;
select set_config('request.jwt.claims','{"sub":"e1000000-0000-4000-8000-000000000001"}',true);
do $$ begin assert (select count(*) from storage.objects where bucket_id='attendance-clock-out' and name=current_setting('test.names.path'))=1;end $$;
reset role;
set role anon;
select set_config('request.jwt.claims','{}',true);
do $$ begin assert (select count(*) from storage.objects where name=current_setting('test.names.path'))=0;end $$;
reset role;
\echo 'PASS: date/name folders, local-midnight conversion, safe filenames, legacy recovery, profile rename, both private buckets and scoped access'
rollback;
