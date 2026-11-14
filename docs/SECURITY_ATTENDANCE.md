# Common QR and security attendance

Migration **0014** replaces personal QR credentials with one common attendance QR.
The QR contains only the production `/login?attendance=1` URL, which asks for
credentials even if that browser tab already has a session. Successful employee
sign-in opens `/attendance`. Scanning requires a verified Employee sign-in and
opens a separate security attendance screen. Personal-device attendance uses
the employee's own account and HR-approved passkey. Migration **0015** also provides
an explicitly supervised shared-device option for employees without phones. Neither
a QR nor a selected
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

## Dashboard QR and the supervised shared device (0015)

Employee, Supervisor and HR home dashboards have a prominent **Open attendance QR**
button. It opens `/attendance/qr` in a separate window/tab without an opener. The
display includes download and sign-in actions and a **No phone? Ask the guard**
explanation. The common QR stays a public sign-in link, with no employee credentials.

For an employee without a phone, an authorized guard opens **Help an employee
without a phone** (`/attendance/station`) on the guard's device. HR first verifies
the guard's passkey enrollment in person, assigns an active site and explicitly
enables **Employees → Attendance security → Shared-device guard → Enable
shared-device duty → Confirm identity verification**. This is a narrow site-scoped
capability for an active Employee account, not an HR role. It is Off by default.
Grant edits use version checks, are audited, and immediately invalidate open turns.
Moving the guard to another site requires HR to authorize that new site again.

The screen uses three steps:

1. The employee privately enters their own email/password. Supabase verifies a
   separate active Employee session. The guard cannot select an employee from a
   directory or type an employee ID to grant access. A fresh sign-in is required
   for every turn; a guard cannot approve their own attendance here.
2. The server supplies that employee's name, staff ID and current attendance action.
   The employee agrees to photo/location capture. The shared device must pass the
   same accurate 50-metre GPS check before opening the camera and at the shutter.
3. The guard compares the person and live photo with the physical staff ID,
   explicitly confirms this check and uses their own HR-approved passkey. The
   server verifies the native signature, required user verification, website,
   server nonce and exact employee/photo/location/action payload before recording.

The employee's password is cleared from the form as submission starts. Their Auth
client has memory-only storage, a separate storage key and no session persistence
or automatic token refresh. It never replaces the guard's account. A successful
punch or requested photo check clears the photo and employee turn and signs out
that temporary employee session. Cancel, navigation and the five-minute turn timer
also clear it. The form stays unavailable during cleanup. Reload retains only the
guard's normal session; **Clear an interrupted employee turn** ends an abandoned
turn on the server. Use a managed guard device with password saving disabled;
browser/password-manager behavior is outside the page's `autocomplete="off"` hint.
The shared browser holds the employee's Auth token temporarily during their turn.
It must be a trusted, managed device: the page cannot protect entered credentials
or tokens from a compromised device or malicious browser extensions.

Only the gateway can open a visit, after independently verifying both JWTs with
Supabase Auth and obtaining each user's own flow through scoped RPCs. PostgreSQL
binds the visit to both users, both Auth sessions, both current attendance flows,
the guard grant/version and one site. A visit has at most one successful action.
Approval expires after at most two minutes (earlier for a due photo check). Both
preparation and commit recheck current guard permission, active accounts, site,
flow/session leases, key version, one-use proof and immutable action hash. A
disabled/reassigned guard or reset passkey cannot finish an in-flight punch.
The employee does not need to enroll a passkey on the shared guard phone.
Migration 0015 also fixes passkey enrollment audit attribution for service-role
callbacks, which have no employee JWT subject. Only the gateway's Auth-verified
subject is used for that audit; original service claims are restored on both
success and error, and browser roles still cannot complete identity verification.

Existing employee idempotency and append-only event rules still apply. A lost
response can check the same request; it does not create a second punch. The normal
employee/HR **Photo & location** detail shows the guard who witnessed that punch.
Private append-only witness evidence retains both identities and the proof/visit;
ordinary guards gain no access to colleagues' saved photos or attendance history.

When HR enables three or four random checks for an employee, the guard screen lists
only **Photo checks due now** at its authorized site. The guard asks the named
employee to sign in again and complete the same location/photo/ID/passkey steps.
The shared device must stay open and connected. Server deadlines never restart
at sign-in, and the upload and commit must finish inside the original two minutes.
Future requests and private photos are not returned in that guard queue. A random
check records separate evidence, with no additional clock-in/out.

These measures reduce password sharing and proxy attendance; they do not establish
perfect physical identity. A passkey may sync through its provider, device PINs can
be shared, an unlocked device can be handed over, GPS can be spoofed, and an
untrusted client can fabricate camera input. The application performs no biometric
face matching or liveness certification. Do not call photos, GPS, a client ID or a
passkey an absolute fraud-prevention guarantee. HR must verify initial enrollment,
keep reset/approval access controlled and review questionable/missed evidence.
In supervised mode the human ID check is essential. A colluding guard, borrowed
credentials, shared device PIN or fabricated ID can still defeat that check. There
is no automatic face recognition or certified liveness test. Never describe this
implementation as leaving no vulnerabilities or proving physical identity.

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
3. In the same project's **SQL Editor**, run the complete new file
   `supabase/migrations/202611140015_supervised_attendance.sql` once, after 0014.
   If 0014 is already applied, start with 0015; never rerun deployed migrations.
   Then run `notify pgrst, 'reload schema';` in that SQL Editor. The statement runs
   in Supabase PostgreSQL, not a terminal or the browser console.
4. Keep the existing private Pages `SUPABASE_ADMIN_KEY` binding and public Supabase
   URL/publishable-key configuration. No new secret or biometric service is needed.
   Never put an elevated key in a `VITE_*` value.
5. Run GitHub **Actions → Deploy application → Run workflow → branch `main` → target
   `frontend`**. This ships the security screen and the Worker WebAuthn verifier.
   No backend/Google deployment is needed. A push runs CI only. Do not deploy an
   older frontend after applying 0014: new punch writers intentionally reject it.
6. Open production **Dashboard → Open attendance QR** (also available in Employees).
   Display the new common QR
   in its separate window or download/print it. It is the same for all employees
   and contains no credentials or personal token. Use the production HTTPS hostname;
   passkeys are scoped to that hostname. Hostname changes require enrollment/reset
   and HR approval again. Local WebAuthn tests use `localhost`, not an IP address.
7. For personal-device attendance, have each Employee scan, sign in and select
   **Enroll attendance passkey** on their
   own supported device. HR then checks their identity in person and uses **Employees
   → Attendance security → Approve after identity check → Confirm identity
   verification**. For employees without phones, enroll/approve the guard's key
   on the guard's device, then enable shared-device duty as described above. Each
   employee still needs their own login and physical staff ID. Do not enroll staff
   passkeys under a common guard device PIN as a substitute for individual identity.
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
    photos remain intact. On a shared device verify wrong credentials, another
    site, self-approval, guard revocation during capture, employee cleanup and
    consecutive employee turns. Production application and migration are manual.

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
