-- Disposable PostgreSQL only: production permission, identity and deadline rules.
begin;
select set_config('request.jwt.claims','{"sub":"e1000000-0000-4000-8000-000000000004","session_id":"f1000000-0000-4000-8000-000000000001"}',true);
create function snr_private.test_security_action(p_id uuid,p_kind text,p_check uuid default null) returns jsonb language sql security definer set search_path='' as $$
 select jsonb_build_object('id',p_id,'type',p_kind,'employeeId','e4000000-0000-4000-8000-000000000004',
 'previousId',(select id from public.attendance_events where employee_id='e4000000-0000-4000-8000-000000000004' order by sequence_no desc limit 1),
 'location',jsonb_build_object('latitude',12.971599,'longitude',77.594566,'accuracy_meters',8,'captured_at',clock_timestamp(),'consent_version','attendance-location-v1'),
 'evidence',jsonb_build_object('photo',jsonb_build_object('jpeg_base64','/9j/4AAQSkZJRgABAQAAAQABAAD/4gHYSUNDX1BST0ZJTEUAAQEAAAHIAAAAAAQwAABtbnRyUkdCIFhZWiAH4AABAAEAAAAAAABhY3NwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAA9tYAAQAAAADTLQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAlkZXNjAAAA8AAAACRyWFlaAAABFAAAABRnWFlaAAABKAAAABRiWFlaAAABPAAAABR3dHB0AAABUAAAABRyVFJDAAABZAAAAChnVFJDAAABZAAAAChiVFJDAAABZAAAAChjcHJ0AAABjAAAADxtbHVjAAAAAAAAAAEAAAAMZW5VUwAAAAgAAAAcAHMAUgBHAEJYWVogAAAAAAAAb6IAADj1AAADkFhZWiAAAAAAAABimQAAt4UAABjaWFlaIAAAAAAAACSgAAAPhAAAts9YWVogAAAAAAAA9tYAAQAAAADTLXBhcmEAAAAAAAQAAAACZmYAAPKnAAANWQAAE9AAAApbAAAAAAAAAABtbHVjAAAAAAAAAAEAAAAMZW5VUwAAACAAAAAcAEcAbwBvAGcAbABlACAASQBuAGMALgAgADIAMAAxADb/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAAIAAgDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAj/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFAEBAAAAAAAAAAAAAAAAAAAAAP/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/AJ/AB//Z','captured_at',clock_timestamp(),'consent_version','attendance-photo-location-v1')))
 ||case when p_kind='security_check' then jsonb_build_object('checkId',p_check) else '{}' end;
$$;
set role anon;
do $$ begin
 begin perform public.security_attendance_workspace(gen_random_uuid());raise exception 'Anonymous attendance';exception when insufficient_privilege then null;end;
end $$;
reset role;
set role service_role;
do $$ begin
 begin perform public.employee_qr_attendance_gateway('old-token','workspace');raise exception 'Bearer QR still usable';exception when insufficient_privilege then null;end;
end $$;
reset role;
set role authenticated;
select set_config('test.security.flow',public.security_attendance_workspace('f2000000-0000-4000-8000-000000000001')->>'security_flow_id',true);
do $$ begin
 assert public.security_attendance_workspace('f2000000-0000-4000-8000-000000000001')->>'security_credential_approved'='false';
 begin perform public.security_attendance_workspace('f2000000-0000-4000-8000-000000000002');raise exception 'Concurrent attendance channel';exception when sqlstate 'PT409' then assert sqlerrm='attendance_open_elsewhere';end;
 begin perform public.complete_security_identity(gen_random_uuid(),auth.uid());raise exception 'Self-verified identity';exception when insufficient_privilege then null;end;
 begin perform public.hr_security_attendance('e4000000-0000-4000-8000-000000000004',4);raise exception 'Self-approved policy';exception when sqlstate 'PT403' then null;end;
 begin perform public.security_attendance_location(current_setting('test.security.flow')::uuid,'e4000000-0000-4000-8000-000000000002','clock_in',null,'{}');raise exception 'Selected another employee';exception when sqlstate 'PT403' then null;end;
 begin perform 1 from snr_private.security_identity_challenges;raise exception 'Read private challenges';exception when insufficient_privilege then null;end;
