# SNR NEST implementation progress

Last verified: 24 November 2026

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

| Area                                                       | Status                                | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ---------------------------------------------------------- | ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Source alignment and transition plan                       | Merged                                | PR [#1](https://github.com/elite-horizon/SNR_website/pull/1), commit `d0774a7`; active architecture, security, decisions, reuse inventory and validation documents                                                                                                                                                                                                                                                                                               |
| Target local foundation                                    | Merged and validated                  | React/TypeScript, FastAPI, PostgreSQL, SQLAlchemy/Alembic and Docker Compose baseline; repository CI and Work Package 1 validation                                                                                                                                                                                                                                                                                                                               |
| Secure AWS delivery identity                               | Merged and provisioned                | PR [#2](https://github.com/elite-horizon/SNR_website/pull/2), commit `4c246ba`; GitHub OIDC roles observed in account `376793939540`                                                                                                                                                                                                                                                                                                                             |
| AWS staging edge/storage definition                        | Merged and validated, not provisioned | PR [#3](https://github.com/elite-horizon/SNR_website/pull/3), commit `4f578d3`; CloudFormation validation and no-execute change-set review completed                                                                                                                                                                                                                                                                                                             |
| Codex/Antigravity repository handoff                       | Implemented                           | Root `AGENTS.md`, `.agents/` rules and skills, and this ledger; merge evidence is in Git history                                                                                                                                                                                                                                                                                                                                                                 |
| Identity, roles and tenant/store isolation                 | Merged                                | Branch `agy/identity-tenancy`, PR [#5](https://github.com/elite-horizon/SNR_website/pull/5), commit `fd9df20`; Argon2id authentication, opaque session rotation/revocation, exact five-role scopes, Alembic migration                                                                                                                                                                                                                                            |
| Shifts and employee administration                         | Merged                                | Branch `agy/shifts-employees`, PR [#6](https://github.com/elite-horizon/SNR_website/pull/6), commit `a6450d1`; Alembic migration 202611220003, Employee CRUD & deactivation, Shift CRUD with overnight flag, non-overlapping effective-dated assignments, composite tenancy constraints, target TypeScript service & Vitest suite                                                                                                                                |
| Attendance backend and store QR challenge                  | Implemented and locally validated     | Branch `agy/attendance-backend`; Alembic migration 202611220004, HMAC-SHA256 store QR challenge tokens & single-use anti-replay validation, photo upload intent generation, transactional in/out punch state validation, idempotency key enforcement, server/store timestamping, append-only audit logging, FastAPI auth linking, and target TypeScript service & tests                                                                                          |
| Attendance frontend and capture flow                       | Implemented and locally validated     | Branch `agy/attendance-backend`; Store QR dynamic station (`StoreQRStation.tsx`) with 60s countdown, employee photo capture flow (`TargetPunchCard.tsx`), live attendance history table (`TargetAttendanceHistory.tsx`), dev upload receiver (`PUT /evidence`), and Vitest component suite                                                                                                                                                                       |
| Attendance daily summaries, exceptions, and corrections    | Implemented and locally validated     | Branch `agy/attendance-backend`; Alembic migration 202611220005 (`attendance_days`, `attendance_adjustments`), automated shift exception evaluation (missing punch, late, early departure, overtime), optimistic concurrency version locking (HTTP 409), append-only immutable correction history, approval workflow, `TargetAttendanceDays.tsx` component, and Vitest suite                                                                                     |
| Payroll configuration & deterministic draft engine (Day 6) | Implemented and locally validated     | Branch `agy/attendance-backend`; Alembic migration 202611220006 (`pay_periods`, `payroll_configurations`, `payroll_runs`, `payroll_items`), deterministic Decimal calculations with `ROUND_HALF_UP`, canonical SHA-256 input hashing, mandatory `Draft - Not for payment` compliance watermark, attendance exception blocker, gross/net reconciliation assertions, `TargetPayrollRuns.tsx` component, and full integration/unit test suites                      |
| Payslips, approval lock and private downloads (Day 7)      | Implemented and locally validated     | Branch `agy/attendance-backend`; Alembic migration 202611220007 (`payslips`, `payroll_audit_logs`), transactional approval lock, reversal/re-versioning workflow, private S3/local PDF payslip artifact generation with mandatory compliance watermark, opaque UUID download intents, and negative role authorization tests                                                                                                                                      |
| Reports engine & PWA polish (Day 8)                        | Implemented and locally validated     | Branch `agy/attendance-backend`; CWE-1236 CSV injection sanitization, streaming attendance & payroll CSV exports, `manifest.webmanifest` and service worker caching rules strictly excluding private API/evidence paths, and full integration/unit test suites                                                                                                                                                                                                   |
| AWS staging deployment & server operations (Day 9)         | Implemented and locally validated     | Branch `agy/attendance-backend`; `compose.prod.yaml` with private network PostgreSQL isolation (no host port 5432 exposure), Caddy reverse proxy with baseline security headers (HSTS, nosniff, DENY), AES-256 encrypted database backup script to S3 BackupBucket, host UFW hardening script, GitHub Actions OIDC staging deployment workflow (`deploy-aws.yml`), and automated infrastructure test suite (`scripts/server-deploy.test.mjs`)                    |
| Hardening, UAT and pilot release (Day 10)                  | Implemented and locally validated     | Branch `agy/attendance-backend`; Scope frozen, complete 5-role negative/positive authorization matrix & multi-store UAT test suite (`test_day10_hardening_uat.py`), backup-restore integrity drill (`test_day10_backup_restore.py`), operational documentation (`docs/PILOT_RUNBOOK.md`, `docs/ROLLBACK_PLAN.md`, `docs/DATA_RETENTION_CHECKLIST.md`, `docs/KNOWN_LIMITATIONS.md`, `docs/PILOT_SIGNOFF.md`), and full automated test suite pass across all tiers |
| Super Admin Store & Store Admin Management                 | Implemented and locally validated     | Branch `agy/attendance-backend`; Super Admin (`system_admin`) organization-wide store CRUD API (`/api/v1/stores`), store-scoped Store Admin provisioning (`/api/v1/stores/{id}/admins`), duplicate code prevention (409), non-admin 403 authorization enforcement, `TargetStoreManagement.tsx` component replacing mock `/hr/sites` cards, and comprehensive integration & Vitest suites                                                                         |

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

Days 7, 8, and 9 (**Approval & Payslips**, **PWA Polish & Reports Engine**, and **AWS Deployment & Operations**) are implemented and validated on branch `agy/attendance-backend`:

- **Day 7 (Approval, payslips and private downloads):**
  - Migration `202611220007_payslips_and_approval.py` adds `payslips` (unique run/employee, storage key, SHA-256 hash, status, release timestamp) and `payroll_audit_logs` (immutable audit trail).
  - Transactional approval lock `POST /api/v1/payroll/runs/{id}/approve` locks payroll run from draft to approved status.
  - Reversal and re-versioning `POST /api/v1/payroll/runs/{id}/reverse` transitions run to reversed status and unlocks pay period for corrections.
  - Release payslips `POST /api/v1/payroll/runs/{id}/release-payslips` generates PDF payslip artifacts (with mandatory `# WATERMARK: Draft - Not for payment` banner) into private storage.
  - Authorized employee download intents `POST /api/v1/payslips/{id}/download-intent` and `GET /download/payslips/{token}` with negative role authorization.
- **Day 8 (PWA Polish & Reports Engine):**
  - Robust reports service with CWE-1236 CSV injection sanitization prefixing untrusted formula triggers (`=`, `+`, `-`, `@`, `\t`, `\r`) with single quotes `'`.
  - `GET /api/v1/reports/attendance.csv` and `GET /api/v1/reports/payroll.csv` streaming CSV endpoints with organization tenancy and role isolation.
  - Frontend PWA manifest (`public/manifest.webmanifest`), theme styling, and service worker (`public/sw.js`) implementing static asset caching while strictly bypassing API and private document paths.
- **Day 9 (AWS Deployment and Operations):**
  - Server Docker Compose configuration (`compose.prod.yaml`): PostgreSQL port 5432 is strictly unexposed to the host and restricted to the internal bridge network (`backend-net`), healthchecks configured for database and API.
  - Caddy reverse proxy (`infra/caddy/Caddyfile`) with automatic TLS support, HSTS (`max-age=31536000`), `nosniff`, `DENY` frame options, API timeouts, and structured JSON request logging.
  - Database backup automation (`scripts/backup-db.sh`): encrypted `pg_dump`, SHA-256 checksum generation, S3 SSE-S3 AES-256 encrypted upload to private AWS BackupBucket, and local retention pruning.
  - Server provisioning and firewall script (`scripts/server-setup.sh`): UFW configuration explicitly blocking port 5432 externally while permitting ports 80, 443, and rate-limited SSH, plus systemd unit configuration.
  - GitHub Actions deployment workflow (`.github/workflows/deploy-aws.yml`): OIDC temporary credential exchange (least privilege, zero committed long-lived AWS keys), S3 sync with 1-year immutable caching for hashed assets, zero-cache for entry points, and targeted CloudFront cache invalidation (no blanket root wildcards).
  - Automated tests: `scripts/aws-infra.test.mjs` (6/6 passing) and `scripts/server-deploy.test.mjs` (6/6 passing).
- **Day 10 (Hardening, UAT and Pilot Release):**
  - Scope freeze and complete 5-role authorization matrix verification (`backend/tests/test_day10_hardening_uat.py`): negative permission enforcement across Employee, Store Admin, and Auditor roles; positive transactional lifecycle validation.
  - Backup-restore integrity drill (`backend/tests/test_day10_backup_restore.py`): dump compression, SHA-256 checksumming, and recovery verification.
  - Operational runbooks and release sign-off:
    - [PILOT_RUNBOOK.md](file:///e:/Projects/SNR_website/docs/PILOT_RUNBOOK.md): Pre-flight checklist, host hardening, Caddy reverse proxy, operational healthchecks, and AWS Budgets thresholds (50%, 80%, 100%).
    - [ROLLBACK_PLAN.md](file:///e:/Projects/SNR_website/docs/ROLLBACK_PLAN.md): CloudFront/S3 entry point reversion and database point-in-time restore procedures.
    - [DATA_RETENTION_CHECKLIST.md](file:///e:/Projects/SNR_website/docs/DATA_RETENTION_CHECKLIST.md): Data lifecycle, append-only audit trail rules, and privacy controls (zero biometric templates).
    - [KNOWN_LIMITATIONS.md](file:///e:/Projects/SNR_website/docs/KNOWN_LIMITATIONS.md): Statutory qualification boundary for SRS P-01 through P-10 (`# WATERMARK: Draft - Not for payment`).
    - [PILOT_SIGNOFF.md](file:///e:/Projects/SNR_website/docs/PILOT_SIGNOFF.md): Formal acceptance criteria sign-off checklist.
- **Validation results:**
  - Backend: 44 pytest integration tests passing against live PostgreSQL in `.venv`; Ruff check and format 100% clean.
  - Frontend: 25 Vitest test suites (187 tests) passing cleanly; Vite production build succeeded.
  - Infrastructure: 12 Node test runner assertions passing cleanly across AWS foundation and deployment scripts.

All 10 days of the Codex Implementation Plan are now complete and validated on branch `agy/attendance-backend`. Ready for pilot release `v0.1.0`.

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

## AWS production-pilot infrastructure definition (24 November 2026)

- **Implemented and locally/AWS-validated, not provisioned:** branch
  `agy/aws-production-pilot`, PR
  [#8](https://github.com/elite-horizon/SNR_website/pull/8), commit `fc576d9`, adds a dedicated VPC, Elastic Beanstalk
  SingleInstance Docker environment, private encrypted Single-AZ RDS PostgreSQL,
  generated Secrets Manager credentials, EC2 workload identity, alarms and AWS
  Budget thresholds.
- The evolution path changes Beanstalk to load-balanced Auto Scaling and RDS to
  Multi-AZ after a separate capacity and cost review. The pilot is not represented
  as highly available.
- Validation passed: JSON parsing, 10/10 Node infrastructure assertions and live
  `aws cloudformation validate-template` in account `376793939540`, Region
  `ap-south-1`. AWS reported the expected `CAPABILITY_IAM` requirement.
- No stack, budget, database, VPC, Beanstalk environment, DNS record, certificate,
  application version, migration or private-data change was provisioned. The alert
  recipient remains a runtime `NoEcho` parameter and is not committed.
- Next bounded package: define and validate the separate least-privilege execution
  role, create and inspect a no-execute change set, and obtain explicit resource
  and cost approval before execution.

## Production release hardening (24 November 2026)

- **Implemented, not merged or deployed:** branch `agy/production-release`
  replaces predictable `SNR@<employee-code>` credentials with cryptographically
  random one-time passwords and adds a production-only, idempotent System Admin
  bootstrap that accepts credentials only from runtime environment variables.
- The Elastic Beanstalk Docker Compose bundle runs Alembic migrations and the
  administrator bootstrap successfully before starting FastAPI, then serves the
  API through Caddy for `api.snrnest.in`. The existing Hostinger root site remains
  out of scope; `app.snrnest.in` and `api.snrnest.in` require later DNS records.
- The CloudFormation definition now generates retained QR-signing and initial
  administrator secrets, supplies production-only origins/hosts, disables the
  Beanstalk platform proxy so Caddy owns ports 80/443, and keeps administrator and
  alert email parameters as `NoEcho` inputs.
- Validation passed: AWS CloudFormation template validation, Ruff lint/format,
  Docker Compose configuration rendering with non-secret review values, and 19/19
  infrastructure/deployment assertions. The focused PostgreSQL workforce test was
  stopped after it produced no result within the review window and remains a gate.
- No AWS resources, DNS, certificates, application versions, database migrations,
  production identities or private data were changed.

## CI formatting and browser-suite alignment (24 November 2026)

- **Implemented and validated:** branch `agy/fix-ci-formatting`, PR
  [#7](https://github.com/elite-horizon/SNR_website/pull/7), corrects the Prettier
  and Ruff failures reported by GitHub Actions run `45342569834` without changing
  application behavior or dependencies. Push validation run `45361128844` passed
  the frontend, backend, database and target-foundation jobs.
- The default `test:browser` command now runs the active responsive/accessibility
  and production-boundary Playwright projects. Supabase, personal-QR and guard
  station projects remain available as `test:browser:legacy`; they are retained as
  transition evidence but are not active target-contract gates.
- Validation passed: frontend Prettier, ESLint (one pre-existing Hook dependency
  warning), TypeScript, 215 Vitest tests, 39 Node server tests, production build;
  backend Ruff lint/format, dependency check and 46 Pytest tests; 21 deployment,
  AWS and server assertions; and 11 active Playwright browser tests.
- No cloud resources, deployments, live migrations, DNS, credentials or private
  data were changed. The branch was pushed with explicit authorization; no pull
  request exists yet.
- Next bounded package: replace the retained legacy browser projects with target
  FastAPI/store-QR end-to-end coverage before removing any historical fixtures.

## Automated AWS production delivery (24 November 2026)

- **Implemented, merged and activated:** PR #15, merge commit `6d38b55`, adds a
  production deployment workflow that runs only after `Application checks`
  succeeds for `main`, detects frontend/API changes and uses the GitHub
  `production` Environment before assuming AWS identity through OIDC.
- Frontend delivery builds with the production API origin, synchronizes only the
  named private S3 frontend bucket and invalidates only the three mutable
  CloudFront entry points. API delivery creates an immutable commit-labelled
  Elastic Beanstalk application version, updates only
  `snrnest-production-pilot`, waits for `Ready / Green / Ok` and verifies public
  readiness and health endpoints.
- A separate least-privilege identity policy grants only the named frontend bucket,
  Elastic Beanstalk release prefix, application/environment and CloudFront
  distribution operations. IAM Access Analyzer returned no findings. No static AWS
  key, administrator secret or application credential is stored in GitHub.
- Validation passed: JSON parsing, 23/23 infrastructure/deployment assertions, IAM
  Access Analyzer identity-policy validation and all four GitHub Actions jobs on
  `main`. The first production workflow run selected no application components for
  the workflow-only merge and correctly skipped the deployment job; it created no
  application version, S3 object, database migration or live environment update.
- The reviewed OIDC trust subject and inline deployment policy are active, and the
  CloudFront distribution identifier is stored as a non-secret environment
  variable. The current private-repository GitHub plan does not support required
  reviewers or branch-protection rules; the owner explicitly approved automatic
  deployment after successful `main` CI instead.
- Next bounded package: observe the first frontend or API change delivered from
  `main`, verify the immutable release/version evidence and exercise the documented
  rollback path before broad pilot use.

## Super Admin Store Management & Google Maps Location Picker (November 2026)

- **Dedicated Admin Workspace Routing & URL Migration:**
  - Migrated store management routes from legacy `/hr/sites` to canonical `/admin/stores`.
  - Added redirect from `/hr/sites` and `/admin` directly to `/admin/stores`.
  - Super Admin (`system_admin` / `admin`) is isolated with dedicated workspace headers (`SUPER ADMIN WORKSPACE`), breadcrumb (`Workspace / Super Admin`), and `SA` avatar initials.
  - Removed `sites` link from HR navigation so store provisioning is exclusively governed by Super Admin.

- **Interactive Google Maps Store Location Chooser:**
  - Integrated `GoogleMapLocationPicker.tsx` component into store creation and edit modals.
  - Interactive click-anywhere pin-drop and drag-to-position on map.
  - Real-time Nominatim place/address search to fly directly to landmarks or cities.
  - Direct Google Maps URL and share link parsing (`parseStoreMapLink`) for desktop and mobile links.
  - Geofence radius circle overlay visually demonstrating allowed attendance radius (e.g. ±50m).
  - Validation requires store location to be chosen before creation.
