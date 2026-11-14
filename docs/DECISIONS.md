# Decisions and approval register

| Decision                                               | Status                                   | Rationale                                                         |
| ------------------------------------------------------ | ---------------------------------------- | ----------------------------------------------------------------- |
| React + JavaScript/JSX + Vite; Python/FastAPI          | Confirmed by brief                       | Small maintainable team stack; no TypeScript                      |
| Orange-led five-color identity                         | Confirmed by brief                       | Warm, people-focused product                                      |
| Cloudflare Pages → Cloud Run → Supabase                | Frontend reported live; API/data pending | Separate static, API and data boundaries                          |
| Server-confirmed roles and tenant scope                | Confirmed                                | Browser state cannot grant access                                 |
| Employee, Supervisor, HR interfaces                    | Initial frontend                         | Auditor and owner interfaces deferred; privileges stay distinct   |
| Supervisor recommends; HR decides                      | Confirmed                                | No supervisor final approval                                      |
| Dev-only, visibly labeled synthetic previews           | Implemented                              | Review UI without fabricating authentication                      |
| Session membership adapter fails closed                | Implemented                              | No approved database integration or credentials yet               |
| Attendance is append-only, server-timed and idempotent | Required future contract                 | Preserve original evidence                                        |
| Browser writes denied in initial RLS migration         | Draft security baseline                  | Mutations require audited transactional APIs                      |
| Per-punch device location with notice and permission   | Authorized by owner request              | Employee/HR precise access; device-reported accuracy              |
| Per-punch photo after location within 50 metres; QR disabled | Authorized by owner on 11 Nov 2026 | Fresh photo and location for each punch; employee/HR evidence access |
| Self-host fonts; no external analytics                 | Implemented                              | Avoid runtime third-party requests                                |
| No PWA, payroll or leave calculations                  | Deferred                                 | Not part of approved MVP foundation                               |
| License                                                | Pending owner approval                   | No LICENSE file created                                           |

## Decisions required before private-data integration

- Actual production domain, Supabase project, approved redirect URLs and CORS origins.
- Membership provisioning, multi-organization selection, team/site scope and revocation.
- Shift time zones, overnight shifts, grace periods, clock-in site verification,
  multiple punches, correction deadlines and self-approval/conflict rules.
- HR document categories, retention/deletion, export permissions and audit review.
- Consent and privacy policy before collecting location or evidence; storage scanning.
- Auditor and system-owner capability definitions and separate interfaces.
- Backup/restore objectives, incident owners, monitoring and rate-limit infrastructure.

SQL files are reviewable migrations; no live changes run automatically. The owner
applies reviewed migrations in the selected Supabase project.

## Deployment selections supplied by the owner

