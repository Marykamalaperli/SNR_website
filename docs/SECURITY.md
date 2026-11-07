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
  Attendance/corrections/documents remain unconnected. Demo imports/routes exist
  only in development; production tests assert fixtures/preview paths are absent.
- Supabase uses only a public publishable/anon key. Build/server configuration rejects
  service-role keys. No password/token logging. Auth `getUser` verifies identity;
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

Apply and validate the migrations against the real Supabase project; provision
confirmed accounts/assignments with the project-owner setup queries. Keep public
sign-ups disabled for this staff app. The queries never automatically grant HR and
never overwrite existing memberships. Do not expose SQL Editor/admin credentials.

Implement/test per-endpoint business scopes, atomic mutations, database least privilege, live RLS,
rate limiting/WAF, credential rotation, monitoring and backup restore. Deploy exact
CORS/host/CSP origins, HTTPS and managed secrets. Do not expose API docs in production.
The API health endpoint is process liveness, not database readiness.

Approve document access/retention, upload validation/scanning, short-lived signed
URLs and privacy notices. Location needs consent/purpose/retention approval; optional
selfie evidence is not biometric verification. Facial recognition is outside the MVP.

Robots/noindex are crawler hints, not confidentiality. Service roles bypass RLS and
must never be used in the frontend or as a shortcut for scoped reads. Never dump
environment values, request Authorization headers, or secret files into logs.

Report vulnerabilities privately to the repository owner; do not post sensitive
records publicly. No independent security audit or compliance certification is claimed.
