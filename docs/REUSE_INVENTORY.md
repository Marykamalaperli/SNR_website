# Existing project reuse inventory

This inventory is the Work Package 0 baseline for the final source architecture. It
records what exists on 22 November 2026 and classifies it as **reuse**, **adapt**,
**replace**, **archive** or **remove later**. Classification authorizes no deletion,
deployment, live migration or private-data movement.

## Baseline conclusion

The repository is not an empty project. It contains a mature React/JavaScript UI,
extensive Supabase attendance SQL, Cloudflare server functions, a small FastAPI
security foundation and meaningful tests. The final product, however, requires a
React/TypeScript PWA, FastAPI modular monolith, SQLAlchemy/Alembic PostgreSQL,
short-lived store QR attendance, private S3 evidence and an AWS deployment.

The safest transition is:

1. reuse provider-independent UI, accessibility, security middleware and test ideas;
2. adapt reusable JavaScript components to TypeScript in focused slices;
3. replace provider-specific identity, data, attendance and deployment boundaries;
4. archive Supabase/Cloudflare/GCP/personal-QR implementation after its useful rules
   and data mappings are captured;
5. remove only generated or redundant material in a separately reviewed cleanup.

## Requirement trace

| SRS requirement                                        | Existing evidence                                                                                    | Classification               | Transition action                                                                                                                                                                                     |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- | ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AUTH-01 secure authentication and scoped authorization | Supabase Auth client, `current_workspace`, JWT verification, protected routes and denial tests       | Adapt/replace                | Reuse login UI, safe errors, JWT/request middleware and tests. Replace Supabase membership with target password/session and PostgreSQL role/store repositories.                                       |
| EMP-01 employee administration                         | HR directory, forms, organization setup and Supabase workforce RPC tests                             | Adapt                        | Reuse accessible forms, directory layout and validation concepts. Replace RPC calls and reconcile roles to Employee, Store Admin, HR/Payroll, System Admin and Auditor.                               |
| SHIFT-01 shifts and effective assignments              | Shift UI and SQL constraints including overnight concepts                                            | Adapt                        | Reuse UI and constraint test cases. Implement target SQLAlchemy models, Alembic constraints and FastAPI services.                                                                                     |
| QR-01 short-lived signed store QR                      | Existing store-QR history plus current personal employee QR and guard workflow                       | Replace with selective reuse | Implement the SRS store challenge contract. Reuse QR rendering/scanning utilities and tamper/replay test ideas only.                                                                                  |
| ATT-01 private-photo attendance                        | Camera/capture UI, idempotent attendance SQL, Cloudflare upload gateway, location and guard evidence | Adapt/replace                | Reuse camera permission/retry UI, idempotency concepts and append-only tests. Replace personal QR, guard passkey, fixed-radius location, Supabase Storage and RPC contracts with FastAPI/S3/store QR. |
| ATT-02 correction workflow                             | Preview correction forms/lists; no operational persistence                                           | Adapt/build                  | Reuse UI prototypes. Build target append-only adjustment service, optimistic concurrency and Store Admin/HR authority.                                                                                |
| PAY-01 deterministic draft payroll                     | No implementation                                                                                    | Build                        | Add approved effective configuration, `Decimal` engine, snapshots, hashes, blockers and reconciliation. Keep draft label until P-01 through P-10 approval.                                            |
| PAY-02 approval and lock                               | No implementation                                                                                    | Build                        | Add maker/approver authority, transactional lock, reversal/new version and audit.                                                                                                                     |
| SLIP-01 private payslips                               | Documents preview only                                                                               | Adapt/build                  | Reuse document-panel presentation if compatible. Build PDF generation, private S3 object records, release state and owner-only signed access.                                                         |
| AUD-01 append-only audit                               | Extensive Supabase audit/event patterns and request IDs                                              | Reuse concepts/adapt         | Carry audit schema, immutable-history and correlation-ID test ideas into PostgreSQL/FastAPI.                                                                                                          |

## Frontend inventory

### Reuse

- Design tokens, typography, responsive layout and shared CSS composition.
- Accessible components: buttons, cards, modal, form field, status, tables and state
  views.
- Public homepage, branding and general dashboard composition.
- Error boundary, remote-state hooks, page metadata and provider-independent helpers.
- Vitest, Testing Library, Playwright and axe test structure.
- CSV formula neutralization and safe public/private route test ideas.

### Adapt

- Employee and workforce views after role naming and target API contracts are fixed.
- Login, protected-route and workspace shells after target session semantics exist.
- Camera/photo capture after removing mandatory location and guard assumptions.
- Correction and document previews after real target services are implemented.
- JavaScript/JSX files migrated to TypeScript/TSX one feature slice at a time.

### Replace or archive

- `@supabase/supabase-js` service calls and configuration.
- Cloudflare `functions/` and server adapters.
- Personal employee QR, security station, guard photo and WebAuthn attendance flows.
- Mandatory fixed-radius location UI and server assumptions.
- Supervisor workspace semantics where the target calls for Store Admin authority.

