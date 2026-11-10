-- Create an actual 0010 upload reservation before applying 0011.
-- Disposable fixture only; this is never run against a live project.
begin;
select set_config('test.storage.photo',jsonb_build_object('jpeg_base64','/9j/4AAQSkZJRgABAQAAAQABAAD/4gHYSUNDX1BST0ZJTEUAAQEAAAHIAAAAAAQwAABtbnRyUkdCIFhZWiAH4AABAAEAAAAAAABhY3NwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAA9tYAAQAAAADTLQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAlkZXNjAAAA8AAAACRyWFlaAAABFAAAABRnWFlaAAABKAAAABRiWFlaAAABPAAAABR3dHB0AAABUAAAABRyVFJDAAABZAAAAChnVFJDAAABZAAAAChiVFJDAAABZAAAAChjcHJ0AAABjAAAADxtbHVjAAAAAAAAAAEAAAAMZW5VUwAAAAgAAAAcAHMAUgBHAEJYWVogAAAAAAAAb6IAADj1AAADkFhZWiAAAAAAAABimQAAt4UAABjaWFlaIAAAAAAAACSgAAAPhAAAts9YWVogAAAAAAAA9tYAAQAAAADTLXBhcmEAAAAAAAQAAAACZmYAAPKnAAANWQAAE9AAAApbAAAAAAAAAABtbHVjAAAAAAAAAAEAAAAMZW5VUwAAACAAAAAcAEcAbwBvAGcAbABlACAASQBuAGMALgAgADIAMAAxADb/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAAIAAgDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAj/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFAEBAAAAAAAAAAAAAAAAAAAAAP/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/AJ/AB//Z','captured_at',clock_timestamp(),'consent_version','attendance-photo-location-v1')::text,true);
select set_config('test.names.action',jsonb_build_object('id','ed000000-0000-4000-8000-000000000001','type','clock_out',
 'previousId',(select id from public.attendance_events where employee_id='e4000000-0000-4000-8000-000000000004' order by sequence_no desc limit 1),
 'employeeId','e4000000-0000-4000-8000-000000000004',
 'location',jsonb_build_object('latitude',12.971599,'longitude',77.594566,'accuracy_meters',8,'captured_at',clock_timestamp(),'consent_version','attendance-location-v1'),
 'evidence',jsonb_build_object('photo',current_setting('test.storage.photo')::jsonb))::text,true);
set role authenticated;
select set_config('request.jwt.claims','{"sub":"e1000000-0000-4000-8000-000000000004"}',true);
select public.prepare_attendance_photo(current_setting('test.names.action')::jsonb);
reset role;
insert into storage.objects(bucket_id,name,metadata) select bucket_id,object_path,jsonb_build_object('size',byte_size,'mimetype','image/jpeg')
 from snr_private.attendance_photo_uploads where id='ed000000-0000-4000-8000-000000000001';
select set_config('test.names.hash',(select sha256 from snr_private.attendance_photo_uploads where id='ed000000-0000-4000-8000-000000000001'),true);
set role service_role;
select public.verify_attendance_photo_upload('ed000000-0000-4000-8000-000000000001',current_setting('test.names.hash'));
reset role;
commit;
