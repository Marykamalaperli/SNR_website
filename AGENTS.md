# Working on SNR NEST

The authoritative product source is the five-document pack in `docs/`:

1. `00_README_Project_Document_Pack.docx`
2. `01_SRS_Attendance_Payroll_MVP.docx`
3. `02_Technical_Architecture_Security_DB_API.docx`
4. `03_10_Day_Codex_Implementation_Plan.docx`
5. `04_Infrastructure_Costs_Assumptions.docx`

Use `05_Source_Aligned_Project_Comparison_and_Implementation_Plan.docx` as the
transition plan between those requirements and the current repository. Existing
code and old Markdown documents are implementation evidence, not authority when
they conflict with the source pack.

Read `README.md`, `design_system.md`, `docs/ARCHITECTURE.md`,
`docs/DECISIONS.md`, and `docs/SECURITY.md` before major changes. Use the existing
checkout. Do not create worktrees unless explicitly requested.

## Target architecture

- Frontend: React, Vite, TypeScript, PWA, React Router and reusable CSS tokens.
- API: Python 3.12+, FastAPI modular monolith, Pydantic schemas, service-layer
  authorization and versioned `/api/v1` routes.
- Data: PostgreSQL, SQLAlchemy 2 and Alembic migrations. Store money as
  `NUMERIC`/`Decimal`, timestamps in UTC and store-local scheduling rules with an
  IANA time zone.
- Hosting: private S3 frontend origin served only through CloudFront OAC; a
  separate HTTPS API host; private S3 evidence, payslip and backup storage.
- Delivery: Docker for local/server services and GitHub Actions with short-lived
  AWS authorization. Never commit long-lived cloud keys.

The repository currently contains JavaScript, Supabase, Cloudflare and personal-QR
implementation history. Reuse only after classifying each part as reuse, adapt,
replace, archive or remove. Do not carry provider-specific behavior into the target
silently.

## Product rules

- MVP roles are Employee, Store Admin, HR/Payroll, System Admin and
  Auditor/Read-only. Authorization and organization/store isolation are enforced
  on the server and tested negatively.
- Attendance uses a short-lived server-signed store QR challenge, server receipt
  time, a verified private photo object, idempotency and transactional in/out state
  validation. Location accuracy and device data are optional metadata unless an
  approved policy says otherwise.
- Raw attendance events and audit records are append-only. Corrections add before
  and after evidence, a reason and reviewer authority; they never overwrite the
  original event.
- Payroll reads locked attendance and approved effective-dated configuration. Use
  deterministic `Decimal` calculations, snapshots and input hashes. Approval locks
  a run; later corrections require reversal or a new version.
- Until P-01 through P-10 in the SRS are approved, payroll remains clearly labeled
  `Draft - Not for payment`. Never invent tax, statutory, leave, overtime,
  proration, rounding or deduction rules.
- Attendance photos and payslips remain private. Authorize every upload/download,
  use opaque object keys and short-lived signed URLs, and keep URLs and personal
  data out of logs.
- No facial recognition, biometric templates or automated liveness in the MVP.
- Synthetic data belongs only in development and tests. A route guard, role switch
  or hidden button is not authorization.
- Do not claim planned endpoints, infrastructure, compliance or deployments are
  operational.

## Coding standards

- Use TypeScript for new frontend application code. Migrate reused JavaScript in
  small reviewed slices; do not perform an unrelated whole-repository conversion.
- Use functional React components, hooks, small reusable modules, accessible
  controls and service functions for I/O. Keep business logic out of nested JSX.
- Python uses type hints, FastAPI routers, Pydantic schemas, dependency injection,
  SQLAlchemy repositories/services and testable authorization boundaries.
- Keep structured logs free of passwords, tokens, signed URLs, request bodies and
  personal data. Sanitize request IDs and use route templates rather than raw paths.
- Add dependencies only for a clear purpose. Do not perform major upgrades as part
  of unrelated feature work.
- Preserve user-owned changes. No silent deletion, destructive Git commands or
  provider migration without a reviewed transition decision.

## Infrastructure safety

- Do not push, deploy, provision AWS resources, move private data, apply live
  migrations or change DNS without explicit authorization.
- Never put credentials or server secrets in Vite variables, source files, images,
  logs or `.env.example`. Do not commit `.env`.
- Keep S3 Block Public Access enabled. The frontend bucket is readable only by the
  named CloudFront distribution through OAC. Evidence, payslips and backups use
  separate private policies.
- PostgreSQL must not be public. Bind it to the private Docker network and expose
  only the reverse proxy/API ports required by the approved deployment.

## Completion rules

Review changed and untracked files. Run formatting, linting, applicable unit and
integration tests, database migration checks, browser tests and the frontend
production build in proportion to the change. Start changed services and issue
representative requests. Report exact commands and actual results, including
skipped checks and blockers. Never claim an unexecuted check passed. Update active
documentation and the requirement trace when behavior or architecture changes.
