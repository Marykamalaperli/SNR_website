-- Synthetic committed GPS history before 0007; it must never be rewritten.
begin;
set role authenticated;
select set_config('request.jwt.claims','{"sub":"e1000000-0000-4000-8000-000000000004"}',true);
do $$ declare fix jsonb;receipt jsonb;begin
 fix:=jsonb_build_object('latitude',12.971599,'longitude',77.594566,'accuracy_meters',8,
   'captured_at',clock_timestamp(),'consent_version','attendance-location-v1');
 receipt:=public.record_attendance('clock_in','e8000000-0000-4000-8000-000000000001',null,fix,'e4000000-0000-4000-8000-000000000004');
 perform public.record_attendance('clock_out','e8000000-0000-4000-8000-000000000002',(receipt->>'id')::uuid,fix,'e4000000-0000-4000-8000-000000000004');
end $$;
commit;
