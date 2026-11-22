# Target data model

The target is PostgreSQL managed by SQLAlchemy 2 and Alembic. Existing Supabase
migrations are historical implementation evidence and are not the target migration
chain.

| Entity                 | Key rules                                                                      |
| ---------------------- | ------------------------------------------------------------------------------ |
| organizations          | Tenant boundary, currency and default IANA time zone                           |
| stores                 | Organization key, unique code, local time zone and active status               |
| users                  | Normalized login identity, password hash, status and token version             |
| role_assignments       | Explicit organization/store scope with validated role shape                    |
| auth_sessions          | Hashed opaque access/refresh tokens, expiry, rotation and revocation state      |
| employees              | Unique organization employee code, home store and lifecycle dates              |
| shifts                 | Store-local start/end and grace configuration; overnight supported             |
| shift_assignments      | Effective dates and no overlapping assignment per employee                     |
| qr_challenges          | Store, nonce hash, issue/expiry, usage limit and replay state                  |
| objects                | Private bucket/key, owner, purpose, type, size, hash, status and retention     |
| attendance_events      | Immutable in/out event, server time, employee/store, QR, photo and idempotency |
| attendance_days        | Derived/approved summary with optimistic version                               |
| attendance_adjustments | Append-only before/after evidence, reason and reviewers                        |
| pay_periods            | Organization period boundaries and status                                      |
| payroll_runs           | Version, status, rule/input hash, totals, approvers and lock time              |
| payroll_items          | Employee snapshots, earnings/deductions, gross and net as decimals             |
| payslips               | Payroll item, private object and release time                                  |
| audit_events           | Append-only actor, action, entity, request ID, time and bounded metadata       |

## Integrity rules

- Every scoped foreign key includes or validates the organization/store boundary.
- Role scope is constrained: System Admin is global; HR/Payroll and Auditor are
  organization scoped; Employee and Store Admin require a matching store.
- Raw attendance events and audit events cannot be updated or deleted.
- Employee plus idempotency key is unique for attendance commands.
- A shift assignment date resolves to at most one active assignment.
- Money uses fixed-precision `NUMERIC`; application calculations use `Decimal`.
- Payroll stores currency, rule version, input snapshots and deterministic hash.
- Locked payroll versions are immutable. Corrections create reversal or a new run.
- Object records persist no public URL. Access is generated after authorization.

## Migration policy

Alembic migrations are reviewed in staging, backed up and tested for upgrade and
downgrade where safe. Startup does not apply migrations automatically. The pilot
uses a clean target database unless an explicit private-data migration plan defines
mapping, reconciliation, encryption, rollback and owner approval.
