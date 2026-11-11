-- Disposable PostgreSQL regression tests; never apply to production.
begin;
select set_config('test.qr.photo',jsonb_build_object('jpeg_base64','/9j/4AAQSkZJRgABAQAAAQABAAD/4gHYSUNDX1BST0ZJTEUAAQEAAAHIAAAAAAQwAABtbnRyUkdCIFhZWiAH4AABAAEAAAAAAABhY3NwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAA9tYAAQAAAADTLQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAlkZXNjAAAA8AAAACRyWFlaAAABFAAAABRnWFlaAAABKAAAABRiWFlaAAABPAAAABR3dHB0AAABUAAAABRyVFJDAAABZAAAAChnVFJDAAABZAAAAChiVFJDAAABZAAAAChjcHJ0AAABjAAAADxtbHVjAAAAAAAAAAEAAAAMZW5VUwAAAAgAAAAcAHMAUgBHAEJYWVogAAAAAAAAb6IAADj1AAADkFhZWiAAAAAAAABimQAAt4UAABjaWFlaIAAAAAAAACSgAAAPhAAAts9YWVogAAAAAAAA9tYAAQAAAADTLXBhcmEAAAAAAAQAAAACZmYAAPKnAAANWQAAE9AAAApbAAAAAAAAAABtbHVjAAAAAAAAAAEAAAAMZW5VUwAAACAAAAAcAEcAbwBvAGcAbABlACAASQBuAGMALgAgADIAMAAxADb/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAAIAAgDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAj/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFAEBAAAAAAAAAAAAAAAAAAAAAP/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/AJ/AB//Z','captured_at',clock_timestamp(),'consent_version','attendance-photo-location-v1')::text,true);
select set_config('test.qr.fix',jsonb_build_object('latitude',12.971599,'longitude',77.594566,'accuracy_meters',8,'captured_at',clock_timestamp(),'consent_version','attendance-location-v1')::text,true);
select set_config('test.qr.previous',(select id::text from public.attendance_events where employee_id='e4000000-0000-4000-8000-000000000004' order by sequence_no desc limit 1),true);
select set_config('test.qr.events',(select count(*)::text from public.attendance_events),true);
set role authenticated;
select set_config('request.jwt.claims','{"sub":"e1000000-0000-4000-8000-000000000001"}',true);
do $$ declare q jsonb;begin
 q:=public.hr_employee_attendance_qr('e4000000-0000-4000-8000-000000000004');
 assert q->>'version'='1';perform set_config('test.qr.token',q->>'token',true);
 assert public.hr_employee_attendance_qr('e4000000-0000-4000-8000-000000000004')->>'token'=q->>'token';
 begin perform public.hr_employee_attendance_qr('e4000000-0000-4000-8000-000000000005');raise exception 'Foreign employee QR';exception when sqlstate 'PT404' then null;end;
 begin perform public.hr_attendance_qr('e3000000-0000-4000-8000-000000000001');raise exception 'Store QR enabled';exception when sqlstate 'PT409' then assert sqlerrm='store_qr_disabled';end;
end $$;
select set_config('request.jwt.claims','{"sub":"e1000000-0000-4000-8000-000000000004"}',true);
do $$ declare w jsonb;begin
 w:=public.employee_qr_attendance_workspace(current_setting('test.qr.token'));
 assert w->>'employee_id'='e4000000-0000-4000-8000-000000000004';
 assert w->>'status'='clocked_in'; -- Open session from before upgrade, including overnight.
 assert w->>'last_event_id'=current_setting('test.qr.previous');
 begin perform public.hr_employee_attendance_qr('e4000000-0000-4000-8000-000000000004',true,1);raise exception 'Employee rotated QR';exception when sqlstate 'PT403' then null;end;
 begin perform public.validate_employee_qr_location(current_setting('test.qr.token'),'e4000000-0000-4000-8000-000000000004','clock_out',current_setting('test.qr.previous')::uuid,current_setting('test.qr.fix')::jsonb||'{"latitude":13}');raise exception 'Outside QR camera';exception when sqlstate 'PT409' then assert sqlerrm='outside_store_area';end;
 begin perform public.validate_employee_qr_location(current_setting('test.qr.token'),'e4000000-0000-4000-8000-000000000004','clock_out',current_setting('test.qr.previous')::uuid,current_setting('test.qr.fix')::jsonb||'{"accuracy_meters":60}');raise exception 'Inaccurate QR camera';exception when sqlstate 'PT409' then null;end;
 perform public.validate_employee_qr_location(current_setting('test.qr.token'),'e4000000-0000-4000-8000-000000000004','clock_out',current_setting('test.qr.previous')::uuid,current_setting('test.qr.fix')::jsonb);
