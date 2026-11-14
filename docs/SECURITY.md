# Security and permission boundaries

The browser is untrusted. Backend authorization must check verified identity,
active organization membership, exact role, employee ownership and team/site scope
on **every** data request. Route guards improve UX; they do not secure data.

| Capability                | Employee                | Supervisor                            | HR                                    | Security Auditor                 | System Owner                       |
| ------------------------- | ----------------------- | ------------------------------------- | ------------------------------------- | -------------------------------- | ---------------------------------- |
| Own attendance/profile    | Own                     | Assigned team projection              | Assigned organization                 | No                               | No                                 |
| Team roster/exceptions    | No                      | Assigned department + site            | Assigned organization                 | No                               | No                                 |
| Submit correction         | Own                     | Separate employee permission required | Separate employee permission required | No                               | No                                 |
| Recommend/flag correction | No                      | Assigned team                         | No automatic supervisor inheritance   | No                               | No                                 |
| Finally approve/reject    | No                      | No                                    | Assigned organization, policy checks  | No                               | No                                 |
| Employee directory        | Own minimal record      | Assigned team                         | Assigned organization                 | No                               | No                                 |
| HR documents/reports      | Own authorized category | Explicit approved workflow only       | Approved scope/category               | No                               | No                                 |
| Audit review              | No                      | No                                    | No automatic inheritance              | Assigned organization, future UI | No                                 |
| System configuration      | No                      | No                                    | Approved HR settings only             | No                               | Future explicit owner capabilities |

Multiple role capabilities, self-approval conflicts, delegated approvers and narrow
HR site scope require a reviewed model before implementation. No role can self-assign.
Auditor/owner login has safe unsupported-workspace handling; neither maps to HR.

## Implemented controls

- Production setup/directory/profile screens use server-authorized Supabase records.
  Normal attendance and shift assignments use audited SQL transactions. Corrections/documents remain unconnected. Demo imports/routes exist
  only in development; production tests assert fixtures/preview paths are absent.
- Browser/FastAPI settings use a public publishable/anon key and reject service-role
  keys. The narrow Pages account gateway has a separate encrypted runtime binding,
  never a Vite value or build artifact. Auth `getUser` verifies identity;
  the database RPC confirms roles under RLS. Session restoration rechecks assignment.
- Session credentials persist only in tab-scoped sessionStorage, with memory fallback
  when storage is unavailable. No localStorage persistence. Logout clears local
  credentials even on network failure; normal token expiry/revocation remains a
  Supabase concern. Stale restore/refresh responses cannot resurrect signed-out state.
- JWT verification requires asymmetric signature (RS256/ES256), issuer, audience,
  subject, issued-at and expiry. JWKS is operator-configured HTTPS, never token `jku`.
  The optional FastAPI adapter forwards the verified user JWT plus publishable key
  to the same RPC. Unconfigured membership resolution deliberately denies access.
- API has validated CORS/hosts, bounded JWKS timeout, sanitized correlation IDs,
  no-store/noindex/security headers and generic validation/internal errors. JSON logs
  use route templates rather than raw paths or submitted personal data.
- Draft RLS isolates tenants. Initial browser writes and document reads are denied.
  Definer helpers have a fixed empty search path and scoped results. History tables
  reject update/delete. No public Storage policies or buckets.
- Frontend avoids raw HTML injection, self-hosts fonts and ships restrictive headers.
  CSV export neutralizes spreadsheet formulas; current export is synthetic only.
- Workforce functions derive one active tenant from the verified caller, use empty
  search paths and check exact roles/scopes. HR saves atomically append audit
  entries; direct table writes and private helper execution remain denied. HR
  cannot read audit data or assign HR/auditor/owner. Staff projections enforce
  self/department+site scope; other staff account emails are HR-only.
- Onboarding requires a confirmed Auth account and valid tenant references.
  Protected/cross-tenant/revoked accounts are not silently repurposed. Profile and
  membership versions reject stale edits, including owner-made access changes.
  Inactive profiles disable membership; requests with old tokens are denied.
  Multi-assignment supervisor edits require owner review. Assigned/historical
  shift hours cannot be rewritten. These are database-enforced rules.

