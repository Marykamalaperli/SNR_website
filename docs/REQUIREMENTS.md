# MVP requirements

The complete requirements are in `01_SRS_Attendance_Payroll_MVP.docx`. This file is
the repository-facing summary and does not replace the SRS.

## Functional scope

- AUTH-01: password authentication, secure session/refresh handling and exact
  organization/store authorization.
- EMP-01: create, edit, activate and deactivate employees while retaining history.
- SHIFT-01: create shifts and effective-dated assignments; reject overlaps and
  support overnight shifts.
- QR-01: issue short-lived signed store QR challenges and reject expiry, tampering,
  wrong-store use and replay.
- ATT-01: submit check-in/out with verified private photo evidence, idempotency and
  server-authoritative time.
- ATT-02: review and correct attendance through append-only before/after evidence,
  reasons and approver identity.
- PAY-01: calculate a deterministic draft payroll from locked attendance and
  approved configuration snapshots.
- PAY-02: validate, approve and lock a payroll run; use reversal or a new version
  after lock.
- SLIP-01: generate, release and authorize private employee payslips.
- AUD-01: append security-sensitive and financial actions with actor, entity,
  request ID, timestamp and structured metadata.

## Implementation trace

| Requirement | Target implementation | Verification status |
| --- | --- | --- |
| AUTH-01 | `backend/app/services/auth.py`, `backend/app/core/security.py`, `/api/v1/auth/*`, `/api/v1/me` | Unit tests pass; PostgreSQL CI integration pending |
| Tenant/store foundation | Alembic `202611220002`, SQLAlchemy identity models and composite store/organization foreign keys | Offline SQL generation passes; live migration CI pending |
| EMP-01 persistence only | `employees` table with organization-unique code, lifecycle status and retained row | Administration endpoints and UI remain Work Package 3 |

Only the rows marked implemented in `docs/API_CONTRACTS.md` are operational in the
target application. This trace does not claim deployment or live migration.

## Non-functional scope

- TLS, least privilege, exact CORS, rate limits and private S3.
- Cross-store negative authorization tests for every private domain.
- Normal API reads target 500 ms at pilot load; attendance submission targets two
  seconds excluding upload/network.
- Store-local scheduling with UTC persistence and explicit time-zone conversion.
- Keyboard-operable core flows, visible focus and responsive behavior at 360 px.
- Nightly encrypted off-server PostgreSQL backup and periodic restore evidence.
- Privacy notice, data minimization, access logging and approved retention.

## Excluded or deferred

- Facial recognition, biometric templates and automated liveness.
- Certified statutory payroll rules before qualified approval.
- Bank payment, accounting, SMS or WhatsApp integrations.
- Native mobile applications and offline attendance submission.
- High availability and multi-region recovery for the initial pilot.

## Release gate

Authorization, store isolation, QR security, idempotency, payroll lock, payslip
access, backup restore and a complete production-like pilot journey must pass. If
P-01 through P-10 remain open, payroll remains `Draft - Not for payment`.