end $$;
select set_config('test.qr.action',jsonb_build_object('id','ef000000-0000-4000-8000-000000000001','employeeId','e4000000-0000-4000-8000-000000000004','previousId',current_setting('test.qr.previous'),'type','clock_out','location',current_setting('test.qr.fix')::jsonb,'evidence',jsonb_build_object('qr',current_setting('test.qr.token'),'photo',current_setting('test.qr.photo')::jsonb))::text,true);
select public.prepare_attendance_photo(current_setting('test.qr.action')::jsonb);
reset role;
-- Even a verified upload reserved under the old QR cannot commit after rotation.
insert into storage.objects(bucket_id,name,metadata) select bucket_id,object_path,jsonb_build_object('size',byte_size,'mimetype','image/jpeg') from snr_private.attendance_photo_uploads where id='ef000000-0000-4000-8000-000000000001';
select public.verify_attendance_photo_upload(id,sha256) from snr_private.attendance_photo_uploads where id='ef000000-0000-4000-8000-000000000001';
set role authenticated;
-- A stolen QR cannot select its employee or expose employee data.
select set_config('request.jwt.claims','{"sub":"e1000000-0000-4000-8000-000000000002"}',true);
do $$ begin
 begin perform public.employee_qr_attendance_workspace(current_setting('test.qr.token'));raise exception 'Wrong employee read QR';exception when sqlstate 'PT403' then null;end;
 begin perform public.prepare_attendance_photo(current_setting('test.qr.action')::jsonb);raise exception 'Wrong employee prepared';exception when sqlstate 'PT403' then null;end;
 begin perform public.record_attendance_storage('ef000000-0000-4000-8000-000000000001','e4000000-0000-4000-8000-000000000004');raise exception 'Wrong employee commit';exception when sqlstate 'PT403' then null;end;
end $$;
select set_config('request.jwt.claims','{"sub":"e1000000-0000-4000-8000-000000000003"}',true);
do $$ begin
 begin perform public.employee_qr_attendance_workspace(current_setting('test.qr.token'));raise exception 'Supervisor QR attendance';exception when sqlstate 'PT403' then null;end;
 begin perform public.hr_employee_attendance_qr('e4000000-0000-4000-8000-000000000004');raise exception 'Supervisor issued QR';exception when sqlstate 'PT403' then null;end;
end $$;
select set_config('request.jwt.claims','{"sub":"e1000000-0000-4000-8000-000000000001"}',true);
do $$ declare q jsonb;begin
 q:=public.hr_employee_attendance_qr('e4000000-0000-4000-8000-000000000004',true,1);
 assert q->>'version'='2';assert q->>'token'<>current_setting('test.qr.token');
 perform set_config('test.qr.new',q->>'token',true);
 begin perform public.hr_employee_attendance_qr('e4000000-0000-4000-8000-000000000004',true,1);raise exception 'Stale rotation';exception when sqlstate 'PT409' then null;end;
end $$;
select set_config('request.jwt.claims','{"sub":"e1000000-0000-4000-8000-000000000004"}',true);
do $$ begin
 begin perform public.employee_qr_attendance_workspace(current_setting('test.qr.token'));raise exception 'Old link survived';exception when sqlstate 'PT403' then null;end;
 begin perform public.validate_employee_qr_location(current_setting('test.qr.token'),'e4000000-0000-4000-8000-000000000004','clock_out',current_setting('test.qr.previous')::uuid,current_setting('test.qr.fix')::jsonb);raise exception 'Old shutter survived';exception when sqlstate 'PT403' then null;end;
 begin perform public.prepare_attendance_photo(current_setting('test.qr.action')::jsonb);raise exception 'Old preparation survived';exception when sqlstate 'PT403' then null;end;
 begin perform public.record_attendance_storage('ef000000-0000-4000-8000-000000000001','e4000000-0000-4000-8000-000000000004');raise exception 'Pending old QR commit survived';exception when sqlstate 'PT403' then null;end;