## Backend inventory

### Reuse

- FastAPI application factory and versioned router pattern.
- Trusted-host and exact-CORS configuration principles.
- Sanitized request IDs, safe error envelope and route-template structured logging.
- Production API-doc disabling and no-store/security headers.
- Pytest structure and negative authorization cases.

### Adapt

- JWT/security helpers only if the approved target session design uses them.
- Pydantic settings and schemas after removing Supabase configuration.
- Membership repository interface into target SQLAlchemy identity and scope services.

### Replace or build

- Supabase JWT issuer/JWKS and `current_workspace` repository.
- Target SQLAlchemy engine/session, Alembic and repositories.
- Identity, workforce, scheduling, attendance, payroll, documents and reporting
  routers/services.
- Background jobs for payslips, cleanup and backups as approved.

## Database inventory

The 16 Supabase migrations are not the target migration chain. They remain valuable
for constraints, idempotency, immutable-history, tenant-isolation and negative-test
ideas. The target receives a new Alembic baseline derived from the SRS data model.

Do not translate migrations line-for-line. In particular, omit or redesign:

- Supabase Auth ownership and PostgREST RPC assumptions;
- RLS as the only business authorization boundary;
- personal QR credentials and QR regeneration semantics;
- guard passkeys, guard photos and shared-device station flows;
- mandatory 50-metre location enforcement;
- Supabase Storage bucket/path conventions, including employee names in keys.

## Infrastructure and workflow inventory

| Existing item                    | Classification  | Reason                                                                                                   |
| -------------------------------- | --------------- | -------------------------------------------------------------------------------------------------------- |
| Cloudflare Pages configuration   | Archive/replace | Target frontend is private S3 behind CloudFront OAC.                                                     |
| Cloudflare Pages Functions       | Replace         | Target business boundary is FastAPI.                                                                     |
| Cloud Run Dockerfile             | Adapt           | Container hardening may be reusable; deployment target changes to approved Linux/AWS hosting.            |
| GCP bootstrap and deploy scripts | Archive         | Target uses AWS and GitHub OIDC.                                                                         |
| GitHub CI structure              | Adapt           | Preserve checks and artifacts; replace Supabase/Cloudflare/GCP steps with PostgreSQL/Alembic/AWS checks. |
| Manual release guardrails        | Reuse/adapt     | Preserve explicit dispatch and environment review; replace provider actions.                             |

## Test inventory

Keep and translate test intent where it matches the SRS:

- cross-tenant and cross-store denial;
- inactive-user denial;
- idempotent attendance submission;
- immutable attendance and audit history;
- overnight shift and time-zone behavior;
- safe request IDs, errors, CORS and hosts;
- private route and production fixture exclusion;
- accessible responsive role journeys.

Archive or rewrite tests whose expected behavior depends on personal QR, guard
passkeys, fixed-radius location, Supabase RPCs/Storage, Cloudflare runtime or GCP.

## Dependency disposition

| Dependency                                                       | Decision                                                           |
| ---------------------------------------------------------------- | ------------------------------------------------------------------ |
| React, React DOM, React Router                                   | Reuse                                                              |
| Lucide and Fontsource packages                                   | Reuse subject to license retention                                 |
| Vite, Vitest, Testing Library, Playwright, axe, ESLint, Prettier | Reuse and add TypeScript-aware configuration                       |
| `qrcode`                                                         | Reuse for store QR display after server challenge contract exists  |
| `@supabase/supabase-js`                                          | Remove after target identity/data transition                       |
| SimpleWebAuthn browser/server                                    | Remove unless a separately approved admin-MFA requirement needs it |
| FastAPI, Pydantic, httpx, Pytest and Ruff                        | Reuse                                                              |
| SQLAlchemy 2, Alembic, PostgreSQL driver, password hashing       | Add in Work Package 1/2 with pinned versions                       |

## Protected material and cleanup

- Preserve all five authoritative source DOCX files unchanged.
- Preserve existing user changes and untracked files.
- Do not delete `supabase/`, Cloudflare/GCP infrastructure or provider documents
  until data mapping, reusable tests and audit/security rules are captured.
- The untracked Node installer, `.playwright-mcp/` and other generated/local material
  require owner confirmation before cleanup.

## Work Package 0 exit assessment

Completed evidence:

- source authority and target architecture are documented;
- current frontend, backend, database, infrastructure and tests are inventoried;
- SRS requirements are mapped to reuse/adapt/replace/build actions;
- existing baseline checks are recorded in the current validation handoff.

Still required before Work Package 1 implementation:

1. Confirm clean pilot database versus private-data migration.
2. Confirm the AWS account/region and target Linux hosting approach for planning.
3. Confirm TypeScript migration is approved by the updated `AGENTS.md`.
4. Decide whether Store Admin replaces the existing Supervisor UX or whether both
   roles remain with distinct authority.
5. Approve adding the target foundation dependencies and Docker Compose files.
