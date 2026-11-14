# Common QR and security attendance

Migration **0014** replaces personal QR credentials with one common attendance QR.
The QR contains only the production `/login?attendance=1` URL, which asks for credentials even if that browser tab already has a session. Successful employee sign-in opens `/attendance`. Scanning requires a verified
Employee sign-in and opens a separate security attendance screen. Each employee
uses their own phone, account and HR-approved passkey. Neither a QR nor a selected
employee ID grants attendance authority. Old personal links redirect to the same
sign-in flow; their unsigned gateway is revoked in PostgreSQL and disabled in Pages.
Store QR remains disabled. Existing attendance, audits and historical photos remain.

## What prevents account substitution

Supabase verifies sign-in, current active Employee membership, profile and account
state. The database derives employee/organization/site from that verified subject.
A shared link cannot select another employee, and HR/Supervisor/owner/auditor roles
cannot punch as staff. One active attendance channel per employee is bound to the
Auth `session_id` and a random tab client ID, renewed every 25 seconds with a
90-second lease. A second login/client is denied while it is active. Refresh keeps
the same tab client ID. Sign-out releases the lease; lost connections expire it.

Before recording, a fresh WebAuthn assertion must use the employee's approved key,
matching the website/RP, unpredictable challenge, user and active attendance flow.
The challenge expires in two minutes and binds the exact action, request UUID,
prior event snapshot, GPS and photo bytes. User verification is required; a device
uses a fingerprint, Face ID or PIN. A proof cannot be transferred to a different
employee or a changed action. Nonzero authenticator counters must advance.

New passkeys are pending until HR verifies the employee in person and approves
the enrollment. A password-only impostor cannot approve a key. Each employee has
one approved credential; HR reset immediately revokes it and closes the active
channel. Enrollment, approval/reset, policy edits, successful punches and photo
check completion/read operations are audited. Private key material and biometric
templates never enter this application.

These measures reduce password sharing and proxy attendance; they do not establish
perfect physical identity. A passkey may sync through its provider, device PINs can
be shared, an unlocked device can be handed over, GPS can be spoofed, and an
untrusted client can fabricate camera input. The application performs no biometric
face matching or liveness certification. Do not call photos, GPS, a client ID or a
passkey an absolute fraud-prevention guarantee. HR must verify initial enrollment,
keep reset/approval access controlled and review questionable/missed evidence.

## Clock-in/out and evidence

All new punches require the security flow and a verified action-bound proof in the
database. Calling the old writer directly cannot bypass this requirement. Expected
previous-event IDs, serialization, immutable events and idempotent UUID receipts
retain one open session per employee and prevent double submission. Clock-out
uses the opening session's site/date/time zone, including overnight work. Subsequent
pairs remain allowed after checkout. Existing committed exact receipts remain
recoverable after flow/proof expiry without appending another event or audit.

Staff explicitly agree to each photo/location capture. Fresh precise GPS must pass
server distance **plus accuracy ≤ 50 metres** at the assigned/open-session store
before the front camera opens and at its shutter. The server checks accepted
location/photo evidence again before committing. Clock-in/out keep the existing
private `attendance-clock-in` and `attendance-clock-out` buckets and the date-folder,
HR-saved employee-name/date/time/request-UUID naming rules. Names and timestamps
are not chosen by the browser. History is never overwritten.

## Three or four random security photo checks

HR selects **Off**, **3 checks** or **4 checks** per employee under **Employees →
Attendance security**. This supports security guards without inventing a new role
or applying extra checks to every employee. The default is Off; choose the required
staff explicitly during rollout. Changes apply to future clock-ins. Each opening
attendance session snapshots its own randomly scheduled requests.

The server divides the remaining planned shift into separate windows and chooses
unpublished random request times. If clock-in is very late, windows have a minimum
three-minute spacing while the session stays open. A checkout before a future
request cancels that request. A request already due and unanswered is marked missed
for review when its two minutes end or the employee clocks out. It does not mark
absence, change attendance times, alter payroll or infer misconduct automatically.

Employees must keep the security attendance page open and their device connected.
It polls every 15 seconds without collecting GPS in the background. The server
schedule/deadline persists across refresh, hiding the page, sign-out and reconnect;
reopening the page never starts a fresh two minutes. Future request times are not
returned to employees. The on-screen notice shows the remaining time using a
server-time offset. After the deadline, the camera closes and the server rejects
new preparation/commit even if the client changes its clock. An exact already
committed receipt can still be recovered. No push notification, locked-phone alarm,
background camera, offline bypass or extension of the deadline is claimed.

