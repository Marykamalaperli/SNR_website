# Individual QR attendance and two-photo guard approval (0016)

> **Superseded implementation history.** Personal QR, guard photos and guard passkey
> approval are not the final SRS attendance workflow.

Migration **0016** supersedes the common QR entry introduced by 0014/0015. It
restores an individual QR **with employee sign-in**, while retaining the supervised
guard authorization from 0015. It does not restore unsigned bearer access or the
old store QR. Existing migrations must not be rewritten or rerun.

## Employee and guard screens

1. HR creates an employee with a full name, designation, company employee number,
   login email, initial password, site and department. PostgreSQL automatically
   issues one permanent **Attendance ID** such as `SNR-000000000001` and a personal
   QR token in the same transaction. Existing employee numbers stay unchanged;
   existing profiles also receive an attendance ID and QR. Existing designations
   are initially unset; HR fills them in through Edit employee.
2. **Security · QR search** in the HR/Employee sidebar opens a separate search
   screen without employee tables. Enter the attendance ID. The card shows the
   employee's **QR, name, designation, attendance ID and site**. Employees can open
   their own card under **Attendance QR**; an HR-authorized guard can find people
   at their authorized site. Supervisors retain their existing department/site
   scope. Anonymous users cannot look up or view employee cards.
3. **Download QR** saves a PNG. **Open display window** opens the private card in a
   separate window/tab. Because it has no opener and no copied login session, a
   fresh window may ask for sign-in before showing employee details.
4. Scanning opens `/login?attendance=1#employee-qr=<token>`. The employee signs in
   with their own credentials; the QR target survives sign-in. PostgreSQL checks
   that the active account belongs to that exact QR before opening capture. The
   token contains no password, access token or attendance authority.
5. On the employee's phone, an authorized guard signs in with a separate,
   memory-only session. On a shared guard phone, the guard keeps their normal
   session and the employee signs in with a separate, memory-only session. Both
   arrangements use the same site-scoped guard approval protocol. The guard must
   be a different person/account, with an HR-approved passkey and explicit
   shared-device duty authorization. Neither an HR login nor an employee selector
   grants permission to punch for somebody else.
6. The server selects **Clock in** or **Clock out** from current attendance events.
   After consent, the device verifies fresh, accurate GPS inside the assigned
   store's **50 metres before opening either camera**. Each shutter checks location
   again. Take the employee's photo, then a **separate live guard photo**. The guard
   compares the person and physical staff ID, checks the witness confirmation, and
   approves using their own passkey. Both photos, locations and the exact action
   are bound to that one server challenge. Both uploads must be verified before
   the attendance transaction commits.
7. Each turn permits one punch or one requested photo check, or expires after
   five minutes. Temporary credentials/photos clear on success, cancellation,
   navigation or timeout. A lost response keeps the exact pending request for a
   status retry; it must not create another punch. Overnight sessions and subsequent
   clock-in/out pairs use the existing server state rules.

HR can **Regenerate lost QR → Confirm regenerate QR** on the selected card.
The permanent attendance ID does not change. The token/version changes atomically,
with a version conflict check and audit entry. Previous links and unfinished
captures stop working immediately, including requests already uploaded but not
committed. Exact retries for already recorded attendance remain readable. No
attendance events, names in historical filenames, photos or audits are rewritten.

## Photos, access and limits

Employee photos retain private `attendance-clock-in` and `attendance-clock-out`
buckets, date folders and the existing server-controlled employee-name/local-date/
time/request-UUID filenames. The separate guard JPEG uses private
`attendance-guard-photos`, the same server naming function with the guard's name,
and scoped reads after successful attendance. Attendance **Photo & location**
details show both photos and the guard witness. Private links expire after 60 seconds.
Random employee photo checks retain private `attendance-security-checks`; their
separate guard photo follows the same witness protocol. HR can retain the existing
three/four-check policy; requests expire after two minutes and never create a
second clock-in.

The service role can verify uploads and open a visit only after the gateway checks
both Auth users and their caller-scoped contexts. Browsers cannot mark an upload
verified, enable themselves as guards, approve their own punch or write directly
to these buckets. Commits recheck account/site/guard/key/QR versions and leases.
A second active attendance client is blocked. Signed actions cannot be changed or
reused for another employee. Already committed evidence is immutable.

Photos are **audit evidence, not face recognition or certified liveness**. A guard
must actually compare the employee to their physical ID. A shared password/PIN,
a dishonest guard, a compromised device, or GPS spoofing cannot be eliminated by
a QR and camera alone. Use managed guard devices, private password entry, separate
guard accounts and prompt HR revocation when access is lost. The application does
not store biometric templates or infer identity from a photo.

## Manual production activation

1. Review the target Supabase project and run the read-only
   `supabase/setup/check-security-attendance.sql`. All existing 0013/0014/0015 flags
   and the workspace grant must be true. If 0014/0015 previously produced duplicate
   function errors, follow `docs/SECURITY_ATTENDANCE.md` diagnostics. Do not drop
   helper functions or rerun installed migrations to bypass those errors. Resolve
   partial installation before proceeding.
2. In **that project's Supabase Dashboard → SQL Editor → New query**, paste the
   complete contents of
   `supabase/migrations/202611170016_personal_qr_guard_photos.sql` and run it **once**.
   It runs in a transaction. It backfills identifiers and personal QR records,
   creates the private guard bucket and installs the new scoped entry points. Do
   not execute files under `supabase/tests` in production.
3. In a new query, run `supabase/setup/check-personal-qr-attendance.sql`; all flags
   should be true. If PostgREST has stale function metadata, run this **SQL in the
   same project's SQL Editor**, not in the terminal:

   ```sql
   notify pgrst, 'reload schema';
   ```

   Schema reload does not install a missing migration.
4. Manually run **GitHub Actions → Deploy application → Run workflow → branch
   `main` → target `frontend`**. This deploys the frontend **and its Pages Functions**.
   Keep the existing production Supabase public settings and private
   `SUPABASE_ADMIN_KEY` Pages binding. Backend deployment is independent; the
   optional GCP backend requires its identity settings if deployed.
5. The guard's approved passkey must be usable on the device (or through the
   browser's cross-device passkey prompt). Otherwise use the managed shared guard
   device; a password alone cannot replace guard approval. Temporary guard leases
   are released after each turn, allowing the next turn without a 90-second wait.
6. HR edits existing employees' designations, checks their attendance IDs in the
   directory/profile, approves guard passkeys in person and enables shared-device
   duty for the correct store. Verify the store's 50-metre coordinates and shift
   assignments. Share each employee's own credentials securely; QR downloads never
   contain credentials.
7. Smoke test using two distinct accounts: search the ID, inspect the name/title,
   scan and sign in, check that a wrong/replaced QR fails before the camera, record
   in and out with both photos, verify both private photos in the history, and
   regenerate a lost QR. Test an outside/inaccurate fix and guard revocation.
   Replace previously printed common QR posters with the individual-card workflow.

This task's automated checks use disposable PostgreSQL and intercepted provider
requests. Production migrations/deployments and live Supabase/camera/GPS checks
remain manual; no live employee attendance is created by the test harness.
