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
| Identity, roles and tenant/store isolation | Implemented and locally validated | Branch `agy/identity-tenancy`, PR [#5](https://github.com/elite-horizon/SNR_website/pull/5); Argon2id authentication, opaque session rotation/revocation, exact five-role scopes, Alembic migration; integration test flush order & detachment resolved locally |
| Shifts and employee administration | Implemented and locally validated | Branch `agy/shifts-employees`; Alembic migration 202611220003, Employee CRUD & deactivation, Shift CRUD with overnight flag, non-overlapping effective-dated assignments, composite tenancy constraints, target TypeScript service & Vitest suite |

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

Work Package 3 (**Shifts and employee administration**) is implemented on branch
`agy/shifts-employees`:
- **Data model & migration:** `backend/alembic/versions/202611220003_shifts_and_assignments.py`
  adds `shifts` and `shift_assignments` with composite unique/FK tenancy constraints,
  date range checks, and indexes. Full Alembic `upgrade head` -> `downgrade 202611220002`
  -> `upgrade head` cycle validated on PostgreSQL.
- **Backend services & API:**
  - `EmployeeService` & routes: scoped employee listing, get, create (duplicate-code checked),
    update, and soft-deactivation (preserves historical records).
  - `ShiftService` & routes: scoped shift listing, get, create, and update with
    `is_overnight` flag, break minutes, and store timezone.
  - `AssignmentService` & routes: effective-dated assignment creation with transactional
    overlap rejection and date validation (`effective_from <= effective_until`).
- **Target frontend service:** `frontend/src/services/targetWorkforceService.ts` with
  typed schemas, full CRUD methods, and Vitest suite (`targetWorkforceService.test.ts`).
- **Validation results:**
  - Backend: `ruff check .` clean, `ruff format --check .` clean, all 36 pytest tests
    passed against PostgreSQL (including new `test_workforce_integration.py`).
  - Frontend: `prettier --check` clean, ESLint clean (0 errors, 1 existing hook warning),
    TypeScript `tsc --noEmit` clean, 19 Vitest test suites (166 tests) passed, and
    production build succeeded.
  - Docker: Compose containers healthy and functioning.

After Work Package 3 validation, the next product package is **attendance backend
and store QR challenge**: short-lived server-signed store QR challenges, private
photo upload intents, transactional in/out state validation, and append-only event
storage. Payroll remains out of scope.

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
