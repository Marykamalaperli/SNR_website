# SNR NEST

SNR NEST is a mobile-first attendance and controlled draft-payroll product for
multi-store organizations. Employees record attendance with a short-lived store QR
and private photo evidence; store administrators manage their assigned store; HR
reviews exceptions, locks attendance, prepares draft payroll and releases private
payslips.

## Source of truth

The authoritative scope, architecture, implementation sequence and cost assumptions
are the five DOCX files numbered `00` through `04` in `docs/`. The comparison and
transition plan is:

- `docs/05_Source_Aligned_Project_Comparison_and_Implementation_Plan.docx`

Active Markdown documentation describes the target. Provider-specific Supabase,
Cloudflare, Google Cloud and personal-QR documents are retained only as superseded
implementation history until the approved cleanup phase.

## Current status

This repository contains a substantial earlier React/JavaScript, Supabase and
Cloudflare implementation. It is not yet the final source architecture. Before new
feature work, classify existing components as reuse, adapt, replace, archive or
remove. No AWS deployment, target PostgreSQL schema, target store-QR attendance flow
or payroll engine is claimed operational.

The first engineering milestone is a protected baseline and requirement-to-code
trace. The preferred pilot starts with a clean target PostgreSQL database unless an
approved private-data migration is required.

See `docs/PROGRESS.md` for the shared, evidence-based implementation and cloud
status used by Codex, Antigravity and human contributors.

## Target stack

- React, Vite and TypeScript PWA
- React Router and reusable CSS tokens
- Python 3.12+, FastAPI and Pydantic
- SQLAlchemy 2, Alembic and PostgreSQL
- Private S3 frontend origin behind CloudFront OAC
- Separate private S3 evidence, payslip and backup storage
- Docker-based local/server services
- GitHub Actions with short-lived AWS authorization
- Vitest, Testing Library, Playwright, Pytest and Ruff

## MVP roles

- **Employee:** sign in, view assigned shift, scan the store QR, submit check-in or
  check-out with required photo evidence, review own attendance and access released
  payslips.
- **Store Admin:** manage employees and shifts only in assigned stores, display or
  refresh the store QR, review exceptions and propose corrections with reasons.
- **HR/Payroll:** work across approved stores, lock attendance, configure approved
  pay components, prepare and approve payroll runs and release payslips.
- **System Admin:** manage organizations, stores, role assignments and security
  configuration without silent payroll edits.
- **Auditor/Read-only:** inspect authorized attendance, payroll and audit evidence
  without mutation.

## Non-negotiable rules

- The browser never decides identity, organization, store, role, employee,
  attendance time or approval authority.
- Cross-store authorization is enforced by the API and covered by negative tests.
- Raw attendance, correction history, payroll approval evidence and audit events are
  append-only.
- Money uses fixed-precision `Decimal`/`NUMERIC`, never floating point.
- Attendance photos and payslips are private; access uses authorization followed by
  short-lived signed URLs.
- Payroll is labeled **Draft - Not for payment** until SRS decisions P-01 through
  P-10 receive qualified approval.
- No facial recognition, biometric templates or automated liveness are included.
- Do not provision, deploy, migrate live data or change DNS without explicit owner
  authorization.

## Planned repository shape

```text
frontend/   React TypeScript PWA, shared UI, role workflows and browser tests
backend/    FastAPI modular monolith, SQLAlchemy, Alembic and service tests
infra/      Docker, AWS infrastructure definitions and deployment support
docs/       authoritative source pack, active target docs and archived history
scripts/    verification, migration and operational helpers
```

## Local development

Work Package 1 provides the target foundation. With a running Docker engine:

```powershell
docker compose up --build
```

This starts PostgreSQL, applies the Alembic foundation migration in a separate
one-shot service, starts FastAPI after migration success and starts Vite after API
readiness. The local endpoints are `http://localhost:5173`,
`http://localhost:8000/health` and `http://localhost:8000/api/v1/ready`.

The services can also run independently for development:

```powershell
cd frontend
npm ci
npm run lint
npm run typecheck
npm run test
npm run build
```

```powershell
cd backend
py -3.12 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\Activate.ps1
$env:DATABASE_URL='postgresql+psycopg://snr_nest:snr_nest_dev@localhost:5432/snr_nest'
.\.venv\Scripts\alembic.exe upgrade head
.\.venv\Scripts\python.exe -m ruff check .
.\.venv\Scripts\python.exe -m pytest
```

The Alembic baseline intentionally creates no business tables. Identity and tenancy
begin in Work Package 2.

## Delivery sequence

1. Baseline and approve the reuse/adapt/replace/archive/remove map.
2. Establish the target local stack and migrations.
3. Implement identity, roles and tenant/store isolation.
4. Implement employees, shifts and effective assignments.
5. Implement store QR attendance and private photo upload.
6. Implement attendance summaries and append-only corrections.
7. Implement the deterministic draft-payroll engine after rule approval.
8. Implement approval locking, reversals, payslips and private downloads.
9. Complete PWA behavior, reports and end-to-end tests.
10. Prepare AWS deployment, backups, restore, hardening and pilot UAT.

See `docs/DEVELOPMENT_ROADMAP.md` and `docs/DECISIONS.md` before starting a work
package.
