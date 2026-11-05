# Data model

`supabase/migrations/202611050001_foundation.sql` is an unapplied, reviewable draft.
`auth.users` is Supabase-owned. All application tenant records reference an
organization; composite foreign keys prevent cross-tenant references.

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

All browser writes are denied. Approval status is derived from final events rather
than a mutable request column. Unique idempotency keys and final decision constraints
support, but do not replace, transactional state enforcement. Request retry payload
hashes, actor-role checks, overlap prevention and time-zone handling remain API work.

Membership provisioning is not client-editable. The initial model treats an HR
membership as the entire authorized organization; narrower HR site scopes require an
additional reviewed assignment model. Auditor/owner have no HR data inheritance.
Self/team shift/site read projections and document policies remain intentionally
incomplete. The API adapter must handle these explicitly, never disable RLS.

Private Storage needs a separate reviewed bucket/path mapping, scanning, MIME/size
validation, access logs, retention and deletion policy. No live migration, seed data
or bucket changes have been performed. See `supabase/policies/README.md`.