end $$;
do $$ declare first_nonce text;second_nonce text;begin
 first_nonce:=public.security_begin_identity(current_setting('test.security.flow')::uuid,'register','workspace.snr-nest.test')->>'challenge';
 second_nonce:=public.security_begin_identity(current_setting('test.security.flow')::uuid,'register','workspace.snr-nest.test')->>'challenge';
 assert length(first_nonce)>=43;assert first_nonce<>second_nonce;
 begin perform public.security_begin_identity(current_setting('test.security.flow')::uuid,'register',repeat('a',43),'workspace.snr-nest.test',null);raise exception 'Browser chose its own assertion nonce';exception when undefined_function then null;end;
end $$;
select set_config('test.security.registration',public.security_begin_identity(current_setting('test.security.flow')::uuid,'register','workspace.snr-nest.test')->>'id',true);
reset role;
set role service_role;
select public.complete_security_identity(current_setting('test.security.registration')::uuid,'e1000000-0000-4000-8000-000000000004',
 '{"id":"c2VjdXJpdHktY3JlZGVudGlhbC1maXh0dXJl","public_key":"cHVibGljLWtleS10ZXN0LW9ubHk","counter":0,"transports":["internal"]}');
reset role;
set role authenticated;
do $$ begin
 assert public.security_attendance_workspace('f2000000-0000-4000-8000-000000000001')->>'security_credential_pending'='true';
 begin perform public.security_begin_identity(current_setting('test.security.flow')::uuid,'punch','workspace.snr-nest.test','{}');raise exception 'Unapproved passkey';exception when sqlstate 'PT403' then assert sqlerrm='attendance_passkey_required';end;
end $$;
select set_config('request.jwt.claims','{"sub":"e1000000-0000-4000-8000-000000000001"}',true);
select public.hr_security_attendance('e4000000-0000-4000-8000-000000000004',4,'c2VjdXJpdHktY3JlZGVudGlhbC1maXh0dXJl',1);
do $$ begin
 begin perform public.hr_security_attendance('e4000000-0000-4000-8000-000000000004',null,'c2VjdXJpdHktY3JlZGVudGlhbC1maXh0dXJl',1);raise exception 'Stale credential approval';exception when sqlstate 'PT409' then null;end;
end $$;
select set_config('request.jwt.claims','{"sub":"e1000000-0000-4000-8000-000000000004","session_id":"f1000000-0000-4000-8000-000000000002"}',true);
do $$ begin
 begin perform public.security_attendance_workspace('f2000000-0000-4000-8000-000000000001');raise exception 'Second login used the channel';exception when sqlstate 'PT409' then null;end;
end $$;
select set_config('request.jwt.claims','{"sub":"e1000000-0000-4000-8000-000000000004","session_id":"f1000000-0000-4000-8000-000000000001"}',true);
reset role;
select set_config('test.security.action',snr_private.test_security_action('f3000000-0000-4000-8000-000000000001','clock_out')::text,true);
set role authenticated;
do $$ begin
 begin perform public.prepare_attendance_photo(current_setting('test.security.action')::jsonb);raise exception 'Bypassed passkey/security page';exception when sqlstate 'PT403' then assert sqlerrm='security_flow_required';end;
 begin perform public.security_attendance_location(current_setting('test.security.flow')::uuid,'e4000000-0000-4000-8000-000000000004','clock_out',(current_setting('test.security.action')::jsonb->>'previousId')::uuid,
 (current_setting('test.security.action')::jsonb->'location')||'{"latitude":13}');raise exception 'Outside camera allowed';exception when sqlstate 'PT409' then assert sqlerrm='outside_store_area';end;
end $$;
reset role;

select set_config('test.security.action',snr_private.test_security_action('f3000000-0000-4000-8000-000000000001','clock_out')::text,true);
set role authenticated;
select set_config('test.security.identity',public.security_begin_identity(current_setting('test.security.flow')::uuid,'punch','workspace.snr-nest.test',current_setting('test.security.action')::jsonb)->>'id',true);
reset role;
set role service_role;
select public.complete_security_identity(current_setting('test.security.identity')::uuid,'e1000000-0000-4000-8000-000000000004',null,0);
reset role;
set role authenticated;
do $$ begin
 begin perform public.prepare_security_attendance_photo(current_setting('test.security.flow')::uuid,current_setting('test.security.identity')::uuid,
 jsonb_set(current_setting('test.security.action')::jsonb,'{location,accuracy_meters}','9'));raise exception 'Identity proof changed action';exception when sqlstate 'PT403' then null;end;
