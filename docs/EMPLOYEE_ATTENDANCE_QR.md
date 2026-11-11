# Personal employee attendance QR

Personal QR access requires migrations 0012 and 0013. Store QR stays disabled.
Scanning now opens the assigned employee's attendance **without sign-in**. The
QR is a secret, attendance-only credential: anyone holding a copy can attempt
that employee's attendance, subject to location and photo checks. It does not
prove who is holding the device; no facial recognition is performed. Share it
only with that employee and regenerate a lost or shared code.

## Issue and replace

Only the existing HR dashboard role can issue, view or regenerate a code for an
active Employee in its organization. “Admin” here means that HR permission;
system-owner, auditor and supervisor roles do not inherit it.

Creating/linking an active Employee issues a QR in the account completion database
transaction. Recovery does not rotate it. The download dialog opens after creation.
For existing Employees use **Employees → Attendance QR → Download QR**. Inactive
employees can receive a code after HR activates their Employee membership.

For a lost code use **Regenerate QR → Confirm regenerate QR**, then download the
replacement PNG. Regeneration immediately invalidates previous links, cameras and
unfinished uploads once committed. Reopen the dialog after an uncertain response
rather than repeating a blind rotation. Recorded attendance and old photos remain.

New codes encode `/attendance#employee-qr=<random-token>` on the current hostname.
Download them from the production hostname, not a development/preview host. Codes
issued earlier with `/me/attendance#employee-qr=...` automatically redirect to the
new attendance-only page without login; no reprinting is necessary for this route
change. Tokens stay in the fragment, never page-request paths or query strings.
The page/API use no-store responses, noindex and no-referrer policy on the QR page.

## Attendance-only access

The page displays the server-confirmed employee name and the currently available
Clock in/Clock out action. It does not show a directory, employee account, attendance
history, private photos or HR controls. Normal workspace access still requires
sign-in and the existing role permissions.

The browser sends the QR in a bounded POST body to `/api/attendance/qr/workspace`,
`/location` or `/photos`, without an Auth token or cookies. The Pages gateway uses
its existing private Supabase binding to invoke one service-role-only SQL function,
`employee_qr_attendance_gateway`. Anonymous and authenticated browser roles cannot
call that dispatcher directly. It has an explicit attendance-operation allowlist;
there is no general RPC dispatch or Auth token/session issuance.

The dispatcher derives the employee solely from the current private token. It
rejects an inactive profile/membership, non-Employee role, unconfirmed/deleted/banned
Auth account, invalid token, mismatched employee ID or multiple active workspaces.
Inside that single operation it binds a transaction-local employee identity to the
existing attendance transactions and restores prior claims on success and error.
Only a small whitelisted workspace projection leaves SQL. The context operation's
user identifier is consumed server-side during photo upload and is not an Auth
credential. A private per-employee minute counter limits successful gateway work;
existing photo reservation limits also apply. Invalid UUID guessing is denied
without disclosing employee records.

Consent and fresh GPS are required before the selfie camera opens. PostgreSQL
requires distance plus reported accuracy to fit inside the assigned store's fixed
50-metre area. The camera monitors location and rechecks both QR and location at
the shutter. Photo preparation and final commit revalidate the current QR, employee,
expected attendance state, store policy and accepted evidence. Camera/location
permissions alone never record attendance; confirmation is still required.

Server state selects Clock out for an open session, retaining its original site,
work date and time zone overnight. Closing a session permits subsequent pairs.
Request UUIDs and immutable payload fingerprints retain retry protection. A lost
response can be checked with the same current QR without a duplicate event/audit.
A replaced QR cannot read even a prior receipt through this public gateway; the
normal authenticated exact-replay behavior remains available and historical data
is not changed.

The private `attendance-clock-in` and `attendance-clock-out` buckets are unchanged.
Migration 0011 still controls date folders and employee-name/local-date/time/request
filenames. Personal QR version proof is inserted separately from historical store
QR metadata. The QR gateway grants no private photo reads or Storage signed URLs;
those remain employee-self/HR authenticated operations. Abandoned private uploads
are not deleted after an uncertain response.

## Manual production activation

1. Confirm migrations 0001–0012 have already succeeded in the intended Supabase
   project. If 0012 is missing, apply its checked-in file once first. Never rewrite
   or rerun previously deployed migrations.
2. In Supabase **SQL Editor**, run the complete file
   `supabase/migrations/202611110013_employee_qr_attendance_access.sql` once. It creates
   the private rate counter and narrow service-role-only attendance dispatcher.
3. In the same SQL Editor run `notify pgrst, 'reload schema';`.
4. Keep both attendance buckets private. Retain the existing encrypted Cloudflare
   Pages `SUPABASE_ADMIN_KEY` binding and public Supabase URL/publishable-key build
   configuration. No secret belongs in a `VITE_*` variable. No new bucket, Auth
   account, Google service or hosting secret is needed.
5. In GitHub **Actions → Deploy application → Run workflow**, select branch `main`
   and target `frontend`. This deploys the new public page and Pages gateway.
   A push runs checks but does not deploy. Do not choose backend/both for this change.
6. In a private browser window with no signed-in account, scan an existing or new
   employee QR. Confirm it opens that employee's attendance without a login page,
   shows the correct name/action, and exposes no directory/history/profile controls.
7. Confirm denied/outside/inaccurate GPS blocks the camera. Check valid in-store
   location opens it, moving outside blocks the shutter, and confirmation saves
   the proper private photo. Verify Clock in → Clock out → another Clock in, and
   an overnight checkout retains its start context.
8. Regenerate the code while an old camera/upload is open. Confirm old links and
   unfinished commits fail, the new code works, account deactivation denies QR
   access, and altered employee IDs cannot select another employee. Verify an
   uncertain successful request is retried without adding events. Confirm historical
   photos and HR employee-name editing still work and store QR stays disabled.

Keep production migrations and deployment manual. Retain 0012/0013 tables/evidence
if rolling back the frontend; never rewrite historical evidence. Rolling back to
the earlier frontend restores its sign-in behavior for printed QR links.

## Local validation

Run `bash scripts/check.sh` and `bash scripts/test-supabase.sh`. From `frontend` run
`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium CI=1 npm run test:browser`.
The pinned Wrangler check in `scripts/test-worker-runtime.mjs` covers unsigned QR
photo upload in the real Worker runtime as well as authenticated account flows.
Database tests use real disposable PostgreSQL grants/RLS/transactions and synthetic
Auth/Storage records. Browser services are intercepted; no live Supabase migration
or production deployment is performed by these checks.
