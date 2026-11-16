-- Read-only installed-object check for the intended project's SQL Editor.
-- No employee, attendance, photo, credential, policy or audit data is changed.
-- Flags inspect representative objects, not a migration journal. A partially
-- edited schema still requires administrator review; do not rerun deployed files.
with checks(migration, ready) as (values
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
)
select migration, ready,
  case
    when ready then 'representative_objects_ready'
    when migration='0014' and (
      to_regprocedure('snr_private.security_employee()') is not null
      or to_regprocedure('snr_private.security_auth_session()') is not null
      or to_regclass('snr_private.security_attendance_flows') is not null
      or to_regclass('snr_private.security_identity_challenges') is not null
      or to_regprocedure('snr_private.prepare_photo_before_security(jsonb)') is not null
    ) then 'partial_inspect_before_applying'
    when migration='0015' and (
      to_regclass('snr_private.security_station_operators') is not null
      or to_regprocedure('snr_private.complete_identity_before_service_actor(uuid,uuid,jsonb,bigint)') is not null
    ) then 'partial_inspect_before_applying'
    else 'not_ready_verify_before_applying'
  end as installation_state
from checks
order by migration;
