# Development roadmap

The supplied ten-day plan defines sequence, not an unconditional calendar promise.
Each work package may require multiple four-to-five-hour sessions and ends at an
evidence gate.

1. **Baseline and transition:** protect the dirty worktree, map SRS requirements to
   current code and classify assets as reuse, adapt, replace, archive or remove.
2. **Target foundation:** establish React/Vite/TypeScript, FastAPI, PostgreSQL,
   SQLAlchemy, Alembic and Docker Compose without business features.
3. **Identity and tenancy:** implement users, sessions, organizations, stores,
   employees, roles and negative cross-store authorization tests.
4. **Scheduling:** implement employee administration, shifts, overnight behavior,
   time zones and effective-dated assignments without overlap.
5. **Attendance:** implement store QR challenges, constrained private-S3 upload
   intents, server-time events, idempotency and in/out state validation.
6. **Corrections:** derive attendance days and exceptions; add append-only request,
   review and approval evidence with optimistic concurrency.
7. **Draft payroll:** after rule decisions, implement periods, effective components,
   Decimal calculations, input snapshots, blockers and reconciliation.
8. **Approval and payslips:** add maker/approver rules, transactional lock,
   reversal/new versions, private payslips and release.
9. **PWA and reporting:** add manifest, controlled service worker, scoped CSV,
   accessibility and production-like browser journeys.
10. **AWS and operations:** private S3/CloudFront OAC, API server, exact CORS,
    backups, restore, monitoring, OIDC release and rollback.
11. **Hardening and UAT:** freeze scope, resolve critical findings, complete role
    journeys and capture owner sign-off.

Do not begin a later package while the current package has a failed authorization,
data-integrity, privacy or restore gate. Payroll remains `Draft - Not for payment`
until P-01 through P-10 are approved.
