-- Disposable test only: a QR grants attendance actions, never a general session.
begin;
-- Match the real Auth account suspension/deletion fields in this disposable harness.
alter table auth.users add column banned_until timestamptz, add column deleted_at timestamptz;
select set_config('request.jwt.claims','{"sub":"e1000000-0000-4000-8000-000000000001"}',true);
set role authenticated;
select set_config('test.access.qr',public.hr_employee_attendance_qr('e4000000-0000-4000-8000-000000000004')->>'token',true);
-- Browser roles cannot call the privileged capability dispatcher directly.
do $$ begin
 begin perform public.employee_qr_attendance_gateway(current_setting('test.access.qr'),'workspace');raise exception 'Authenticated gateway bypass';exception when insufficient_privilege then null;end;
end $$;
reset role;
set role anon;
do $$ begin
 begin perform public.employee_qr_attendance_gateway(current_setting('test.access.qr'),'workspace');raise exception 'Anonymous direct RPC';exception when insufficient_privilege then null;end;
end $$;
reset role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
set role service_role;
do $$ declare result jsonb;begin
 result:=public.employee_qr_attendance_gateway(current_setting('test.access.qr'),'workspace');
 assert result->>'employee_id'='e4000000-0000-4000-8000-000000000004';
 assert result->>'status'='clocked_in';
 assert not (result ?| array['role','sites','departments','schedule','access_token','refresh_token','user_id']);
 assert current_setting('request.jwt.claims')='{"role":"service_role"}';
 begin perform public.employee_qr_attendance_gateway(current_setting('test.access.qr'),'records');raise exception 'Arbitrary operation';exception when sqlstate 'PT403' then null;end;
 begin perform public.employee_qr_attendance_gateway(current_setting('test.access.qr'),'context','{"employeeId":"e4000000-0000-4000-8000-000000000002"}');raise exception 'Forged subject';exception when sqlstate 'PT403' then null;end;
 assert current_setting('request.jwt.claims')='{"role":"service_role"}';
 perform set_config('test.access.previous',result->>'last_event_id',true);
end $$;
select set_config('test.access.fix',jsonb_build_object('latitude',12.971599,'longitude',77.594566,'accuracy_meters',8,'captured_at',clock_timestamp(),'consent_version','attendance-location-v1')::text,true);
select set_config('test.access.photo',jsonb_build_object('jpeg_base64','/9j/4AAQSkZJRgABAQAAAQABAAD/4gHYSUNDX1BST0ZJTEUAAQEAAAHIAAAAAAQwAABtbnRyUkdCIFhZWiAH4AABAAEAAAAAAABhY3NwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAA9tYAAQAAAADTLQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAlkZXNjAAAA8AAAACRyWFlaAAABFAAAABRnWFlaAAABKAAAABRiWFlaAAABPAAAABR3dHB0AAABUAAAABRyVFJDAAABZAAAAChnVFJDAAABZAAAAChiVFJDAAABZAAAAChjcHJ0AAABjAAAADxtbHVjAAAAAAAAAAEAAAAMZW5VUwAAAAgAAAAcAHMAUgBHAEJYWVogAAAAAAAAb6IAADj1AAADkFhZWiAAAAAAAABimQAAt4UAABjaWFlaIAAAAAAAACSgAAAPhAAAts9YWVogAAAAAAAA9tYAAQAAAADTLXBhcmEAAAAAAAQAAAACZmYAAPKnAAANWQAAE9AAAApbAAAAAAAAAABtbHVjAAAAAAAAAAEAAAAMZW5VUwAAACAAAAAcAEcAbwBvAGcAbABlACAASQBuAGMALgAgADIAMAAxADb/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAAIAAgDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAj/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFAEBAAAAAAAAAAAAAAAAAAAAAP/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/AJ/AB//Z','captured_at',clock_timestamp(),'consent_version','attendance-photo-location-v1')::text,true);
select set_config('test.access.action',jsonb_build_object('id','f0000000-0000-4000-8000-000000000001','employeeId','e4000000-0000-4000-8000-000000000004','type','clock_out','previousId',current_setting('test.access.previous'),'location',current_setting('test.access.fix')::jsonb,'evidence',jsonb_build_object('qr',current_setting('test.access.qr'),'photo',current_setting('test.access.photo')::jsonb))::text,true);
do $$ begin
 begin perform public.employee_qr_attendance_gateway(current_setting('test.access.qr'),'location',jsonb_set(current_setting('test.access.action')::jsonb,'{location,latitude}','13'));raise exception 'Outside area';exception when sqlstate 'PT409' then assert sqlerrm='outside_store_area';end;
 begin perform public.employee_qr_attendance_gateway(current_setting('test.access.qr'),'location',jsonb_set(current_setting('test.access.action')::jsonb,'{location,accuracy_meters}','60'));raise exception 'Inaccurate area';exception when sqlstate 'PT409' then assert sqlerrm='store_location_uncertain';end;
 perform public.employee_qr_attendance_gateway(current_setting('test.access.qr'),'location',current_setting('test.access.action')::jsonb);
 perform public.employee_qr_attendance_gateway(current_setting('test.access.qr'),'prepare',current_setting('test.access.action')::jsonb);
 begin perform public.employee_qr_attendance_gateway(current_setting('test.access.qr'),'commit',current_setting('test.access.action')::jsonb);raise exception 'Photo not uploaded';exception when sqlstate 'PT409' then assert sqlerrm='attendance_photo_not_uploaded';end;
 assert current_setting('request.jwt.claims')='{"role":"service_role"}';
