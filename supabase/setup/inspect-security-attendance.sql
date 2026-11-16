-- Read-only inventory for a missing/partially installed 0014 or 0015.
-- Lists catalog names/signatures only; no employee, attendance, passkey key
-- material, location, photo or audit rows are read or changed.
select 'function' as kind, n.nspname as schema_name,
       p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as object_name
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname in ('public', 'snr_private')
  and (p.proname like 'security_%'
    or p.proname in ('complete_security_identity',
      'prepare_security_attendance_photo', 'prepare_security_presence_photo',
      'prepare_photo_before_security', 'record_storage_before_security',
      'can_read_security_photo', 'prepare_attendance_photo',
      'record_attendance_storage', 'attendance_location_details',
      'commit_security_presence', 'record_storage_personal_security',
      'commit_personal_security_presence', 'location_details_before_station',
      'complete_identity_before_service_actor', 'hr_security_presence_report',
      'hr_security_attendance', 'hr_attendance_station'))
union all
select 'table', schemaname, tablename
from pg_tables
where schemaname = 'snr_private' and tablename like 'security_%'
order by kind, schema_name, object_name;
