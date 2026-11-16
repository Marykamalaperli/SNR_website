-- Read-only metadata check. Run in the intended Supabase project's SQL Editor.
select
 to_regclass('snr_private.employee_attendance_cards') is not null
 and to_regprocedure('public.employee_attendance_card(uuid,text,boolean,integer)') is not null as individual_qr_ready,
 to_regprocedure('public.personal_employee_attendance_workspace(uuid,text)') is not null
 and coalesce(has_function_privilege('authenticated',to_regprocedure('public.personal_employee_attendance_workspace(uuid,text)'),'execute'),false) as employee_qr_signin_ready,
 to_regclass('snr_private.attendance_guard_photos') is not null
 and to_regprocedure('public.verify_attendance_guard_upload(uuid,text)') is not null as guard_photo_setup_ready,
 exists(select 1 from storage.buckets where id='attendance-guard-photos' and not public and file_size_limit=153600 and allowed_mime_types=array['image/jpeg']) as guard_photo_bucket_private,
 (select count(*)=2 from storage.buckets where id in('attendance-clock-in','attendance-clock-out') and not public) as employee_photo_buckets_private;
