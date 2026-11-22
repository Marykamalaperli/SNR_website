# Decisions and approval register

## Confirmed target decisions

| Decision                                      | Status           | Consequence                                                                    |
| --------------------------------------------- | ---------------- | ------------------------------------------------------------------------------ |
| Supplied DOCX pack is authoritative           | Confirmed        | Existing code and Markdown are reuse evidence only                             |
| React Vite PWA                                | Confirmed        | Reuse compatible frontend components and migrate target code to TypeScript     |
| FastAPI modular monolith                      | Confirmed        | Business authorization moves behind tested API services                        |
| PostgreSQL with SQLAlchemy and Alembic        | Confirmed        | Supabase-specific RPC and RLS code is not the target persistence API           |
| Private S3 plus CloudFront OAC                | Confirmed target | Cloudflare Pages is superseded deployment history                              |
| Separate private evidence and payslip storage | Confirmed        | No public object URLs or shared frontend bucket                                |
| Short-lived signed store QR                   | Confirmed        | Personal QR and guard-passkey attendance is superseded history                 |
| Server-authoritative attendance time          | Confirmed        | Client time is diagnostic only                                                 |
| Append-only attendance and audit              | Confirmed        | Corrections add evidence rather than overwrite events                          |
| Controlled draft payroll                      | Confirmed        | Calculations require approved rules and remain draft until compliance sign-off |
| No facial recognition                         | Confirmed        | Photos support manual evidence review only                                     |
| AWS staging account and workload region       | Confirmed        | Use account `376793939540` in `ap-south-1`; authenticate GitHub through OIDC    |
| First-party opaque cookie sessions             | Confirmed        | HttpOnly Secure SameSite=Lax access/refresh cookies; store only token digests and rotate/revoke server state |

## Transition decisions required

| ID   | Decision                                                         | Default while open                                                      |
| ---- | ---------------------------------------------------------------- | ----------------------------------------------------------------------- |
| T-01 | Approve migration from JavaScript to TypeScript and the sequence | New target code may use TypeScript; do not mass-convert unrelated files |
| T-02 | Clean target database or migrate existing private data           | Use a clean pilot database; do not move private data                    |
| T-03 | Exact AWS domain and API host                                   | Account `376793939540` and `ap-south-1` are confirmed; hostnames remain open |
| T-04 | Linux host choice and PostgreSQL operating model                 | Keep deployment configuration abstract                                  |
| T-05 | Identity session design: secure cookies or token strategy        | Resolved: first-party opaque cookies, PostgreSQL sessions and exact-Origin CSRF checks |
| T-06 | Retention and deletion for photos, payslips, audit and backups   | Keep production storage disabled                                        |
| T-07 | Malware scanning or image re-encoding approach                   | Uploaded objects remain untrusted                                       |
| T-08 | RPO, RTO, monitoring owner and incident contacts                 | No production-readiness claim                                           |
| T-09 | License selection                                                | Do not publish a license claim                                          |

## Payroll and compliance decisions

The SRS decision register P-01 through P-10 is binding. Owners must approve:

- jurisdiction, legal entities and applicable labor/payroll law;
- pay frequency, periods, payday and cut-off time zone;
- salary basis, proration, joining and exit rules;
- leave, weekly off and holiday treatment;
- late, early, grace, rounding and missing-punch treatment;
- overtime eligibility, approval, rate and rounding;
- earnings, deductions, benefits, loans, advances and reimbursements;
- tax, pension, provident fund, ESI or local equivalents;
- photo and location lawful basis, notice, consent and retention;
- payslip content, approval authority, correction, reversal and retention.

Safe behavior while any item is open:

- flag attendance exceptions for human review;
- never auto-deduct or auto-pay from an unresolved rule;
- calculate only explicitly configured components;
- label all payroll output `Draft - Not for payment`;
- block final approval when a required rule or attendance input is unresolved.

## Change control

Architecture and policy changes update this register before implementation. No
deployment, AWS provisioning, DNS change, live migration or private-data transfer is
authorized by the existence of planning documents alone.