For a requested check, the employee agrees to a fresh photo/GPS capture, verifies
location within 50 metres, takes a new front-camera selfie and confirms with their
approved passkey. The location is checked at camera opening, shutter and final
commit. Capture and accepted upload must finish before the request's fixed deadline;
slow uploads or denied permissions may produce a missed check for HR review.
Only the requested capture location is stored, together with server time and an
immutable store-area version/centre/radius/distance snapshot. No normal punch is
created by a random check.

Random evidence uses a new private `attendance-security-checks` bucket with the same
bounded JPEG/server naming rules. There are no browser writes or public photo URLs.
Only employee-self and same-organization HR can read committed evidence; Supervisor,
other employee/tenant, auditor, owner and anonymous access are denied. HR's **Security
checks** page shows completed/missed/cancelled/pending results with bounded date
filters and private, audited photo detail reads using 60-second signed URLs. The
filter dates/times are explicitly UTC. Results are capped at 500 over up to 31 days;
use narrower ranges if needed.

## Manual activation

1. Confirm migrations **0001–0013** have already succeeded in the intended Supabase
   project. Back up production and review the new migration; do not rerun or edit
   deployed migrations.
2. In that project's **SQL Editor**, run the complete file
   `supabase/migrations/202611130014_security_attendance.sql` once. It revokes the
   unsigned QR dispatcher, adds private flow/passkey/challenge/evidence tables and
   creates `attendance-security-checks` as private JPEG storage. It stops if that
   bucket already exists with incompatible privacy/size settings.
3. Run `notify pgrst, 'reload schema';` in the same SQL Editor.
4. Keep the existing private Pages `SUPABASE_ADMIN_KEY` binding and public Supabase
   URL/publishable-key configuration. No new secret or biometric service is needed.
   Never put an elevated key in a `VITE_*` value.
5. Run GitHub **Actions → Deploy application → Run workflow → branch `main` → target
   `frontend`**. This ships the security screen and the Worker WebAuthn verifier.
   No backend/Google deployment is needed. A push runs CI only. Do not deploy an
   older frontend after applying 0014: new punch writers intentionally reject it.
6. Open production **Employees → Open attendance QR**. Display the new common QR
   in its separate window or download/print it. It is the same for all employees
   and contains no credentials or personal token. Use the production HTTPS hostname;
   passkeys are scoped to that hostname. Hostname changes require enrollment/reset
   and HR approval again. Local WebAuthn tests use `localhost`, not an IP address.
7. Have each Employee scan, sign in and select **Enroll attendance passkey** on their
   own supported device. HR then checks their identity in person and uses **Employees
   → Attendance security → Approve after identity check → Confirm identity
   verification**. There is no password-only fallback for an unapproved/lost key.
8. Select **3 checks** or **4 checks** for each security guard/other intended staff
   account. Leave unrelated staff Off. This starts with the next clock-in; existing
   open sessions are not retroactively populated with requests.
9. Verify valid in-store clock-in/out, outside/inaccurate GPS denial, camera denial,
   passkey cancellation, double-click/retry recovery, overnight checkout and another
   pair. Confirm a different employee/second login cannot use an active flow or
   another person's proof. Test HR reset invalidates an in-progress action.
10. Keep a security page open through a scheduled request. Confirm a fresh accepted
    check stays separate from punches, an expired/offline check is flagged for HR,
    private evidence is scoped correctly, and employee-name editing/historical
    photos remain intact. Production application and migration are manual.

Rollback must preserve all history and private evidence. Keep the new database
controls; repair/redeploy a compatible frontend. Do not restore the unsigned QR
RPC or bypass passkey checks to make an old client work. Test/staging enrollment,
manual in-person approval and an operator acceptance run are required before
calling the production anti-proxy workflow verified.

## Verification

`bash scripts/check.sh` covers formatting, lint, frontend/server/backend tests and
the production build. `bash scripts/test-supabase.sh` uses disposable PostgreSQL to
exercise actual roles/RLS, one active flow, pending/approved keys, one-use proof
binding, counters, location/photo prerequisites, deadlines, immutable evidence,
private Storage boundaries and exact replay. Real WebAuthn signatures, wrong-origin/
nonce/key/UV refusal are covered by Node tests and the Worker runtime check on both
compatibility dates. Browser tests use Chromium's virtual authenticator and verify
actual WebAuthn ceremonies; only the transport/database and camera hardware are
synthetic. These checks do not apply production migrations or prove live Supabase,
passkey-provider availability, physical identity or production deployment readiness.
