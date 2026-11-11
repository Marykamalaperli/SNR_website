# Personal employee attendance QR

Migration 0012 adds individual QR links. It does not reactivate store QR codes.
Only the existing server-confirmed HR role can issue, view or regenerate a code
for an active Employee in its organization. “Admin” means that HR dashboard
permission; system-owner, auditor and supervisor roles do not inherit it.

Creating or linking an active Employee account issues its QR in the same database
transaction as completing the account profile. Recovery does not rotate the code.
After creation the dashboard opens the download dialog. For existing employees,
open **Employees → Attendance QR → Download QR**. Inactive employees and supervisors
do not receive attendance QR controls. A missing QR is generated on first HR use.
New accounts created inactive can receive their QR after HR activates them.

For a lost code choose **Regenerate QR → Confirm regenerate QR**, then download the
new PNG. The previous token stops resolving as soon as regeneration commits.
Version checks prevent a stale HR tab rotating a newer code. Reopen the dialog if
a regeneration response is uncertain; do not repeat a blind rotation.

The QR encodes the current site's origin plus
`/me/attendance#employee-qr=<random-token>`. Generate/download codes on the intended
production hostname, not a development or preview host. The fragment is not sent
in page HTTP requests or referrer headers. Do not log or share personal QR links
outside their intended recipients. The private QR table has RLS and no browser
read/write grants; HR RPC reads/issuance and regeneration are audited. QR tokens
are random UUIDs and are not passwords or attendance authorization.

Scanning opens attendance and retains the link through sign-in. The caller must
be that employee with an active profile and membership in the same organization.
Wrong-account and replaced links fail closed before capture. The normal signed-in
own-attendance route also remains available; QR is a personal shortcut, not an
additional identity factor or a requirement to clock without the link.

The server's latest event selects Clock in versus Clock out. The existing expected
previous-event contract still rejects stale state. Open sessions retain their
original date/site/time zone overnight; finishing one allows subsequent pairs.
The app never auto-punches on scan. Consent, fresh GPS and server validation of
distance plus accuracy within 50 metres precede the selfie camera. Location and QR
are rechecked while the camera is open and at the shutter. Photo reservation and
commit validate the current personal QR again. Rotation and punches use the same
organization lock: a commit ordered before rotation is recorded; a commit ordered
after it rejects the old QR, including an already uploaded, unfinished request.

A personal QR version is stamped on new private Storage evidence at insertion.
The old store `qr_version` remains null for new evidence. Historical store QR
proof, photos, employee-name editing and append-only attendance/audit rules are
unchanged. Exact committed retries remain readable after regeneration; changed
retry payloads are rejected. Rejected or abandoned uploads remain private under
the existing retention rules and are not deleted during uncertain responses.

Private buckets remain `attendance-clock-in` and `attendance-clock-out`. Migration
0011 still controls date folders and sanitized employee-name/local-date/time/
request-ID filenames. Client input cannot choose the filename or attendance time.
Employee-self/HR scoped photo reads and short-lived signed URLs remain unchanged.
No facial recognition or background tracking is added.

## Manual production activation

1. Confirm backups and that migrations 0001–0011 are already applied in the intended
   Supabase project. Do not rerun or edit those deployed migrations.
2. In that project's SQL Editor, paste and run the complete checked-in file
   `supabase/migrations/202611110012_employee_attendance_qr.sql` once. Its transaction
   creates the private QR table, new RPCs and evidence column and wraps the current
   account/photo transactions. No existing employee QR is bulk-issued. If the
   transaction fails, diagnose it before retrying; do not partially apply it.
3. In the same SQL Editor run `notify pgrst, 'reload schema';` to refresh PostgREST.
4. Keep both attendance buckets private and retain the existing Cloudflare Pages
   `SUPABASE_ADMIN_KEY` binding and public Supabase URL/publishable-key configuration.
   No new secret, bucket, policy, Cloud Run service or live data migration is needed.
5. In GitHub **Actions → Deploy application → Run workflow**, choose branch `main`
   and target `frontend`. Review the deployment job and its recorded production
   URL. Do not run the backend/both target for this feature. This step is manual;
   a Git push does not invoke this repository's deployment workflow.
6. On the production hostname, HR should create a test Employee and download its
   QR; also generate a QR for an existing assigned Employee. Scan as that Employee,
   sign in, and confirm Clock in → location → selfie → confirmation. Confirm the
   open session offers Clock out, including across midnight, and another pair is
   possible after checkout. Check private photo details and date/name paths.
7. Regenerate a QR while its old link/camera is open. Confirm old link, shutter and
   unfinished upload commit fail; the replacement works. Verify another employee,
   supervisor, unauthenticated caller and HR from another organization cannot use
   it to punch. Verify exact successful retries do not add attendance/audit rows.
8. Confirm HR name editing and historical evidence still work and store QR remains
   disabled. Keep production migrations and deployment manual.

If rolling back the frontend, keep 0012 in place to preserve evidence and rotation
history. Do not drop the table/column or rewrite attendance history. The normal
own-attendance route remains compatible with the previous photo-only frontend.

## Local validation

Run `bash scripts/check.sh`, `bash scripts/test-supabase.sh`, then from `frontend`
run `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium CI=1 npm run test:browser`.
The database script uses a disposable network-isolated PostgreSQL container and
synthetic auth/Storage metadata, including real grants/RLS/transactions. Browser
checks use the real SDK, generated QR PNG, camera canvas and intercepted services.
They do not establish live Supabase or Cloudflare production readiness.
