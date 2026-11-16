-- Read-only check. Run in the intended project's Supabase SQL Editor.
-- No attendance, employee, credential, photo, policy or audit data is changed.
-- These flags inspect installed objects/grants; they do not test a staff login.
select
  to_regprocedure('public.employee_qr_attendance_gateway(text,text,jsonb)') is not null
    as migration_0013_prerequisite_ready,
  to_regprocedure('public.security_attendance_workspace(uuid)') is not null
    and to_regclass('snr_private.security_attendance_flows') is not null
    and to_regclass('snr_private.security_attendance_credentials') is not null
    as migration_0014_ready,
  to_regprocedure('public.hr_attendance_station(uuid,boolean,integer)') is not null
    and to_regprocedure('public.open_security_station_visit(uuid,uuid,uuid,uuid)') is not null
    and to_regclass('snr_private.security_station_visits') is not null
    as migration_0015_ready,
  coalesce(has_function_privilege('authenticated',
    to_regprocedure('public.security_attendance_workspace(uuid)'), 'execute'), false)
    as employee_workspace_rpc_granted;
