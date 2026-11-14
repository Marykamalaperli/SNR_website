-- Disposable database only: two verified people, one supervised punch.
begin;
select set_config('test.station.jpeg','/9j/4AAQSkZJRgABAQAAAQABAAD/4gHYSUNDX1BST0ZJTEUAAQEAAAHIAAAAAAQwAABtbnRyUkdCIFhZWiAH4AABAAEAAAAAAABhY3NwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAA9tYAAQAAAADTLQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAlkZXNjAAAA8AAAACRyWFlaAAABFAAAABRnWFlaAAABKAAAABRiWFlaAAABPAAAABR3dHB0AAABUAAAABRyVFJDAAABZAAAAChnVFJDAAABZAAAAChiVFJDAAABZAAAAChjcHJ0AAABjAAAADxtbHVjAAAAAAAAAAEAAAAMZW5VUwAAAAgAAAAcAHMAUgBHAEJYWVogAAAAAAAAb6IAADj1AAADkFhZWiAAAAAAAABimQAAt4UAABjaWFlaIAAAAAAAACSgAAAPhAAAts9YWVogAAAAAAAA9tYAAQAAAADTLXBhcmEAAAAAAAQAAAACZmYAAPKnAAANWQAAE9AAAApbAAAAAAAAAABtbHVjAAAAAAAAAAEAAAAMZW5VUwAAACAAAAAcAEcAbwBvAGcAbABlACAASQBuAGMALgAgADIAMAAxADb/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAAIAAgDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAj/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFAEBAAAAAAAAAAAAAAAAAAAAAP/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/AJ/AB//Z',true);
create function snr_private.test_station_action(p_kind text,p_check uuid default null) returns jsonb language sql set search_path='' as $$
 select jsonb_build_object('id',gen_random_uuid(),'type',p_kind,'employeeId','e4000000-0000-4000-8000-000000000004',
 'previousId',(select id from public.attendance_events where employee_id='e4000000-0000-4000-8000-000000000004' order by sequence_no desc limit 1),
 'location',jsonb_build_object('latitude',12.971599,'longitude',77.594566,'accuracy_meters',8,'captured_at',clock_timestamp(),'consent_version','attendance-location-v1'),
 'evidence',jsonb_build_object('photo',jsonb_build_object('jpeg_base64',current_setting('test.station.jpeg'),'captured_at',clock_timestamp(),'consent_version','attendance-photo-location-v1')))
 ||case when p_kind='security_check' then jsonb_build_object('checkId',p_check) else '{}' end;
$$;
insert into snr_private.security_attendance_credentials(id,organization_id,employee_id,user_id,public_key,counter,rp_id,approved_at)
values('c3RhdGlvbi1ndWFyZC1jcmVkZW50aWFs','e2000000-0000-4000-8000-000000000001','e4000000-0000-4000-8000-000000000002','e1000000-0000-4000-8000-000000000002','cHVibGljLWtleS10ZXN0LW9ubHk',0,'workspace.snr-nest.test',clock_timestamp());
select set_config('request.jwt.claims','{"sub":"e1000000-0000-4000-8000-000000000002","session_id":"fa000000-0000-4000-8000-000000000001"}',true);
set role authenticated;
select set_config('test.station.guard',public.security_attendance_workspace('fa000000-0000-4000-8000-000000000002')->>'security_flow_id',true);
do $$ begin
 begin perform public.hr_attendance_station('e4000000-0000-4000-8000-000000000002',true,0);raise exception 'Guard self-authorized';exception when sqlstate 'PT403' then null;end;
 begin perform public.security_station_context(current_setting('test.station.guard')::uuid);raise exception 'No guard grant';exception when sqlstate 'PT403' then null;end;
 begin perform public.open_security_station_visit(null,null,null,null);raise exception 'Browser opened visit';exception when insufficient_privilege then null;end;
 begin perform public.complete_security_station_identity(gen_random_uuid(),auth.uid(),1);raise exception 'Browser verified passkey';exception when insufficient_privilege then null;end;
end $$;
select set_config('request.jwt.claims','{"sub":"e1000000-0000-4000-8000-000000000005"}',true);
do $$ begin
 begin perform public.hr_attendance_station('e4000000-0000-4000-8000-000000000002',true,0);raise exception 'Foreign HR granted guard';exception when sqlstate 'PT404' then null;end;
end $$;
select set_config('request.jwt.claims','{"sub":"e1000000-0000-4000-8000-000000000001"}',true);
select public.hr_attendance_station('e4000000-0000-4000-8000-000000000002',true,0);
select public.hr_security_attendance('e4000000-0000-4000-8000-000000000004',3);
do $$ begin
 begin perform public.hr_attendance_station('e4000000-0000-4000-8000-000000000002',false,0);raise exception 'Stale guard grant';exception when sqlstate 'PT409' then null;end;
