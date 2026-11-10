# Employee names and date folders for attendance photos

Migration 0011 extends 0010. Both private buckets use date folders at the root:

```text
attendance-clock-in/
  2026-11-11/
    Mary_Kamal_2026-11-11_09-30-00.123456_<request-uuid>.jpg
attendance-clock-out/
  2026-11-11/
    Mary_Kamal_2026-11-11_18-00-00.654321_<request-uuid>.jpg
```

## Account name

Add employee and Edit employee both show Full name first, before login details.
A nonblank name is required. The field has explicit editable state and keeps a
replacement name through parent rerenders and a failed save. Each selected
employee opens a fresh form, so edits cannot carry over to another person.
HR saves the name through the existing versioned profile update. Attendance
takes the name from this saved employee profile, never from a name submitted
with a punch.

To rename an existing employee, open Employees → Edit employee, replace the
first Full name field and select Save changes. The refreshed directory and
reopened profile show the saved name. New photo reservations use it; previously
reserved files keep their original names. Account email stays read-only here
and is changed separately through Manage account.

The edit-form update requires a frontend deployment; it adds no SQL migration.
Follow-up verification: 153 unit tests and 14 employee/account/production browser
checks passed, including desktop/mobile name replacement, save, reload, reopening
the profile and selecting a different employee. Formatting, lint and build passed.

## Folder, time and safe filename

The date/time is the server's upload-reservation instant converted to the assigned
shift's attendance time zone. Clock-out uses the opening event's frozen time zone.
For an Asia/Kolkata store, UTC 20:00 on 11 November is 01:30 on 12 November and
belongs under 2026-11-12. Overnight checkout photos use the checkout calendar date,
independent of the shift's attendance work date. Browser time zones are not used.

The profile name becomes a portable Storage filename: ASCII letters/digits keep
their case, spaces and other characters become underscores, leading/trailing
underscores are removed and the token is limited to 80 characters. If no ASCII
letters or digits remain, use Employee. Supabase Storage's object-key validator
accepts ASCII safe characters; full Unicode names remain supported in the profile.
The original name and chosen time zone are snapshotted privately with the upload
reservation. The request UUID prevents collisions between people with matching
names and makes exact retries use the same path.

All identity, organization, bucket, filename and time decisions remain server-side.
The Pages gateway permits the new date/name path and the previous UUID path for
older reservations; both still require the verified caller, request ID, action
bucket and byte digest to match. Private Storage RLS uses committed evidence and
organization/person scope, not a folder prefix. Same-date folders do not grant
cross-employee or cross-organization reads. The 50-metre policy and QR-disabled
flow continue to apply.

## Existing files and recovery

Existing photos are not renamed or moved. Old references and pending requests
retain their original paths, including after a profile rename or midnight.
New reservations use the current saved name. Both old and new committed photos
remain available through the scoped detail reader and short-lived signed URLs.
The empty HTTP 204 verification-response fix remains part of the Pages handler.

## Activate

1. Ensure migrations 0001–0010 are installed.
2. Deploy the latest frontend/Pages Functions from main using GitHub Actions →
   Deploy application → Run workflow, target frontend. This gateway supports both
   path formats, so it can be deployed before the naming migration.
3. Apply supabase/migrations/202611110011_attendance_photo_names.sql once in
   Supabase SQL Editor. New reservations now use date/name paths. Keep the existing
   SUPABASE_ADMIN_KEY Production secret and the two private action buckets.
4. Create/link an employee with a full name, then test both punches. Check the
   date folders in Storage and verify employee-self/HR access, exact retries and
   a renamed profile. No historical photos need migrating.

Local tests cover name-required creation/linking, both path formats, unsafe paths,
filename collisions, local midnight, profile changes during upload, old 0010
reservation recovery and Storage authorization. SQL checks use disposable
PostgreSQL/Storage metadata; Workers use synthetic upstream HTTP. No live database
migration or bucket write is performed by local verification.

Read-only installation check in Supabase SQL Editor:

```sql
select to_regprocedure('snr_private.attendance_photo_object_path(text,timestamptz,text,uuid)')
  is not null as migration_0011_present;
```

## Local validation · 11 November 2026

| Command or check | Result |
| --- | --- |
| npm run format:check; npm run lint | Passed |
| npm run test -- --maxWorkers=3 | 152 tests passed |
| npm run test:server | 27 tests passed |
| npm run build | Passed |
| npm run test:browser (system Chromium) | 40 tests passed |
| bash scripts/test-supabase.sh | Migrations 0001–0011, legacy recovery, naming, permissions and concurrency checks passed |
| scripts/test-worker-runtime.mjs with Wrangler 4.158.0 | Private named-photo upload/HTTP 204/account checks passed at both tested compatibility dates |
