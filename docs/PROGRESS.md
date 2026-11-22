# SNR NEST implementation progress

Last verified: 22 November 2026

This is the shared handoff ledger for Codex, Antigravity and human contributors.
It records repository and cloud evidence; it does not replace the five-document
source pack or grant permission to deploy, provision, migrate data or change DNS.

## Status vocabulary

- **Planned:** described in source or active documentation but not implemented.
- **Implemented:** present in the repository and locally reviewed.
- **Validated:** the named automated or manual checks completed successfully.
- **Merged:** incorporated into `elite/main` through the linked pull request.
- **Provisioned:** observed in the named AWS account and Region. Repository code or
  a successful CloudFormation review is not provisioned infrastructure.

## Completed foundation

| Area | Status | Evidence |
| --- | --- | --- |
| Source alignment and transition plan | Merged | PR [#1](https://github.com/elite-horizon/SNR_website/pull/1), commit `d0774a7`; active architecture, security, decisions, reuse inventory and validation documents |
| Target local foundation | Merged and validated | React/TypeScript, FastAPI, PostgreSQL, SQLAlchemy/Alembic and Docker Compose baseline; repository CI and Work Package 1 validation |
| Secure AWS delivery identity | Merged and provisioned | PR [#2](https://github.com/elite-horizon/SNR_website/pull/2), commit `4c246ba`; GitHub OIDC roles observed in account `376793939540` |
| AWS staging edge/storage definition | Merged and validated, not provisioned | PR [#3](https://github.com/elite-horizon/SNR_website/pull/3), commit `4f578d3`; CloudFormation validation and no-execute change-set review completed |
| Codex/Antigravity repository handoff | Implemented | Root `AGENTS.md`, `.agents/` rules and skills, and this ledger; merge evidence is in Git history |
| Identity, roles and tenant/store isolation | Merged | Branch `agy/identity-tenancy`, PR [#5](https://github.com/elite-horizon/SNR_website/pull/5), commit `fd9df20`; Argon2id authentication, opaque session rotation/revocation, exact five-role scopes, Alembic migration |
| Shifts and employee administration | Merged | Branch `agy/shifts-employees`, PR [#6](https://github.com/elite-horizon/SNR_website/pull/6), commit `a6450d1`; Alembic migration 202611220003, Employee CRUD & deactivation, Shift CRUD with overnight flag, non-overlapping effective-dated assignments, composite tenancy constraints, target TypeScript service & Vitest suite |
| Attendance backend and store QR challenge | Implemented and locally validated | Branch `agy/attendance-backend`; Alembic migration 202611220004, HMAC-SHA256 store QR challenge tokens & single-use anti-replay validation, photo upload intent generation, transactional in/out punch state validation, idempotency key enforcement, server/store timestamping, append-only audit logging, FastAPI auth linking, and target TypeScript service & tests |

## AWS staging boundary

Observed and usable:

- AWS account `376793939540`, workload Region `ap-south-1` and local profile
  `snrnest-aws`.
- GitHub OIDC federation with `snrnest-staging-github-deploy` and
  `snrnest-staging-cloudformation-service` roles.
- GitHub staging environment variables and a successful live OIDC validation
  workflow.

Implemented as infrastructure code but **not provisioned**:

- Four private S3 buckets for frontend, evidence, payslips and backups.
- CloudFront distribution and origin access control for the private frontend.
- Associated bucket policies, logging, retention and cost-control settings.

Existing Lightsail, legacy S3, hosted-zone and certificate resources pre-date this
plan and remain out of scope. Do not describe them as the target staging stack.

## Current work and next package

Work Package 4 (**Attendance backend and store QR challenge**) is implemented and validated on branch
`agy/attendance-backend`:
- **Data model & migration:** `backend/alembic/versions/202611220004_attendance_and_challenges.py`
  adds `attendance_challenges`, `attendance_events`, and `attendance_audit_logs` with
  composite tenancy constraints, indexes, and single-use challenge consumption.
  Full Alembic `upgrade head` -> `downgrade 202611220003` -> `upgrade head` cycle validated on PostgreSQL.
- **Backend services & API:**
  - `POST /api/v1/attendance/challenges/issue`: issues 60s HMAC-SHA256 signed store QR challenges.
  - `POST /api/v1/attendance/upload-intent`: issues private signed S3 photo upload intents.
  - `POST /api/v1/attendance/events`: transactional punch in/out state validation, idempotency key
    enforcement, single-use challenge verification, and append-only event & audit persistence.
  - `GET /api/v1/attendance/events`: scoped attendance event history retrieval.
  - Frontend-to-backend auth linking: FastAPI cookie session management (`/api/v1/auth/login`, `/me`,
    `/refresh`, `/logout`), CORS and seed script updates with `@dev.example.org`.
- **Target frontend service:** `frontend/src/services/targetAttendanceService.ts` with
  typed schemas, challenge and punch submission methods, and Vitest suite (`targetAttendanceService.test.ts`).
- **Validation results:**
  - Backend: `ruff check .` clean, `ruff format --check .` clean, all 37 pytest tests
    passed against PostgreSQL (including new `test_attendance_integration.py`).
  - Frontend: `prettier --check` clean, ESLint clean (0 errors, 1 existing hook warning),
    TypeScript `tsc --noEmit` clean, 20 Vitest test suites (170 tests) passed, and
    production build succeeded.
  - Live Docker verification: API session authentication and `/api/v1/me` profile resolution verified.

After Work Package 4 is merged, the next product package is Work Package 5 (**Attendance frontend & capture flow**):
wiring the live store camera capture and QR scanner UI to `targetAttendanceService.ts` with store geolocation verification. Payroll remains out of scope.

## Open decisions and gates

- Account recovery and administrator MFA remain open. The session mechanism is
  resolved in `docs/DECISIONS.md`; the pilot rate limiter must move to shared state
  before horizontal API scaling.
- Staging hostnames, certificate and DNS changes require explicit approval.
- Provisioning the reviewed AWS foundation requires explicit approval and a cost
  review; no-execute validation is not approval.
- Compute choice and whether to create a new target instance remain open. The
  legacy `snrnest-prod` Lightsail instance must not be silently reused.
- Retention, RPO/RTO and remaining product decisions in `docs/DECISIONS.md` remain
  unresolved where marked open.
- Payroll remains **Draft - Not for payment** until SRS P-01 through P-10 are
  qualified and approved.

## Required handoff update

At the end of every work package, update this file in the same pull request with:

1. the resulting status using the vocabulary above;
2. branch, PR and commit evidence when available;
3. exact checks run, their outcomes and any skipped checks;
4. external resources actually changed or provisioned; and
5. the next bounded package plus unresolved decisions.

Never record planned behavior as operational, and never include credentials,
tokens, signed URLs, personal data or private request content.