end $$;
select set_config('request.jwt.claims','{"sub":"e1000000-0000-4000-8000-000000000004","session_id":"fa000000-0000-4000-8000-000000000003"}',true);
select set_config('test.station.employee',public.security_attendance_workspace('fa000000-0000-4000-8000-000000000004')->>'security_flow_id',true);
select set_config('test.station.registration',public.security_begin_identity(current_setting('test.station.employee')::uuid,'register','workspace.snr-nest.test')->>'id',true);
do $$ begin
 assert public.security_attendance_workspace('fa000000-0000-4000-8000-000000000004')->>'security_credential_approved'='false';
 begin perform public.security_station_context(current_setting('test.station.employee')::uuid);raise exception 'Employee is guard';exception when sqlstate 'PT403' then null;end;
end $$;
reset role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
set role service_role;
select public.complete_security_identity(current_setting('test.station.registration')::uuid,'e1000000-0000-4000-8000-000000000004',
 '{"id":"c3RhdGlvbi1lbXBsb3llZS1wZW5kaW5n","public_key":"cHVibGljLWtleS10ZXN0LW9ubHk","counter":0,"transports":["internal"]}');
do $$ begin assert current_setting('request.jwt.claims')='{"role":"service_role"}';end $$;
do $$ begin
 begin perform public.open_security_station_visit(current_setting('test.station.guard')::uuid,'e1000000-0000-4000-8000-000000000002',current_setting('test.station.guard')::uuid,'e1000000-0000-4000-8000-000000000002');raise exception 'Self-witnessed punch';exception when sqlstate 'PT403' then null;end;
end $$;
select set_config('test.station.visit',public.open_security_station_visit(current_setting('test.station.guard')::uuid,'e1000000-0000-4000-8000-000000000002',current_setting('test.station.employee')::uuid,'e1000000-0000-4000-8000-000000000004')->>'visit_id',true);
do $$ begin
 assert public.open_security_station_visit(current_setting('test.station.guard')::uuid,'e1000000-0000-4000-8000-000000000002',current_setting('test.station.employee')::uuid,'e1000000-0000-4000-8000-000000000004')->>'visit_id'=current_setting('test.station.visit');
end $$;
reset role;
do $$ begin
 assert (select actor_user_id from public.audit_events where action='attendance.passkey.enrolled' and subject_id='e4000000-0000-4000-8000-000000000004' order by created_at desc limit 1)='e1000000-0000-4000-8000-000000000004';
 assert (select actor_user_id from public.audit_events where action='attendance.station_visit.opened' order by created_at desc limit 1)='e1000000-0000-4000-8000-000000000002';
end $$;
select set_config('test.station.action',snr_private.test_station_action('clock_out')::text,true);
set role authenticated;
select set_config('request.jwt.claims','{"sub":"e1000000-0000-4000-8000-000000000002","session_id":"fa000000-0000-4000-8000-000000000001"}',true);
do $$ begin
 assert public.security_station_due(current_setting('test.station.guard')::uuid)->'requests'='[]'::jsonb;
 begin perform public.security_begin_station_identity(current_setting('test.station.guard')::uuid,current_setting('test.station.visit')::uuid,'workspace.snr-nest.test',jsonb_set(current_setting('test.station.action')::jsonb,'{employeeId}','"e4000000-0000-4000-8000-000000000002"'));raise exception 'Guard chose another identity';exception when sqlstate 'PT403' then null;end;
end $$;
select set_config('test.station.proof',public.security_begin_station_identity(current_setting('test.station.guard')::uuid,current_setting('test.station.visit')::uuid,'workspace.snr-nest.test',current_setting('test.station.action')::jsonb)->>'id',true);
select set_config('request.jwt.claims','{"sub":"e1000000-0000-4000-8000-000000000004","session_id":"fa000000-0000-4000-8000-000000000003"}',true);
do $$ begin
 begin perform public.prepare_security_attendance_photo(current_setting('test.station.employee')::uuid,current_setting('test.station.proof')::uuid,current_setting('test.station.action')::jsonb);raise exception 'Unverified guard proof';exception when sqlstate 'PT403' then null;end;
end $$;
reset role;
set role service_role;
select public.complete_security_station_identity(current_setting('test.station.proof')::uuid,'e1000000-0000-4000-8000-000000000002',1);
do $$ begin
 begin perform public.complete_security_station_identity(current_setting('test.station.proof')::uuid,'e1000000-0000-4000-8000-000000000002',2);raise exception 'Guard assertion replayed';exception when sqlstate 'PT403' then null;end;
