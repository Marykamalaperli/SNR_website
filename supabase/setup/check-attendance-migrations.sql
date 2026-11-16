-- Read-only installed-object check for the intended project's SQL Editor.
-- No employee, attendance, photo, credential, policy or audit data is changed.
-- Flags inspect representative objects, not a migration journal. A partially
-- edited schema still requires administrator review; do not rerun deployed files.
select * from (values
 ('0001', to_regclass('public.organizations') is not null),
 ('0002', to_regprocedure('public.current_workspace()') is not null),
 ('0003', to_regprocedure('public.hr_organization_setup()') is not null),
 ('0004', to_regprocedure('public.hr_workspace_settings()') is not null),
 ('0005', to_regclass('public.attendance_events') is not null),
 ('0006', to_regclass('snr_private.attendance_locations') is not null),
 ('0007', to_regclass('snr_private.site_attendance_areas') is not null),
 ('0008', to_regclass('snr_private.attendance_evidence') is not null),
 ('0009', to_regclass('snr_private.attendance_photo_uploads') is not null),
 ('0010', coalesce(pg_get_functiondef(to_regprocedure('public.attendance_workspace()')) like '%store-50m-photo-v1%', false)),
 ('0011', to_regprocedure('snr_private.attendance_photo_object_path(text,timestamptz,text,uuid)') is not null),
 ('0012', to_regclass('snr_private.employee_attendance_qr') is not null),
 ('0013', to_regprocedure('public.employee_qr_attendance_gateway(text,text,jsonb)') is not null),
 ('0014', to_regprocedure('public.security_attendance_workspace(uuid)') is not null),
 ('0015', to_regprocedure('public.hr_attendance_station(uuid,boolean,integer)') is not null)
) as checks(migration, ready)
order by migration;