- Public frontend URL: `https://snr-nest.pages.dev` (reported live by the owner;
  this environment's network policy prevents independent verification).
- Google Cloud Project ID: `snr-nest`.
- Proposed backend region: `asia-south1` (Mumbai), matching the documented default.
- Billing status and Google project/IAM access are not verified. The Cloud Shell
  setup script checks billing before any provisioning. Backend deployment and
  Supabase integration remain pending.

## Supabase authentication while Google Cloud is paused

The owner explicitly paused Google Cloud setup and requested Supabase connection
and authentication. Selected project: `https://emvppphhkmbpgqduikup.supabase.co`.
Only the public publishable key was supplied; no service-role or database password
is needed. The public values are stored in ignored local configuration and must
also be configured as GitHub Actions frontend variables for deployment.

The default authentication path now uses Supabase Auth identity verification and
the read-only `current_workspace()` database RPC under RLS. Supabase's servers enforce
the assignment; no role is taken from user metadata or browser state. This removes
the Cloud Run hosting dependency for authentication while preserving FastAPI for
business APIs and optional `api` session verification with the same RPC.

Confirmed accounts need an explicit project-owner assignment. Public sign-ups should
be disabled; no first-user promotion exists. Multiple active organizations are denied
until a deliberate selection model is implemented. Session storage is tab-scoped;
restore and refresh recheck membership, and logout clears local tokens. Live project
activation/verification still needs migrations, an assigned account and a frontend
release. Attendance/corrections/documents remain outside this authentication change.

## Workforce setup while Google Cloud remains paused

The owner confirmed working sign-in and requested the next design/development
slice. Organization setup and employee profiles use narrow Supabase PostgreSQL
functions, keeping the release independent of Cloud Run and elevated browser keys.
Production now includes an HR dashboard/directory/setup page, own employee profile
and assigned supervisor roster. Preview components remain separate.

Fixed-search-path definer functions authorize a single active membership on every
call. HR can configure sites/departments/shift templates and explicitly onboard
confirmed Auth accounts as Employee or Supervisor. Their one department/site scope
is part of that saved assignment. HR/auditor/owner provisioning, protected accounts,
multi-organization accounts and existing multi-assignment supervisor edits remain
outside these forms. No Auth administrative key or Edge Function is required for
this slice: account creation/passwords stay in the Supabase dashboard.

All saves append audit events atomically. Record and membership versions prevent
stale overwrites, including external access changes. Inactive profile access is
explicitly disabled in membership; data requests recheck it. Staff projections
enforce self/team/HR scope and expose account email only to HR. Direct table writes
remain denied. Attendance, corrections and private files need separate designs.

## Dashboard-only day-to-day administration

The owner explicitly requested that person/data creation and edits happen in the
admin dashboard, removing the prerequisite to create each Auth user in Supabase.
A small JavaScript Pages Functions hosting adapter now invokes GoTrue Admin APIs
for scoped staff creation/linking and credentials. This is a narrow exception for
the existing hosting runtime; Python/FastAPI remains the business API stack. No
new hosting provider or Google billing is needed. It uses a runtime-only encrypted
binding, not an elevated browser key. A one-time migration/binding/deployment is
required; routine staff operations stay in the app.

The account/profile boundary uses private intents, server-only Auth operation
markers, keyed fingerprints, held snapshots/relationships and dashboard recovery.
Credentials are never persisted in the application ledger, rolled back blindly,
or replayed after completed request IDs. Protected roles and tenant boundaries
remain enforced. Existing-account onboarding includes confirmation in the server
flow; workspace/own settings are implemented rather than redirecting to a provider
console. Own email changes retain the Auth provider's verification policy.

## Cloudflare fetch compatibility for account operations

An immediate account-creation failure was reproduced in the actual Workers runtime:
Workers rejects `redirect: 'error'` before sending a request. Node-only mocked fetch
tests and unauthenticated runtime probes had not exercised that path. The gateway
now uses `redirect: 'manual'` and rejects every 3xx response before parsing it.
Caller tokens, passwords and the administrative key therefore stay at the configured
Supabase origin. No automatic retry is added to Auth writes.

A pinned Wrangler/Miniflare runtime check now executes authenticated creation and
redirect refusal before deployment as well as in CI. Synthetic outbound handlers
replace all external services; the actual Worker `fetch` constructs every request.
Both the legacy Pages compatibility date and the current date are covered without
requiring a hosting-setting change or an application dependency upgrade.

## Assigned shifts and normal attendance while Google Cloud is paused

After confirming Employee and Supervisor access, the owner continued to the next
milestone. Migration 0005 uses the established caller-JWT SQL boundary for shift
assignments and attendance; the existing Pages administrative key is not involved.
HR manages dated assignments in the directory. Dates cannot overlap, and used
assignment dates/template hours cannot be rewritten. Unused current/future plans
may be cancelled with their record/audit retained.

The MVP permits multiple paired sessions on an assigned work date, one open
session at a time. It captures server receipt timestamps and immutable shift,
site/department/date/time-zone context. Overnight work follows its start date;
UTC elapsed time handles DST. No lateness/absence/overtime/payroll or clock-in
window policy is inferred. Only Employees punch; Supervisor and HR permissions
remain scoped reads. Original punch edits and correction approvals are deferred.

Request UUIDs bind the action and prior event snapshot. Database serialization
matches HR profile mutation order before membership locks, so revocation and
reassignment do not deadlock with a normal punch. Completed IDs return receipts
without another event/audit. Direct browser table writes stay denied. Activation
requires only the reviewed new migration and a frontend release, followed by
owner verification in the existing project; daily data stays in the dashboard.

## Per-punch device location

The owner confirmed working attendance and explicitly requested saving the device
location at both clock-in and clock-out. This authorizes per-event location for
attendance verification. Notice `attendance-location-v1` requires staff
acknowledgement and browser permission before a fresh high-accuracy fix. Device
accuracy is retained; physical presence is not certified. The later store-area
decision below adds a server-enforced radius check against this reported position.
Location is collected only for the chosen punch, with no background movement.
The later QR/photo decision below separately authorizes per-event camera capture.
Records are retained with attendance; no automatic purge is added.

Migration 0006 stores coordinates, reported accuracy, device capture time, server
receipt time and notice version in a private RLS table without browser grants.
Employee/HR view a selected session through an audited, scoped RPC; supervisors
receive no precise location. Normal lists contain only availability flags for
authorized viewers. OpenStreetMap links share a point only when explicitly opened.

The existing punch transaction is moved to a private non-executable helper. The
exposed writer requires both a location and expected employee snapshot; the old
location-free API rejects writes. Event, audit and GPS persist atomically. Exact
replay binds the original fix and can recover after it ages. Leaving the screen
discards an outstanding fix; changed credentials/identity cannot transfer the
intent to another employee. Existing history is preserved without backfilled GPS.

## Store attendance areas

The owner requested that both clock-in and clock-out require proximity to the
store. Migration 0007 makes an HR-configured centre/radius mandatory. The default
is 100 metres, editable per store from 10 to 1,000 metres. No production coordinates
are invented. Missing configuration blocks both punches; there is no bypass switch.

The private location insert trigger derives the store from the normal event, uses
great-circle distance, and requires distance plus reported accuracy to fit within
the radius. Accuracy never expands the boundary. An outside/uncertain fix rejects
the entire event/audit/location transaction. Clock-out uses its open session’s
store and the currently configured area, including for an expired shift/inactive
site. Accepted GPS retains an immutable centre/radius/version/distance snapshot.
Exact committed retries return their original receipt without reapplying a changed
policy. Older location rows remain explicitly unchecked, without history rewrites.

Location capture remains explicit per punch after acknowledgement and native
permission. No background capture or automatic consent is added. Store setup can
use an explicitly requested device fix or manually entered coordinates, reviewed
before save. All routine configuration remains in the HR dashboard. Browser GPS
can be spoofed; this policy compares the reported device position, not independent
proof of physical presence. See `STORE_ATTENDANCE_AREAS.md` for activation/tests.

## Store QR and per-punch photo (10 November 2026)

The owner explicitly requested a store QR scan followed by photo and location for
both clock-in and clock-out, with store coordinates entered during site creation.
This supersedes the earlier location-only/no-selfie decision. Consent notice
attendance-photo-location-v1 covers each event. No facial recognition is added.

Migration 0008 keeps the caller-JWT PostgreSQL boundary, wraps the existing normal
punch/GPS transaction, rejects location-only clients, and appends bounded camera
JPEGs in a private evidence table. For this MVP, storing at most 150 KiB per punch
avoids new public objects or hosting secrets; database growth is a known tradeoff.
A future private-object-storage migration must preserve the same scopes/history.
Static store QR codes are HR-only to display/rotate and rechecked at commit. They
are not a liveness or physical-presence attestation. Existing employee/HR GPS-detail
access also returns the photo, audits reads and denies supervisors. Original
history remains unchanged. See ATTENDANCE_PHOTO_QR.md for activation and limits.

## Private buckets and location-first cameras (11 November 2026)

The owner requested pasted store map links and separate clock-in/clock-out photo
buckets with Auth user ID/date/time filenames. They also required location to be
available and match the store before opening a camera and at photo capture.
Migration 0009 implements that change without editing migrations 0001–0008 or old
history. Map links fill explicit coordinates; unresolved links require review/manual
coordinates. The camera is gated on fresh server-checked fixes, including the shutter.

New images use private attendance-clock-in/attendance-clock-out buckets and
server-reserved UTC filenames. The existing private Pages binding uploads verified
bytes while SQL keeps caller-scoped authority over attendance. No new public
privileges or elevated browser key is introduced. Storage/DB operations are staged,
not falsely described as one transaction; unattached uploads remain private and
are not blindly removed on an uncertain response. Staff use scoped, audited evidence
reads and sixty-second signed URLs. Old database photos remain readable. See
ATTENDANCE_STORAGE_LOCATION.md for concrete contracts and owner activation steps.

## Disable store QR and require 50 metres (11 November 2026)

The owner replaced QR scanning with location-first selfie capture for both normal
punches. Migration 0010 fixes every configured store area at 50 metres, increments
changed area versions, and enforces that radius on all area saves. Native precise
location and caller-JWT preflight precede the front camera; the shutter obtains
another checked fix. Uncertain, denied, unavailable or outside positions stop it.

New upload intents and attendance commits require photo/GPS without QR. The existing
private action buckets, server-derived filenames, verified upload, atomic event/GPS/
reference/audit transaction and replay semantics remain. Legacy QR input is accepted
only as inert bounded payload metadata so exact older retries keep their fingerprint;
new storage proof has null QR version and never claims QR verification. Old evidence
is retained with its original metadata. HR QR actions and QR provisioning are disabled.
The browser requires the new server policy flag before enabling normal punches.
See ATTENDANCE_PHOTO_ONLY.md for activation and validation boundaries.

## Date folders and saved employee names (11 November 2026)

The owner requested employee names during creation and date-first bucket folders
with name/date/time photo identifiers. The existing Full name field is required
and appears first in account creation; HR's saved profile is the naming authority.
Migration 0011 derives a safe name and the reservation's local calendar date/time
from the caller's profile and assigned/open-session attendance time zone. A unique
request suffix prevents overwrites. The private intent snapshots the full name and
zone and freezes the path for retries; existing files/references are retained.

The Pages handler accepts both trusted naming formats and retains caller/request/
bucket/digest validation. Storage authorization follows committed scoped evidence,
not folder structure. The 50-metre, photo-only and HTTP 204 confirmation rules
continue to apply. See ATTENDANCE_PHOTO_NAMES.md for rollout and safe-name limits.

## Personal employee QR attendance (11 November 2026)

The owner requested individual employee QR issuance/download and immediate old-code
invalidation on regeneration. Migration 0012 adds an HR-scoped private token table,
transactional issuance during account completion, authenticated employee-only QR
workspace/preflight RPCs, and prepare/commit revalidation. The existing signed-in
own-attendance flow stays available; the code is a shortcut, never sign-in authority.
Store QR remains disabled. Tokens use URL fragments to avoid page-request/referrer
exposure and never choose the caller's identity. Rotation shares attendance's
organization serialization lock; committed exact retries remain recoverable.
Location-first 50-metre selfie checks, overnight/pair semantics, private buckets,
server filename rules and historical evidence are preserved. See
[personal employee QR activation](EMPLOYEE_ATTENDANCE_QR.md) for manual rollout.

## Attendance-only QR access without sign-in (11 November 2026)

The owner explicitly replaced the sign-in requirement for personal employee QR.
The QR now acts as an attendance-only bearer credential for its assigned employee;
it grants no workspace session, directory, account changes, history or photo reads.
Migration 0013 adds a service-role-only, allowlisted attendance dispatcher behind
narrow Pages endpoints. It derives subject/scope from the current QR, verifies
active Employee/Auth state, confines/restores transaction-local claims, and reuses
the existing normal attendance/GPS/photo transactions. Browser requests contain
no Auth token or cookies. New QR URLs use `/attendance`; older printed fragment
links redirect there without login. QR regeneration, 50-metre GPS accuracy checks,
location-before-camera/shutter, private Storage and filenames remain enforced.
Anyone with a copied QR can attempt that employee's attendance; photo/GPS are
required evidence, not biometric identity verification. This explicitly supersedes
the earlier decision to require the matching account's sign-in for personal QR.

## Shared attendance QR, sign-in and security checks (13 November 2026)

The owner replaced personal bearer QR with a common QR and credential sign-in,
a separate attendance security page, unique employee-bound punches, and three/four
random photo/location checks with a two-minute response window. The implementation
uses an HR-approved employee passkey with required device user verification;
password-only enrollment cannot authorize attendance. It binds each proof to the
exact action and confines one active Auth session/client attendance channel.
No biometric matching is added; native device verification does not send biometric
templates to the app and does not justify a claim of perfect physical identity.

Security staff retain the Employee role. HR selects 0/3/4 checks per employee,
applying only to future clock-ins. Defaults stay Off to avoid silently imposing
additional checks on unrelated staff. Server-scheduled requests persist through
refresh/offline periods; overdue checks are missed evidence for manual HR review,
not absence/payroll decisions. The page must stay open; no background camera/GPS
or guaranteed locked-phone notifications are introduced. Migration 0014 disables
the former unsigned gateway and preserves all historical records. Manual rollout
and operational acceptance are in SECURITY_ATTENDANCE.md.