end $$;
reset role;
set role authenticated;
do $$ begin
 begin perform public.prepare_security_attendance_photo(current_setting('test.station.employee')::uuid,current_setting('test.station.proof')::uuid,jsonb_set(current_setting('test.station.action')::jsonb,'{location,latitude}','13'));raise exception 'Substituted guard-approved evidence';exception when sqlstate 'PT403' then null;end;
end $$;
select public.prepare_security_attendance_photo(current_setting('test.station.employee')::uuid,current_setting('test.station.proof')::uuid,current_setting('test.station.action')::jsonb);
do $$ begin
 begin perform public.record_attendance_storage((current_setting('test.station.action')::jsonb->>'id')::uuid,'e4000000-0000-4000-8000-000000000004');raise exception 'Unverified storage';exception when sqlstate 'PT409' then assert sqlerrm='attendance_photo_not_uploaded';end;
end $$;
reset role;
insert into storage.objects(bucket_id,name,metadata) select bucket_id,object_path,jsonb_build_object('size',byte_size,'mimetype','image/jpeg') from snr_private.attendance_photo_uploads where id=(current_setting('test.station.action')::jsonb->>'id')::uuid;
select set_config('test.station.hash',(select sha256 from snr_private.attendance_photo_uploads where id=(current_setting('test.station.action')::jsonb->>'id')::uuid),true);
set role service_role;
select public.verify_attendance_photo_upload((current_setting('test.station.action')::jsonb->>'id')::uuid,current_setting('test.station.hash'));
reset role;
savepoint revoke_guard;
select set_config('request.jwt.claims','{"sub":"e1000000-0000-4000-8000-000000000001"}',true);
set role authenticated;
select public.hr_attendance_station('e4000000-0000-4000-8000-000000000002',false,1);
select set_config('request.jwt.claims','{"sub":"e1000000-0000-4000-8000-000000000004","session_id":"fa000000-0000-4000-8000-000000000003"}',true);
do $$ begin
 begin perform public.record_attendance_storage((current_setting('test.station.action')::jsonb->>'id')::uuid,'e4000000-0000-4000-8000-000000000004');raise exception 'Revoked guard still recorded';exception when sqlstate 'PT403' then null;end;
end $$;
rollback to revoke_guard;
set role authenticated;
select public.record_attendance_storage((current_setting('test.station.action')::jsonb->>'id')::uuid,'e4000000-0000-4000-8000-000000000004');
select public.record_attendance_storage((current_setting('test.station.action')::jsonb->>'id')::uuid,'e4000000-0000-4000-8000-000000000004');
do $$ begin
 assert public.prepare_security_attendance_photo(current_setting('test.station.employee')::uuid,current_setting('test.station.proof')::uuid,current_setting('test.station.action')::jsonb)->'receipt'->>'security_identity_verified'='true';
 assert public.attendance_location_details((current_setting('test.station.action')::jsonb->>'previousId')::uuid)#>>'{clock_out,supervised_by,operator_name}'='Location person 2';
end $$;
reset role;
do $$ begin
 assert (select count(*) from snr_private.security_station_evidence)=1;
 assert (select count(*) from public.audit_events where action='attendance.station.recorded')=1;
 assert (select finished_at is not null from snr_private.security_station_visits where id=current_setting('test.station.visit')::uuid);
 begin update snr_private.security_station_evidence set operator_name='forged';raise exception using errcode='PT999',message='Changed witness history';exception when raise_exception then assert sqlerrm='History is append-only; create a linked event instead';end;
 assert not has_table_privilege('authenticated','snr_private.security_station_evidence','select');
 assert not has_function_privilege('authenticated','public.open_security_station_visit(uuid,uuid,uuid,uuid)','execute');
 assert not has_function_privilege('authenticated','public.complete_security_identity(uuid,uuid,jsonb,bigint)','execute');
