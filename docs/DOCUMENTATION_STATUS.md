# Documentation status

## Authoritative source

- `00_README_Project_Document_Pack.docx`
- `01_SRS_Attendance_Payroll_MVP.docx`
- `02_Technical_Architecture_Security_DB_API.docx`
- `03_10_Day_Codex_Implementation_Plan.docx`
- `04_Infrastructure_Costs_Assumptions.docx`

## Active transition plan

- `05_Source_Aligned_Project_Comparison_and_Implementation_Plan.docx`

## Active target documentation

- `README.md` and `AGENTS.md`
- `ARCHITECTURE.md`, `DECISIONS.md`, `SECURITY.md`, `REQUIREMENTS.md`
- `DATA_MODEL.md`, `API_CONTRACTS.md`, `DEVELOPMENT_ROADMAP.md`
- `DEPLOYMENT.md`, `RELEASE.md`, `RUNBOOK.md`, `TEST_PLAN.md`
- `PROJECT_STRUCTURE.md`, `DESIGN_GUIDELINES.md`
- `REUSE_INVENTORY.md` for the Work Package 0 requirement-to-code baseline
- `WORK_PACKAGE_1_VALIDATION.md` for the target foundation results and Docker blocker

## Historical documentation

Supabase, Cloudflare, Google Cloud and migrations 0001 through 0016 describe the
existing implementation and remain useful for reuse analysis and traceability. They
do not define the target system. Historical documents are marked superseded and may
be archived or removed only after their reusable controls, data mappings and
validation evidence are captured.

`IMPLEMENTATION_REPORT.md` and `VALIDATION.md` record earlier work. They must not be
used to claim the AWS/FastAPI/PostgreSQL/store-QR/payroll target is implemented or
deployed.

## Cleanup rule

Do not silently delete documentation. A cleanup change must list every file moved or
removed, explain why it has no remaining evidence value and update inbound links.