## Before production private data

Migration 0007 adds mandatory HR-configured store distance checks for clock-in and
clock-out. The private location insert trigger uses the server-derived event site
and requires distance plus reported accuracy to fit the configured radius. Missing
setup, outside/uncertain fixes and stale data roll back the whole punch. Store
centre/radius/version/distance snapshots are immutable. Configuration is HR-only,
tenant-scoped and versioned; direct table access/private helper execution is denied.
See `STORE_ATTENDANCE_AREAS.md`. Device GPS remains untrusted input, not proof of
physical presence; acknowledgement and browser permission still precede capture.

Normal attendance derives the employee, assignment, work site and timestamps in
PostgreSQL. Only active Employee accounts can punch themselves. A request UUID,
expected previous event, serialized writes and unique checkout pairing prevent
duplicates/stale transitions. HR assignment saves check versions and disallow
overlaps or rewriting dates used by history. Scoped summaries cannot count rows
outside the caller's access. Supervisor history also requires matching immutable
event scope; current profile reassignment alone cannot expose old-site records.
History remains append-only, and every successful normal punch has one atomic
audit event. Revocation remains possible during an open session; HR profile/role
reassignment waits for checkout. Attendance decisions use caller JWTs. From 0009,
the existing server-only binding uploads validated photo bytes to reserved private
Storage paths; it cannot replace caller-scoped punch authorization.

Owner-authorized per-punch location additionally requires the versioned employee
notice and browser permission. Browser positions are untrusted device reports;
they do not establish identity, physical presence or attendance timestamps. The
server validates coordinate/accuracy bounds, capture freshness and notice version,
and binds the proposed employee snapshot to its independently derived subject.
Precise locations persist atomically with the punch in an immutable private RLS
table, without API-role table grants. Only Employee-self and HR-organization
detail RPC access is allowed and audited. Supervisors, other employees/tenants,
auditors and owners do not inherit it. List payloads contain no coordinates.
Device data is not logged or persisted in browser storage. Native permission and
an acknowledgement precede each new capture; retries reuse the original fix.

Dashboard Auth administration additionally requires migration 0004 and the private
Cloudflare binding described in `ADMIN_DASHBOARD_SETUP.md`. The gateway validates
the caller, HR scope and target snapshots before every administrative write. Only
fixed Auth routes receive the elevated key; database queries retain caller JWTs.
Initial/new passwords are processed in memory and never logged/persisted by the
application. Errors do not echo provider bodies, credentials or submitted fields.
Requests are size/deadline bounded and reject cross-origin callers.

Private operation intents and keyed fingerprints prevent duplicate/replayed
credential writes. Auth server-only operation metadata confirms completion;
user metadata grants no authority. Profile/identity/protected-role changes are
guarded during a pending operation while active-access revocation remains possible.
Recovery/closure runs inside the HR dashboard and never deletes accounts or
pretends to roll back already saved credentials. Workspace preferences and own
display names have scoped/versioned audited saves; own email/password changes use
only the owner's ordinary Auth session. Protected-role grants remain outside HR.

Apply and validate the migrations against the real Supabase project; provision
confirmed accounts/assignments with the project-owner setup queries. Keep public
sign-ups disabled for this staff app. The queries never automatically grant HR and
never overwrite existing memberships. Do not expose SQL Editor/admin credentials.

Implement/test per-endpoint business scopes, atomic mutations, database least privilege, live RLS,
rate limiting/WAF, credential rotation, monitoring and backup restore. Deploy exact
CORS/host/CSP origins, HTTPS and managed secrets. Do not expose API docs in production.
The API health endpoint is process liveness, not database readiness.

Approve document access/retention, upload validation/scanning, short-lived signed
URLs and privacy notices. Per-punch location uses the approved scope and notice
in `ATTENDANCE_LOCATIONS.md`; locations are retained with attendance without an
automatic purge. Broader tracking/retention changes need a separate owner policy.
The owner separately authorized per-punch photo evidence after scanning a store QR.
See ATTENDANCE_PHOTO_QR.md for consent, private storage, exact replay and access
rules. Facial recognition and background capture remain outside the MVP.