end $$;
-- Exercise repeated pairs and random checks through the real Storage protocol.
create function snr_private.test_station_record(p_kind text,p_check uuid,p_counter bigint,p_expire boolean default false) returns jsonb
language plpgsql set search_path='' as $$
declare a jsonb;v jsonb;ch jsonb;intent jsonb;receipt jsonb;
begin
 v:=public.open_security_station_visit(current_setting('test.station.guard')::uuid,'e1000000-0000-4000-8000-000000000002',current_setting('test.station.employee')::uuid,'e1000000-0000-4000-8000-000000000004');
 a:=snr_private.test_station_action(p_kind,p_check);
 perform set_config('request.jwt.claims','{"sub":"e1000000-0000-4000-8000-000000000002","session_id":"fa000000-0000-4000-8000-000000000001"}',true);
 ch:=public.security_begin_station_identity(current_setting('test.station.guard')::uuid,(v->>'visit_id')::uuid,'workspace.snr-nest.test',a);
 perform public.complete_security_station_identity((ch->>'id')::uuid,'e1000000-0000-4000-8000-000000000002',p_counter);
 perform set_config('request.jwt.claims','{"sub":"e1000000-0000-4000-8000-000000000004","session_id":"fa000000-0000-4000-8000-000000000003"}',true);
 if p_kind='security_check' then
 intent:=public.prepare_security_presence_photo(current_setting('test.station.employee')::uuid,(ch->>'id')::uuid,a);
 else intent:=public.prepare_security_attendance_photo(current_setting('test.station.employee')::uuid,(ch->>'id')::uuid,a);end if;
 insert into storage.objects(bucket_id,name,metadata) values(intent->>'bucket_id',intent->>'object_path',jsonb_build_object('size',octet_length(decode(current_setting('test.station.jpeg'),'base64')),'mimetype','image/jpeg'));
 if p_kind='security_check' then
 perform public.verify_security_presence_upload((a->>'id')::uuid,intent->>'sha256');
 if p_expire then
 update snr_private.security_presence_challenges set due_at=statement_timestamp()-interval '121 seconds',expires_at=statement_timestamp()-interval '1 second' where id=p_check;
 begin perform public.commit_security_presence(current_setting('test.station.employee')::uuid,(a->>'id')::uuid);raise exception 'Accepted a late guard photo check';exception when sqlstate 'PT409' then assert sqlerrm='security_check_expired';end;
 return null;end if;
 receipt:=public.commit_security_presence(current_setting('test.station.employee')::uuid,(a->>'id')::uuid);
 assert public.prepare_security_presence_photo(current_setting('test.station.employee')::uuid,(ch->>'id')::uuid,a)->'receipt'->>'replayed'='true';
 else
 perform public.verify_attendance_photo_upload((a->>'id')::uuid,intent->>'sha256');
 receipt:=public.record_attendance_storage((a->>'id')::uuid,'e4000000-0000-4000-8000-000000000004');
 end if;
 return receipt;
end $$;
revoke all on function snr_private.test_station_record(text,uuid,bigint,boolean) from public;
select set_config('test.station.before_events',(select count(*)::text from public.attendance_events where employee_id='e4000000-0000-4000-8000-000000000004'),true);
select snr_private.test_station_record('clock_in',null,2);
do $$ begin
 assert (select count(*) from snr_private.security_presence_challenges where employee_id='e4000000-0000-4000-8000-000000000004')=3;
end $$;
update snr_private.security_presence_challenges set due_at=statement_timestamp()-interval '10 seconds',expires_at=statement_timestamp()+interval '110 seconds' where slot=1;
select set_config('request.jwt.claims','{"sub":"e1000000-0000-4000-8000-000000000002","session_id":"fa000000-0000-4000-8000-000000000001"}',true);
set role authenticated;
do $$ declare due jsonb;begin
 due:=public.security_station_due(current_setting('test.station.guard')::uuid);
 assert jsonb_array_length(due->'requests')=1;
 assert not (due->'requests'->0 ?| array['employee_id','photo','due_at','user_id']);
end $$;
reset role;
select snr_private.test_station_record('security_check',(select id from snr_private.security_presence_challenges where slot=1),3);
update snr_private.security_presence_challenges set due_at=statement_timestamp()-interval '10 seconds',expires_at=statement_timestamp()+interval '110 seconds' where slot=2;
select snr_private.test_station_record('security_check',(select id from snr_private.security_presence_challenges where slot=2),4,true);
do $$ begin
 assert (select count(*) from public.attendance_events where employee_id='e4000000-0000-4000-8000-000000000004')=current_setting('test.station.before_events')::integer+1;
 assert (select count(*) from snr_private.security_station_evidence)=3;
 assert (select count(*) from snr_private.security_presence_evidence)=1;
 assert (select count(*) from snr_private.security_presence_evidence where bucket_id='attendance-security-checks')=1;
end $$;

-- Completed retry remains safe after both device leases and proof expire.
update snr_private.security_attendance_flows set expires_at=clock_timestamp()-interval '1 second';
update snr_private.security_identity_challenges set expires_at=clock_timestamp()-interval '1 second';
set role authenticated;
do $$ begin
 assert public.prepare_security_attendance_photo(current_setting('test.station.employee')::uuid,current_setting('test.station.proof')::uuid,current_setting('test.station.action')::jsonb)->'receipt'->>'replayed'='true';
 begin perform public.prepare_security_attendance_photo(current_setting('test.station.employee')::uuid,current_setting('test.station.proof')::uuid,jsonb_set(current_setting('test.station.action')::jsonb,'{location,latitude}','13'));raise exception 'Changed completed retry';exception when sqlstate 'PT409' then null;end;
end $$;
reset role;
rollback;
\echo 'PASS: HR site-scoped guards, two sessions, no self approval, action-bound guard proof, immediate revocation, witness audit and exact retries'