end $$;
select public.prepare_security_attendance_photo(current_setting('test.security.flow')::uuid,current_setting('test.security.identity')::uuid,current_setting('test.security.action')::jsonb);
do $$ begin
 begin perform public.record_attendance_storage('f3000000-0000-4000-8000-000000000001','e4000000-0000-4000-8000-000000000004');raise exception 'Unverified photo committed';exception when sqlstate 'PT409' then assert sqlerrm='attendance_photo_not_uploaded';end;
end $$;
reset role;
insert into storage.objects(bucket_id,name,metadata) select bucket_id,object_path,jsonb_build_object('size',byte_size,'mimetype','image/jpeg') from snr_private.attendance_photo_uploads where id='f3000000-0000-4000-8000-000000000001';
select set_config('test.security.hash',(select sha256 from snr_private.attendance_photo_uploads where id='f3000000-0000-4000-8000-000000000001'),true);
set role service_role;
select public.verify_attendance_photo_upload('f3000000-0000-4000-8000-000000000001',current_setting('test.security.hash'));
reset role;
set role authenticated;
select public.record_attendance_storage('f3000000-0000-4000-8000-000000000001','e4000000-0000-4000-8000-000000000004');
select public.record_attendance_storage('f3000000-0000-4000-8000-000000000001','e4000000-0000-4000-8000-000000000004');
do $$ begin assert public.prepare_security_attendance_photo(current_setting('test.security.flow')::uuid,current_setting('test.security.identity')::uuid,current_setting('test.security.action')::jsonb)->'receipt'->>'security_identity_verified'='true';end $$;
reset role;

select set_config('test.security.action',snr_private.test_security_action('f3000000-0000-4000-8000-000000000002','clock_in')::text,true);
set role authenticated;
select set_config('test.security.identity',public.security_begin_identity(current_setting('test.security.flow')::uuid,'punch','workspace.snr-nest.test',current_setting('test.security.action')::jsonb)->>'id',true);
reset role;
set role service_role;
select public.complete_security_identity(current_setting('test.security.identity')::uuid,'e1000000-0000-4000-8000-000000000004',null,0);
reset role;
set role authenticated;
do $$ begin
 begin perform public.prepare_security_attendance_photo(current_setting('test.security.flow')::uuid,current_setting('test.security.identity')::uuid,
 jsonb_set(current_setting('test.security.action')::jsonb,'{location,accuracy_meters}','9'));raise exception 'Identity proof changed action';exception when sqlstate 'PT403' then null;end;
end $$;
select public.prepare_security_attendance_photo(current_setting('test.security.flow')::uuid,current_setting('test.security.identity')::uuid,current_setting('test.security.action')::jsonb);
do $$ begin
 begin perform public.record_attendance_storage('f3000000-0000-4000-8000-000000000002','e4000000-0000-4000-8000-000000000004');raise exception 'Unverified photo committed';exception when sqlstate 'PT409' then assert sqlerrm='attendance_photo_not_uploaded';end;
end $$;
reset role;
insert into storage.objects(bucket_id,name,metadata) select bucket_id,object_path,jsonb_build_object('size',byte_size,'mimetype','image/jpeg') from snr_private.attendance_photo_uploads where id='f3000000-0000-4000-8000-000000000002';
select set_config('test.security.hash',(select sha256 from snr_private.attendance_photo_uploads where id='f3000000-0000-4000-8000-000000000002'),true);
set role service_role;
select public.verify_attendance_photo_upload('f3000000-0000-4000-8000-000000000002',current_setting('test.security.hash'));
reset role;
set role authenticated;
select public.record_attendance_storage('f3000000-0000-4000-8000-000000000002','e4000000-0000-4000-8000-000000000004');
select public.record_attendance_storage('f3000000-0000-4000-8000-000000000002','e4000000-0000-4000-8000-000000000004');
reset role;
set role authenticated;
do $$ declare status jsonb;begin
 status:=public.security_presence_status(current_setting('test.security.flow')::uuid);
 assert status->>'total'='4';assert status->'current'='null'::jsonb;
 assert not(status ? 'future_checks');