end $$;
reset role;
do $$ begin assert (select count(*)::text from public.attendance_events)=current_setting('test.qr.events');end $$;
-- Successful checkout and another clock-in use unchanged private Storage/naming rules.
set role authenticated;
select set_config('test.qr.action',jsonb_set(jsonb_set(current_setting('test.qr.action')::jsonb,'{id}','"ef000000-0000-4000-8000-000000000002"'),'{evidence,qr}',to_jsonb(current_setting('test.qr.new')))::text,true);
select public.prepare_attendance_photo(current_setting('test.qr.action')::jsonb);
reset role;
insert into storage.objects(bucket_id,name,metadata) select bucket_id,object_path,jsonb_build_object('size',byte_size,'mimetype','image/jpeg') from snr_private.attendance_photo_uploads where id='ef000000-0000-4000-8000-000000000002';
select public.verify_attendance_photo_upload(id,sha256) from snr_private.attendance_photo_uploads where id='ef000000-0000-4000-8000-000000000002';
set role authenticated;
do $$ declare receipt jsonb;begin
 receipt:=public.record_attendance_storage('ef000000-0000-4000-8000-000000000002','e4000000-0000-4000-8000-000000000004');
 assert receipt->>'employee_qr_verified'='true';assert receipt->>'event_type'='clock_out';
 assert public.employee_qr_attendance_workspace(current_setting('test.qr.new'))->>'status'='clocked_out';
 perform set_config('test.qr.receipt',receipt->>'id',true);
end $$;
select set_config('request.jwt.claims','{"sub":"e1000000-0000-4000-8000-000000000001"}',true);
select public.hr_employee_attendance_qr('e4000000-0000-4000-8000-000000000004',true,2);
select set_config('request.jwt.claims','{"sub":"e1000000-0000-4000-8000-000000000004"}',true);
do $$ declare result jsonb;begin
 result:=public.prepare_attendance_photo(current_setting('test.qr.action')::jsonb)->'receipt';
 assert result->>'id'=current_setting('test.qr.receipt');assert result->>'replayed'='true';assert result->>'employee_qr_verified'='true';
 assert public.record_attendance_storage('ef000000-0000-4000-8000-000000000002','e4000000-0000-4000-8000-000000000004')->>'employee_qr_verified'='true';
 begin perform public.prepare_attendance_photo(jsonb_set(current_setting('test.qr.action')::jsonb,'{location,accuracy_meters}','9'));raise exception 'Changed retry';exception when sqlstate 'PT409' then null;end;
end $$;
reset role;
do $$ begin
 assert (select employee_qr_version from snr_private.attendance_storage_evidence where event_id=current_setting('test.qr.receipt')::uuid)=2;
 assert (select bucket_id from snr_private.attendance_storage_evidence where event_id=current_setting('test.qr.receipt')::uuid)='attendance-clock-out';
 assert not has_function_privilege('authenticated','snr_private.prepare_photo_before_employee_qr(jsonb)','execute');
 assert not has_table_privilege('authenticated','snr_private.employee_attendance_qr','select');
end $$;
-- Dashboard creation and recovery issue exactly one personal QR atomically.
set role authenticated;
select set_config('request.jwt.claims','{"sub":"e1000000-0000-4000-8000-000000000001"}',true);
select public.hr_begin_staff_account('ef000000-0000-4000-8000-000000000010','create',null,null,null,'qr-new@example.invalid',
 '{"display_name":"New QR Person","employee_number":"QR-NEW","site_id":"e3000000-0000-4000-8000-000000000001","department_id":"e5000000-0000-4000-8000-000000000001","role":"employee","active":true}',repeat('a',64));
reset role;
insert into auth.users(id,email,email_confirmed_at,raw_app_meta_data) values
 ('ef000000-0000-4000-8000-000000000011','qr-new@example.invalid',now(),
 '{"snr_admin_operation":"ef000000-0000-4000-8000-000000000010","snr_admin_actor":"e1000000-0000-4000-8000-000000000001","snr_admin_organization":"e2000000-0000-4000-8000-000000000001"}');
set role authenticated;
select public.hr_recover_staff_account('ef000000-0000-4000-8000-000000000010');
select public.hr_complete_staff_account('ef000000-0000-4000-8000-000000000010');
reset role;
do $$ begin
 assert (select count(*) from snr_private.employee_attendance_qr q join public.employee_profiles e on e.id=q.employee_id
   where e.user_id='ef000000-0000-4000-8000-000000000011' and q.version=1)=1;
end $$;
set role anon;
do $$ begin
 begin perform public.employee_qr_attendance_workspace(current_setting('test.qr.new'));raise exception 'Anonymous QR';exception when insufficient_privilege then null;end;
end $$;
reset role;
rollback;
\echo 'PASS: personal QR ownership, HR issuance/rotation, stale links/capture/commit, private proof and exact replay'
