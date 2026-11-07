# Data model

`supabase/migrations/202611050001_foundation.sql` defines the reviewed foundation.
The owner reported applying authentication setup; coding tests use local fixtures.
`auth.users` is Supabase-owned. All application tenant records reference an
organization; composite foreign keys prevent cross-tenant references.

The second migration adds read-only `current_workspace()` authorization. It returns
one active membership for `auth.uid()` under RLS, including organization/name and
authorized team/site IDs. Zero/multiple memberships are denied. The project owner
assigns verified accounts using scripts in `supabase/setup/`; there is no public
unrestricted role-provisioning function or automatic promotion. An assignment may exist before
an employee profile; that does not grant attendance mutation capabilities.

```mermaid
erDiagram
  organizations ||--o{ organization_memberships : contains
  roles ||--o{ organization_memberships : assigns
  organization_memberships ||--o| employee_profiles : represents
  organizations ||--o{ sites : contains
  organizations ||--o{ departments : contains
  employee_profiles ||--o{ shift_assignments : receives
  shifts ||--o{ shift_assignments : schedules
  employee_profiles ||--o{ attendance_events : records
  employee_profiles ||--o{ correction_requests : submits
  correction_requests ||--o{ approval_events : reviews
  correction_requests ||--o{ attendance_events : corrects
  employee_profiles ||--o{ document_metadata : owns
  organizations ||--o{ audit_events : audits
```

| Entity                     | Key details                                                                    |
| -------------------------- | ------------------------------------------------------------------------------ |
| organizations              | Tenant name and default IANA time zone                                         |
| roles                      | Employee, supervisor, HR, security auditor, system owner; no inheritance       |
| organization_memberships   | Auth user, organization, one current role, active flag                         |
| employee_profiles          | Minimal display/directory fields; no legal identity/payroll data               |
| sites / departments        | Organizational scope; each employee has one of each initially                  |
| supervisor_assignments     | Supervisor, department and site intersection                                   |
| shifts / shift_assignments | Local times, IANA zone, effective dates                                        |
| attendance_events          | Server recorded timestamp, occurrence, actor, idempotency key, correction link |
| correction_requests        | Employee's proposed time and reason, append-only                               |
| approval_events            | Recommendation/flag or one final approve/reject decision, actor/note           |
| audit_events               | Minimal structured action/subject/request metadata, no credentials             |
| document_metadata          | Private file description and owner; no public URL/storage path                 |

Raw events never change. Normal punches must use server timestamps; only an approved
correction event may have a historical occurrence time, with its own server-recorded
timestamp. A derived attendance projection will reconcile original and correction
events. Do not treat UI history as a stored source of truth.

Migration 0005 implements normal sessions. `shift_assignments` gains version and
retained cancellation fields. Attendance gains an employee-local sequence, prior event, session
pair ID, assignment reference and frozen department/work date/time zone/scheduled
window. The original clock-in is its session ID; a partial unique index permits
one checkout per session. A repeated UUID must match its action/prior event and
returns the committed receipt. Server timestamps and audit insertion are atomic.
The 20-row history projection sums completed elapsed seconds and counts only
scope-authorized filtered sessions. No mutable daily rollup is the source of truth.

Direct browser table writes are denied. Approval status is derived from final events rather
than a mutable request column. Unique idempotency keys and final decision constraints
support, but do not replace, transactional state enforcement. Request retry payload
hashes, actor-role checks, overlap prevention and time-zone handling remain API work.

The third migration adds HR-authorized setup/profile transactions. HR can link a
confirmed Auth account as Employee or Supervisor, with explicit department/site
and account access. It cannot modify protected roles or repurpose cross-tenant
accounts. Each save appends audit history and checks record versions; membership
versions also catch owner-made access changes. A supervisor's single scope is
updated atomically with its profile; inactivity disables membership. Multi-scope
edits are blocked. The directory returns authorized records, 20 per page, with
literal name/number search and HR-only account emails. `is_self` identifies the
caller's profile even if cached navigation has an old role.

The initial model treats an HR
membership as the entire authorized organization; narrower HR site scopes require an
additional reviewed assignment model. Auditor/owner have no HR data inheritance.
Self/team shift/site read projections and document policies remain intentionally
incomplete. The API adapter must handle these explicitly, never disable RLS.

Private Storage needs a separate reviewed bucket/path mapping, scanning, MIME/size
validation, access logs, retention and deletion policy. No live migration, seed data
or bucket changes have been performed by this coding task. See `supabase/policies/README.md`.

## Private punch locations

Migration 0006 adds `snr_private.attendance_locations`, keyed by organization/event
with a foreign key to the immutable punch. It stores reported latitude/longitude,
accuracy meters, device capture time, server receipt time and notice version.
No existing event is rewritten; old rows retain missing-location status. A new
clock-out can attach its own GPS to a pre-upgrade open session.

The normal writer and location insert share one transaction/audit. Retries compare
the original location values as well as action/prior event, returning the receipt
without a new fix or event. An expected-employee snapshot prevents actor changes
from reassigning an in-flight capture. The old writer is private/non-executable;
its public compatibility guard requires location instead of allowing a bypass.

Precise data is absent from list projections and direct browser reads. A scoped
Employee/HR detail RPC returns both session points and appends a view-audit event
without coordinates. RLS and append-only triggers protect the location table.

## Dashboard administration migration

Migration 0004 adds an organization version, an optional membership display name,
and the private `snr_private.staff_account_operations` ledger. That table has RLS,
no browser table privileges, pending request uniqueness and state/lease/fingerprint
fields. It contains no passwords or administrative key. A keyed HMAC fingerprint
binds request content without storing raw credentials. Auth accounts themselves
remain GoTrue-owned and are changed through its Admin API only.

Narrow HR functions prepare, authorize, complete, recover and close requests.
Completion checks server-only Auth metadata, derives the target identity and
links profiles/memberships atomically with the application audit. Profiles and
identity/protected-role relationships are held while pending; inactive membership
updates remain available. Completed operations cannot replay credentials; closing
never deletes an Auth account or undoes its already saved attributes. Organization
preferences/own display-name saves are versioned and audited. The INVOKER session
RPC keeps all prior RLS/role checks and uses membership display name only as an
own-name fallback, never authority.