end $$;
reset role;
select set_config('test.security.check',(select id::text from snr_private.security_presence_challenges where slot=1 and employee_id='e4000000-0000-4000-8000-000000000004'),true);
update snr_private.security_presence_challenges set due_at=statement_timestamp()-interval '3 minutes',expires_at=statement_timestamp()-interval '1 minute' where slot=2;
update snr_private.security_presence_challenges set due_at=statement_timestamp()-interval '30 seconds',expires_at=statement_timestamp()+interval '90 seconds' where id=current_setting('test.security.check')::uuid;
set role authenticated;
do $$ declare status jsonb;begin
 status:=public.security_presence_status(current_setting('test.security.flow')::uuid);
 assert status->>'missed'='1';assert status->'current'->>'id'=current_setting('test.security.check');
end $$;
reset role;

select set_config('test.security.action',snr_private.test_security_action('f3000000-0000-4000-8000-000000000003','security_check',current_setting('test.security.check')::uuid)::text,true);
set role authenticated;
select set_config('test.security.identity',public.security_begin_identity(current_setting('test.security.flow')::uuid,'check','workspace.snr-nest.test',current_setting('test.security.action')::jsonb)->>'id',true);
reset role;
set role service_role;
select public.complete_security_identity(current_setting('test.security.identity')::uuid,'e1000000-0000-4000-8000-000000000004',null,0);
reset role;
set role authenticated;
do $$ begin
 begin perform public.prepare_security_presence_photo(current_setting('test.security.flow')::uuid,current_setting('test.security.identity')::uuid,
 jsonb_set(current_setting('test.security.action')::jsonb,'{location,accuracy_meters}','9'));raise exception 'Identity proof changed action';exception when sqlstate 'PT403' then null;end;
end $$;
select public.prepare_security_presence_photo(current_setting('test.security.flow')::uuid,current_setting('test.security.identity')::uuid,current_setting('test.security.action')::jsonb);
do $$ begin
 begin perform public.commit_security_presence(current_setting('test.security.flow')::uuid,'f3000000-0000-4000-8000-000000000003');raise exception 'Unverified photo committed';exception when sqlstate 'PT409' then assert sqlerrm='attendance_photo_not_uploaded';end;
end $$;
reset role;
insert into storage.objects(bucket_id,name,metadata) select bucket_id,object_path,jsonb_build_object('size',byte_size,'mimetype','image/jpeg') from snr_private.security_presence_uploads where id='f3000000-0000-4000-8000-000000000003';
select set_config('test.security.hash',(select sha256 from snr_private.security_presence_uploads where id='f3000000-0000-4000-8000-000000000003'),true);
set role service_role;
select public.verify_security_presence_upload('f3000000-0000-4000-8000-000000000003',current_setting('test.security.hash'));
reset role;
set role authenticated;
select public.commit_security_presence(current_setting('test.security.flow')::uuid,'f3000000-0000-4000-8000-000000000003');
select public.commit_security_presence(current_setting('test.security.flow')::uuid,'f3000000-0000-4000-8000-000000000003');
reset role;
do $$ begin
 assert (select count(*) from snr_private.security_presence_evidence where challenge_id=current_setting('test.security.check')::uuid)=1;
 assert (select count(*) from public.audit_events where action='attendance.security_check.completed' and subject_id=current_setting('test.security.check')::uuid)=1;
end $$;
set role authenticated;
do $$ begin
 assert public.security_presence_status(current_setting('test.security.flow')::uuid)->>'completed'='1';
end $$;
reset role;
-- A permissive unrelated Storage policy still cannot expose security photos.
create policy security_test_broad on storage.objects to public using(true) with check(true);
set role authenticated;
do $$ begin assert (select count(*) from storage.objects where bucket_id='attendance-security-checks')=1;end $$;
select set_config('request.jwt.claims','{"sub":"e1000000-0000-4000-8000-000000000002","session_id":"f1000000-0000-4000-8000-000000000003"}',true);
do $$ begin
 assert (select count(*) from storage.objects where bucket_id='attendance-security-checks')=0;
 begin perform public.commit_security_presence(current_setting('test.security.flow')::uuid,'f3000000-0000-4000-8000-000000000003');raise exception 'Another employee submitted check';exception when sqlstate 'PT409' then null;end;
end $$;
select set_config('request.jwt.claims','{"sub":"e1000000-0000-4000-8000-000000000003"}',true);
do $$ begin assert (select count(*) from storage.objects where bucket_id='attendance-security-checks')=0;end $$;
select set_config('request.jwt.claims','{"sub":"e1000000-0000-4000-8000-000000000001"}',true);
do $$ declare report jsonb;begin
 report:=public.hr_security_presence_report(current_date-1,current_date+1);
 assert jsonb_array_length(report->'rows')=4;
 assert (select count(*) from storage.objects where bucket_id='attendance-security-checks')=1;
