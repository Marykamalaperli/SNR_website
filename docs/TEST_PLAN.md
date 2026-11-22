# Test and acceptance plan

## Required layers

- **Unit:** QR signing/expiry, Decimal rules, shift and time-zone boundaries,
  attendance transitions, payroll reconciliation and CSV neutralization.
- **Database:** Alembic upgrade/downgrade, constraints, tenant keys, immutable raw
  events, append-only audit and locked payroll.
- **API integration:** authentication, refresh rotation, cross-store denial,
  idempotency, upload verification, object authorization and safe errors.
- **Frontend:** validation, permissions, camera/upload retry, loading/error/empty
  states, responsive layouts, keyboard focus and private-cache behavior.
- **End to end:** Employee attendance, Store Admin correction, HR payroll approval,
  payslip release and deliberate cross-store/object-ID attacks.
- **Operations:** direct S3 denial, CloudFront SPA behavior, exact CORS, deployment
  repeatability, backup restore, rollback and alert delivery.

## Critical negative tests

- employee and Store Admin cannot access another store;
- deactivated accounts cannot sign in or submit attendance;
- expired, altered, wrong-store and replayed QR challenges fail;
- duplicate attendance submission is idempotent;
- check-out before check-in fails;
- unverified or mismatched photo objects fail;
- original attendance cannot be updated or deleted;
- stale correction decisions return conflict;
- locked payroll cannot mutate;
- employee cannot access another or unreleased payslip;
- direct S3 object reads fail and signed URLs expire.

## Completion checks

Run formatter, lint, unit/integration tests, migration checks, browser tests and the
frontend production build. Start changed services and issue representative requests.
Record commands, exit results, skipped checks and blockers in `VALIDATION.md`.

Automated checks support but do not certify legal compliance, WCAG conformance,
physical identity or fraud prevention.