Robots/noindex are crawler hints, not confidentiality. Service roles bypass RLS and
must never be used in the frontend or as a shortcut for scoped reads. Never dump
environment values, request Authorization headers, or secret files into logs.

Report vulnerabilities privately to the repository owner; do not post sensitive
records publicly. No independent security audit or compliance certification is claimed.

From migration 0010, QR is disabled for new punches. Every configured area and HR
area save uses a fixed 50-metre radius; existing preflight and the commit-time
location trigger enforce distance plus reported accuracy within that boundary.
Photo upload, private access, consent and audit rules are unchanged. Historical
QR verification is shown only for evidence that actually has a saved QR version.

Migration 0012 adds personal employee QR shortcuts; store QR stays disabled.
Personal links never authorize another identity. QR workspace/camera/shutter and
photo prepare/commit RPCs require the matching active Employee. HR can issue/read/
rotate only within its organization. QR storage has no browser grants, operations
are audited and rotation uses attendance serialization. Committed exact retries
survive rotation without another punch; unfinished old-code requests are rejected.
See [personal QR security and activation](EMPLOYEE_ATTENDANCE_QR.md).

Migration 0013 explicitly supersedes personal QR sign-in: possession is an
attendance-only credential for the QR's employee. Only the server gateway can
execute its restricted SQL dispatcher. Direct browser roles cannot invoke it;
the dispatcher exposes no arbitrary RPC, general Auth session, directory/history,
account mutation or private-photo read. It derives the subject from the token,
rejects forged employee IDs and inactive/banned accounts, restores transaction-local
claims, and retains expected-state/retry, QR rotation, GPS and photo constraints.
Normal workspace and private-photo permissions remain authenticated. Keep QR codes
private and replace copied/lost codes; GPS and selfies do not independently prove
identity. See EMPLOYEE_ATTENDANCE_QR.md for the complete current access contract.

Migration **0014** supersedes the unsigned personal QR path. A common link grants
no attendance authority. New punches require a verified Employee JWT/session,
active self profile, exclusive attendance channel and an approved WebAuthn key.
The Worker verifies signature, RP, origin, nonce and required user verification;
SQL checks the action hash, active credential version, current flow, photo/GPS,
expected prior event and exact replay. Browser roles cannot mark identity or
uploads verified. HR approval/reset and all sensitive operations are audited.
Random checks use unpublished server schedules, fixed two-minute deadlines,
50-metre-plus-accuracy checks and separate immutable private evidence. Supervisor,
other users/tenants and unsigned QR access cannot read or write that evidence.
Keep passkeys/device PINs private and verify enrollment in person. Passkey sync,
shared devices/PINs, fabricated client images and spoofed GPS prevent an absolute
physical-identity/fraud guarantee; no face recognition/liveness certification is
performed. See SECURITY_ATTENDANCE.md for the current controls and limits.


Migration **0015** permits a narrowly supervised shared-device flow. Only HR may
grant/revoke a guard capability, bound to an active Employee and assigned site.
The employee signs in independently; the gateway verifies both JWTs and scoped
flows before opening a private five-minute visit. The guard checks staff ID and
live photo in person and approves with their own approved passkey. SQL binds that
proof to the exact employee/action/photo/location, both sessions and the current
site/grant/key versions, with one successful action per visit. Self-approval,
other sites/tenants, expired or revoked authority and direct browser verification
are denied. Normal employee-self location/photo checks and idempotency still apply.
Witness history is append-only; ordinary guards see current due names/deadlines at
their site and gain no access to colleagues' saved photos/history. The temporary
employee Auth client is memory-only and cleared at completion/cancellation/timeout;
the guard's regular session is never overwritten. Human ID verification and a
managed shared device are essential; this does not certify physical identity or
prevent a colluding guard. See SECURITY_ATTENDANCE.md.