end $$;
reset role;
select set_config('request.jwt.claims','{}',true);
set role anon;
do $$ begin assert (select count(*) from storage.objects where bucket_id='attendance-security-checks')=0;end $$;
reset role;
-- Even a valid verified passkey cannot extend a check deadline or alter history.
select set_config('request.jwt.claims','{"sub":"e1000000-0000-4000-8000-000000000004","session_id":"f1000000-0000-4000-8000-000000000001"}',true);
select set_config('test.security.original_action',current_setting('test.security.action'),true);
select set_config('test.security.original_identity',current_setting('test.security.identity'),true);
select set_config('test.security.late_check',(select id::text from snr_private.security_presence_challenges where slot=3 and employee_id='e4000000-0000-4000-8000-000000000004'),true);
update snr_private.security_presence_challenges set due_at=statement_timestamp()-interval '30 seconds',expires_at=statement_timestamp()+interval '90 seconds' where id=current_setting('test.security.late_check')::uuid;
select set_config('test.security.action',snr_private.test_security_action('f3000000-0000-4000-8000-000000000004','security_check',current_setting('test.security.late_check')::uuid)::text,true);
set role authenticated;
select set_config('test.security.identity',public.security_begin_identity(current_setting('test.security.flow')::uuid,'check','workspace.snr-nest.test',current_setting('test.security.action')::jsonb)->>'id',true);
reset role;
set role service_role;
select public.complete_security_identity(current_setting('test.security.identity')::uuid,'e1000000-0000-4000-8000-000000000004',null,0);
reset role;
update snr_private.security_presence_challenges set due_at=statement_timestamp()-interval '3 minutes',expires_at=statement_timestamp()-interval '1 minute' where id=current_setting('test.security.late_check')::uuid;
set role authenticated;
do $$ begin
 begin perform public.prepare_security_presence_photo(current_setting('test.security.flow')::uuid,current_setting('test.security.identity')::uuid,current_setting('test.security.action')::jsonb);raise exception 'Late photo accepted';exception when sqlstate 'PT409' then assert sqlerrm='security_check_expired';end;
end $$;
reset role;
do $$ begin
 begin update snr_private.security_presence_evidence set captured_at=clock_timestamp();raise exception using errcode='PT999',message='Changed immutable evidence';exception when raise_exception then assert sqlerrm='History is append-only; create a linked event instead';end;
 assert not has_function_privilege('authenticated','public.complete_security_identity(uuid,uuid,jsonb,bigint)','execute');
 assert not has_table_privilege('authenticated','snr_private.security_presence_challenges','select');
 assert (select count(*) from snr_private.security_presence_evidence where request_id='f3000000-0000-4000-8000-000000000004')=0;
end $$;
select set_config('test.security.action',current_setting('test.security.original_action'),true);
select set_config('test.security.identity',current_setting('test.security.original_identity'),true);

-- Completed exact retries survive expired identity/flow windows without rewriting proof.
update snr_private.security_identity_challenges set expires_at=clock_timestamp()-interval '1 second';
update snr_private.security_attendance_flows set expires_at=clock_timestamp()-interval '1 second';
select set_config('request.jwt.claims','{"sub":"e1000000-0000-4000-8000-000000000004","session_id":"f1000000-0000-4000-8000-000000000001"}',true);
set role authenticated;
do $$ declare receipt jsonb;begin
 receipt:=public.prepare_security_presence_photo(current_setting('test.security.flow')::uuid,current_setting('test.security.identity')::uuid,current_setting('test.security.action')::jsonb)->'receipt';
 assert receipt->>'replayed'='true';
 begin perform public.prepare_security_presence_photo(current_setting('test.security.flow')::uuid,current_setting('test.security.identity')::uuid,
 jsonb_set(current_setting('test.security.action')::jsonb,'{location,latitude}','13'));raise exception 'Changed committed replay';exception when sqlstate 'PT409' then null;end;
end $$;
reset role;
rollback;
\echo 'PASS: shared QR sign-in, exclusive channel, HR-approved action-bound passkeys, private random photo checks and exact retries'