end $$;
reset role;
insert into storage.objects(bucket_id,name,metadata) select bucket_id,object_path,jsonb_build_object('size',byte_size,'mimetype','image/jpeg') from snr_private.attendance_photo_uploads where id='f0000000-0000-4000-8000-000000000001';
select set_config('test.access.hash',(select sha256 from snr_private.attendance_photo_uploads where id='f0000000-0000-4000-8000-000000000001'),true);
set role service_role;
select public.verify_attendance_photo_upload('f0000000-0000-4000-8000-000000000001',current_setting('test.access.hash'));
do $$ declare receipt jsonb;begin
 receipt:=public.employee_qr_attendance_gateway(current_setting('test.access.qr'),'commit',current_setting('test.access.action')::jsonb);
 assert receipt->>'employee_qr_verified'='true';assert receipt->>'storage_saved'='true';
 assert public.employee_qr_attendance_gateway(current_setting('test.access.qr'),'commit',current_setting('test.access.action')::jsonb)->>'replayed'='true';
 assert public.employee_qr_attendance_gateway(current_setting('test.access.qr'),'workspace')->>'status'='clocked_out';
end $$;
reset role;
-- Immediate QR rotation and account deactivation block unsigned access.
select set_config('request.jwt.claims','{"sub":"e1000000-0000-4000-8000-000000000001"}',true);
set role authenticated;
select public.hr_employee_attendance_qr('e4000000-0000-4000-8000-000000000004',true,1);
reset role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
set role service_role;
do $$ begin
 begin perform public.employee_qr_attendance_gateway(current_setting('test.access.qr'),'workspace');raise exception 'Old unsigned QR survived';exception when sqlstate 'PT403' then null;end;
 assert current_setting('request.jwt.claims')='{"role":"service_role"}';
end $$;
reset role;
select set_config('test.access.new',(select token::text from snr_private.employee_attendance_qr where employee_id='e4000000-0000-4000-8000-000000000004'),true);
-- Suspension/deletion must not be bypassed by a still-current QR.
update auth.users set banned_until=clock_timestamp()+interval '1 day' where id='e1000000-0000-4000-8000-000000000004';
set role service_role;
do $$ begin
 begin perform public.employee_qr_attendance_gateway(current_setting('test.access.new'),'workspace');raise exception 'Banned Auth QR access';exception when sqlstate 'PT403' then null;end;
end $$;
reset role;
update auth.users set banned_until=null,deleted_at=clock_timestamp() where id='e1000000-0000-4000-8000-000000000004';
set role service_role;
do $$ begin
 begin perform public.employee_qr_attendance_gateway(current_setting('test.access.new'),'workspace');raise exception 'Deleted Auth QR access';exception when sqlstate 'PT403' then null;end;
end $$;
reset role;
update auth.users set deleted_at=null where id='e1000000-0000-4000-8000-000000000004';
update snr_private.employee_qr_request_limits set requests=180,window_started=clock_timestamp() where employee_id='e4000000-0000-4000-8000-000000000004';
set role service_role;
do $$ begin
 begin perform public.employee_qr_attendance_gateway(current_setting('test.access.new'),'workspace');raise exception 'QR rate limit bypass';exception when sqlstate 'PT429' then null;end;
 assert current_setting('request.jwt.claims')='{"role":"service_role"}';
end $$;
reset role;
update public.organization_memberships set active=false where user_id='e1000000-0000-4000-8000-000000000004';
set role service_role;
do $$ begin
 begin perform public.employee_qr_attendance_gateway(current_setting('test.access.new'),'workspace');raise exception 'Revoked QR access';exception when sqlstate 'PT403' then null;end;
end $$;
reset role;
rollback;
\echo 'PASS: attendance-only QR capability, no session, restricted RPC grants, location/photo validation, replay, rotation and revocation'
