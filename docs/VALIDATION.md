# Validation record — 5 November 2026

Validated in the managed Linux environment with Node 24.22.1, npm 11.9.0,
Python 3.12.14 and system Chromium. No external application was deployed.

| Check                                                       | Actual result                                              |
| ----------------------------------------------------------- | ---------------------------------------------------------- |
| `npm ci`                                                    | Passed; frozen package-lock installation                   |
| Python venv + constrained `pip install -r requirements.txt` | Passed, including repeat installation                      |
| `python -m pip check`                                       | Passed; no broken requirements                             |
| `npm run format:check`                                      | Passed                                                     |
| `npm run lint`                                              | Passed                                                     |
| `npm run test`                                              | **30 passed**, two test files                              |
| `npm run build`                                             | Passed; `frontend/dist`, no invented canonical URL/sitemap |
| `python -m ruff check .` / `ruff format --check .`          | Passed                                                     |
| `python -m pytest -q`                                       | **26 passed**                                              |
| Playwright + system Chromium                                | **11 passed**                                              |
| Running Uvicorn `/health`, `/api/v1/health`                 | 200 with expected JSON                                     |
| Running Uvicorn `/api/v1/session` without a token           | 401, consistent JSON error                                 |
| Unimplemented `/api/v1/employees`                           | 404; no fake records                                       |
| Running Vite public, login and three preview paths          | HTML served; rendering checked by Chromium                 |
| Source file review                                          | JavaScript/JSX only; no TypeScript application files       |

The root `bash scripts/check.sh` also passed after the clean dependency installation,
covering formatting, lint, tests and production build. Both fonts' OFL license notices
are included in the production output.

Browser tests cover all five requested widths: 360, 390, 768, 1024 and 1440px.
They check public/login/three dashboards for overflow and runtime errors, use
automated WCAG A/AA checks at 390/1440px, exercise mobile navigation and modal
keyboard focus, approve a sample request and download a sample CSV. Twenty-five
responsive screenshots are generated under ignored `frontend/test-results/` and
representative desktop/mobile screenshots were visually inspected.

Production checks confirm all three preview URLs render the noindex not-found
interface, login contains no preview shortcuts, generated JS contains no synthetic
fixture identities/preview paths, and private-route refreshes require sign-in.
Sitemap tests use temporary output with a reserved example domain and verify only
the existing public homepage is listed. The actual build has no sitemap because
the real production domain has not been supplied.

The backend suite produces one upstream Starlette/httpx test-client deprecation
warning; no test is skipped or fails. The browser runner produces nonfunctional
color-environment warnings. Initial contrast and sample-submit issues were fixed
and the affected checks rerun successfully. The command sandbox blocks local
TestClient sockets/networking; successful service/browser/backend checks used the
platform's approved execution allowance, not disabled application security.

## What this does not establish

- No real Supabase sign-in or trusted membership integration was tested. The
  default adapter deliberately denies sessions with 503.
- SQL/RLS is an unapplied draft; no live database or private Storage tests ran.
- Attendance/correction APIs, server idempotency and durable audit transactions
  are not implemented. Preview interactions are ephemeral synthetic state only.
- The Docker image is built and smoke-tested locally (see follow-up below).
  Cloudflare edge headers, Cloud Run deployment/rollback, a real canonical domain
  and GitHub-hosted CI execution remain external validations. Local equivalent CI
  commands passed.
- Axe checks and screenshots do not certify full accessibility or security compliance.

The cloud environment `install_script` and `start_skill` fields were saved as a
draft. Installation was executed; startup and representative requests were tested.
Publication and restoration in a new task have **not** been performed or verified.

## Deployment follow-up

The foundation commit `ff502f8` was pushed to GitHub `main` and verified with
`git ls-remote`. Nine additional Node deployment guardrail tests passed. They cover
missing access, read-only project reuse, authenticated not-found creation, denial
without writes, production-branch preservation, canonical ownership and exclusion
of credentials/caches/unrelated files from Cloud Build uploads. Both GitHub workflows
passed actionlint 1.7.12 after its official release checksum was verified; the Cloud
Run script passed Bash syntax validation.

The production container built using the managed Docker daemon with a mounted public
proxy CA bundle and TLS verification enabled. Its running `/health` and
`/api/v1/health` returned 200, `/api/v1/session` returned 401, and `/docs` returned 404.
The runtime user was `appuser`; pytest and Ruff were absent. The test container was
removed. Development requirements still install the pinned test tools separately.

`wrangler whoami` confirmed no Cloudflare login. The Google identity manifest has no
connections. GitHub API requests were forbidden by the current network policy,
although native Git push worked; CI status could not be confirmed remotely.
The environment draft now declares the missing Cloudflare API token, account and
Google project/region metadata and requests `api.github.com`/`api.cloudflare.com`
access. It stores requirements only, never credential values. Review/save the draft
in environment settings and publish it to activate a reusable configuration.
GitHub Actions needs its own secure settings as documented in `RELEASE.md`.
No hosted website or Cloud Run service is claimed to exist.

## Google Cloud setup follow-up

The owner subsequently reported the frontend live at `https://snr-nest.pages.dev`
and supplied Google Project ID `snr-nest`. Neither the Google project nor billing
has been independently verified. The Cloud Shell setup script checks both before
provisioning; no Google resources were created from this task.

Thirteen additional Python tests passed for billing-first behavior, repeated runs,
scope/identity conflicts, private regional source storage, preservation of unrelated
files, explicit project routing and keyless repository/branch trust. These use a fake
CLI and do not establish live Google IAM correctness. The full repository check
passed again: 30 frontend tests, 39 backend/setup tests, nine Node deployment tests,
formatting/lint and the production build. Both workflow files passed actionlint.
The bootstrap `--plan` command ran offline for `snr-nest` and `asia-south1`.

## Supabase authentication follow-up

Google Cloud work was paused by the owner. The selected Supabase origin is
`https://emvppphhkmbpgqduikup.supabase.co`; its public key is configured only in ignored
local frontend settings. The project has not been changed remotely. A read-only
Auth settings request was blocked by this environment's proxy (403 tunnel denial),
so actual project readiness and a live user login remain unverified.

Final local results:

- **66 frontend tests passed**, including key-class/redaction guards, verified-user
  matching, RPC denials, exact role mapping, tab persistence/fallback and session races.
- **55 backend tests passed**, including the existing setup tests and 16 new Supabase
  adapter/configuration cases. One upstream Starlette/httpx deprecation warning remains.
- **14 Chromium tests passed**. Three exercise the real Supabase JS SDK against
  intercepted HTTP contracts (login, reload, logout, role metadata spoofing, revoked
  membership and incorrect credentials). They are not live Supabase account tests.
  Responsive, accessibility and production preview-protection checks also passed.
- Both migrations applied successfully to a disposable PostgreSQL 16 database.
  Owner-only administrator/employee setup queries passed; all **nine authorization
  scenarios** passed as actual anon/authenticated database roles. Test Auth context
  is emulated; no production data or Supabase secret was used. The container was removed.
- An intentional Vite build with a fake secret-key sentinel failed before bundling
  and did not reflect the value. The normal production build, formatting, ESLint,
  Ruff, Bash syntax, actionlint and nine deployment guardrail tests passed.

The browser pass corrected invalid definition-list nesting in existing dashboard
summaries without changing their data or layout. Activation steps and limits are
documented in `SUPABASE_SETUP.md`: project-owner migrations, a confirmed Auth account
and explicit membership, public GitHub build variables, then a frontend-only release.
No operational attendance, correction, employee-administration or storage API is claimed.

## Organization setup and employee directory follow-up

The owner confirmed working authentication and requested the next design and
development slice. The new release adds real HR setup/directory screens, profile
onboarding/editing, own employee profile and assigned supervisor roster. Narrow
PostgreSQL functions handle the saves; FastAPI attendance/corrections remain pending.
No live database change or frontend deployment was performed in this coding task.

Executed checks:

- `PUBLIC_SITE_URL=https://snr-nest.pages.dev bash scripts/check.sh` passed:
  **82 frontend tests**, **55 backend/setup tests**, nine deployment guardrails,
  formatting/ESLint/Ruff, Bash checks and the production build. The pre-existing
  upstream Starlette/httpx deprecation warning remains. No dependency upgrade was made.
- `bash scripts/test-supabase.sh` applied all three migrations in actual PostgreSQL
  16, exercised administrator/employee provisioning helpers, nine baseline RLS
  scenarios and eight additional workforce scenario groups. Assertions include
  role/tenant tampering, confirmed/protected/revoked accounts, direct-write/helper
  denial, atomic audit/rollback, snapshot conflicts including owner-made access
  changes, duplicates, overnight/assigned shift rules, literal search/pagination
  and supervisor scope changes. The private container was removed; fixtures rolled
  back. Auth context is emulated locally, not a live GoTrue/PostgREST login.
- Full Chromium regression: **20 browser checks passed**. After final visual and
  accessibility adjustments, all six workforce scenarios passed again, including
  dashboard/setup/mobile form accessibility, directory layouts at 360/1440px,
  search/pagination, onboarding/edit/access, reload persistence, failures and staff
  projections. The real SDK uses intercepted HTTP contracts; server authorization
  is tested separately in PostgreSQL. Local screenshots were visually reviewed.

The database harness now waits for the final PostgreSQL TCP listener inside its
network-isolated container, avoiding the image's temporary initialization-server
race. It still publishes no port and accepts no customer database URL or credential.

Activation requires the owner to run only migration `202611070003` in the existing
project, deploy the frontend and verify real staff accounts/scopes. Existing public
configuration is reused. Auth account creation/passwords remain in the Supabase
dashboard; HR forms link confirmed accounts and grant only Employee/Supervisor.
Details and limits are in `WORKFORCE_SETUP.md`.

## Dashboard-only account and settings release

The owner requested that routine account/person/data changes happen in the admin
dashboard. The new implementation adds a Pages Functions Auth gateway, in-app
create/link/confirm/email/password operations, pending-request recovery and HR
workspace/own settings. No live admin key was supplied or used; no real person,
production Auth account, private binding or live schema was changed by this task.

Executed final checks:

- `scripts/check.sh` passed **96 frontend tests**, **20 account server tests**,
  **55 backend/setup tests**, nine deployment guardrails, Prettier, ESLint, Ruff,
  Bash syntax and the production build. The existing upstream Starlette/httpx
  deprecation warning remains. No application dependency upgrade was needed.
- `scripts/test-supabase.sh` applied all four migrations to network-isolated
  PostgreSQL 16. All prior provisioning/RLS/workforce checks passed, plus the new
  account/ledger/settings groups: private ACLs, metadata proof, idempotency,
  snapshots, interruption/closure, protected/cross-tenant/revoked users, existing
  unconfirmed accounts, pending relationships and role changes. It explicitly
  rejects a foreign organization claiming an Auth account before profile completion.
  A separate two-connection regression check forced overlapping settings updates;
  one succeeds and the other gets a stale-version denial, with one audit event and
  no deadlock/lost name. The disposable container was removed. GoTrue writes are
  simulated only inside the test fixture, not in a real project.
- **24 Chromium checks passed** on the final code, covering prior routes plus
  account creation, login-detail editing, form-close recovery, workspace/own
  settings, email-confirmation messaging, responsive views, accessibility and
  keyboard focus. Upstream/browser HTTP uses intercepted contracts; these do not
  establish live GoTrue behavior. Screenshots were visually reviewed.
- Wrangler **4.158.0** compiled the actual Pages Functions Worker. A running local
  Pages runtime served `/` and `/login` as HTML 200, and `/api/admin/staff` returned
  JSON 401 without a token and JSON 403 for a foreign origin. These probes never
  contacted live Supabase and used no administrative credential. The local server
  was stopped afterward.
- A generated, non-real runtime-key sentinel was supplied during the production
  build and Worker compilation. It was absent from all **32 build artifacts**,
  including browser assets, generated public config and the Worker. The value
  was never printed. Both workflows passed actionlint and staged/source whitespace
  checks passed. The real public project settings stay ignored locally.

Activation is documented in `ADMIN_DASHBOARD_SETUP.md`. The owner must apply only
the new migration, set the encrypted Production `SUPABASE_ADMIN_KEY` binding and
redeploy the frontend. Ordinary staff edits then use the dashboard; no recurring
Supabase console step is required. Attendance/corrections/documents remain pending.

## Immediate account-creation connection failure

On 7 November 2026, the owner reported an immediate `request_interrupted` error.
The original authenticated gateway reproduced the same HTTP 503 in the actual
Workers engine before its first upstream call: Workers does not implement the
`redirect: 'error'` option. The corrected gateway uses manual redirects and refuses
3xx responses before reading their body. It also returns a fixed connection-stage
label so a session-service outage is distinguished from a pending Auth operation.

Executed checks on the fix:

- `PUBLIC_SITE_URL=https://snr-nest.pages.dev bash scripts/check.sh` passed:
  **97 frontend tests**, **20 server tests**, **55 backend/setup tests**, nine
  deployment guardrails, formatting/lint checks and the production build. The
  previously recorded Starlette/httpx deprecation warning remains.
- The pinned Wrangler runtime command passed **six checks**: authenticated
  creation plus redirect refusal during session verification and administrative
  writes for each of `2021-11-02` and `2026-11-07`. All outbound calls are synthetic;
  assertions verify that a redirect destination receives no request and that an
  already prepared request keeps its recovery ID. The original gateway fails the
  creation check before this fix. CI and the frontend deployment now run this check.
- All **24 Chromium browser checks** passed. Wrangler **4.158.0** compiled the
  actual Pages Functions Worker successfully. Both workflows passed actionlint.

No SQL, dependencies, hosting compatibility settings or credentials changed. The
SQL suite was not rerun because the schema is unchanged. No live Supabase account
or private data was used in validation. A frontend release and owner verification
against the configured project are still needed; this is a local runtime regression
result, not a claim that the live project has been tested.

## Assigned shifts and normal attendance

After the owner confirmed staff account/role access, the next milestone added
dashboard shift assignments, Employee clock-in/out and schedule/history, and
Supervisor/HR attendance views. Migration 0005 has no seed data and refuses an
unreviewed import of pre-existing attendance. Live activation is separate from
this local implementation/verification; no real employee, Supabase secret or
production database was used.

Final executed checks on 7 November 2026:

- `PUBLIC_SITE_URL=https://snr-nest.pages.dev bash scripts/check.sh` passed:
  **113 frontend tests**, **20 account-server tests**, **55 backend/setup tests**,
  nine deployment guardrails, Prettier/ESLint/Ruff/Bash checks and the production
  build. The previously recorded Starlette/httpx deprecation warning remains.
- `bash scripts/test-supabase.sh` applied all five migrations to an actual,
  network-isolated PostgreSQL 16 database. All previous suites passed, plus
  **12 attendance scenario groups**: anonymous/private/direct-write denial,
  shift tenancy/site/date/versions/overlap, server timing and immutable snapshots,
  expected-state/keyed replay, atomic audit and append-only history, revocation,
  repeated daily sessions, role-scoped reads and filtered summaries, historical
  supervisor scope, midnight/DST resolution, late overnight checkout/site
  deactivation, retained cancellation and department/site pair intersections,
  employee local-date defaults, and 20-row pagination with complete filtered
  totals. Fixtures roll back and the disposable container is removed.
- Separate PostgreSQL sessions forced four attendance races: distinct simultaneous
  intents, identical simultaneous intents, membership revocation, and HR site
  reassignment. Assertions confirm four original events/four audits, exact replay
  or stale/access denials, and no deadlock. The previous settings race also passes.
- Full Chromium regression: **29 browser checks passed**. New journeys cover HR
  assignment/cancellation/overlap failures, Employee clock-in/out and reload,
  recovery of a lost committed response using the same request, own schedules,
  missing shifts, Supervisor/HR filters and mobile accessibility. Desktop/mobile
  screenshots were visually reviewed; the mobile summaries and scroll hint were
  refined and the full browser suite passed on the final screens.
- The pinned Wrangler/Miniflare check passed all **six** authenticated-creation
  and redirect-refusal cases, confirming the account gateway still works in
  both tested Workers compatibility settings. All outbound contracts are synthetic.

No dependencies or cloud credentials changed. Google Cloud remains paused.
The owner must apply only migration 0005, deploy the frontend, and verify a test
employee's actual punches in the existing project. Routine shift assignments and
attendance then stay in SNR NEST. Corrections/approval and private-document
workflows remain unimplemented; no payroll or inferred attendance policy is claimed.

## Per-punch device locations

The owner confirmed normal attendance and requested saved clock-in/out locations.
The change adds explicit per-event acknowledgement, fresh high-accuracy browser
fixes, private atomic persistence and selected Employee/HR detail views. No real
position, employee account or production credential was used during implementation.

Final executed checks on 7 November 2026:

- `PUBLIC_SITE_URL=https://snr-nest.pages.dev bash scripts/check.sh` passed:
  **126 frontend tests**, **20 account-server tests**, **55 backend/setup tests**,
  nine deployment guardrails, formatting/lint/Bash checks and the production
  build. The existing upstream Starlette/httpx deprecation warning remains.
- The PostgreSQL harness verified migrations 0001–0005, committed a synthetic
  legacy open session, then applied 0006 without changing its time/ID. All prior
  suites passed. Seven location scenario groups check old/private/anonymous
  bypass denial, notice/type/bounds/freshness/subject validation, atomic normal
  event/location persistence, exact replay without backfilling old GPS, forced
  location-insert failure rolling back both event/audit, private/role/tenant/own
  view restrictions, minimal view audits, immutability, late recovery and revoked
  access. Separate real sessions verify four original events, four matching
  location rows and four punch audits during contention/revocation/reassignment.
  The isolated database container is removed afterward.
- Full Chromium regression: **31 browser checks passed**. The native simulated
  position provider supplies distinct in/out points; reload retains their values
  and a lost committed response retries without another device fix. Browser
  checks also cover no capture before acknowledgement/activation, permission
  denial without a punch, HR detail/map rendering, Supervisor exclusion and
  accessibility. Unit tests reject missing/null coordinates without inventing a
  zero fix. Desktop/mobile screenshots were visually reviewed.
- A running **Wrangler 4.158.0 Pages runtime** compiled the actual Worker and
  served `/login` as HTTP 200 with `camera=(), microphone=(), geolocation=(self)`.
  Chromium successfully obtained a simulated native fix under that served policy.
  The unauthenticated account gateway still returned 401. Supabase network calls
  were blocked in this probe; no live identity or GPS sensor was used. The local
  server was stopped. Local Wrangler emitted existing SPA redirect/`Request.cf`
  metadata warnings; the representative requests and permission probe passed.

No dependencies, billing resource, map SDK or new secret was added. Live rollout
requires only migration 0006 and a frontend deployment; staff must then allow
location on the actual device. Old records keep their genuine missing-location
status. Device accuracy/spoof resistance and the live Supabase/hardware path are
not certified by simulated-position tests. See `ATTENDANCE_LOCATIONS.md` for
the versioned notice, data access and retained-record behavior.

## 14 November 2026 · Supervised shared-device attendance (0015)

Executed on the existing `main` checkout, preserving the published personal-device
passkey flow and adding a separate supervised route for the user-approved guard
ID check. No live migration, deployment or environment publication was performed.

- `bash scripts/check.sh`: formatting, ESLint/Ruff, production build, **155 frontend
  tests**, **36 server tests**, **55 backend tests** and **9 deployment helper tests**
  passed. The existing upstream Starlette/httpx deprecation warning remains.
- `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium CI=1 npm run test:browser`:
  **53 passed** with two workers, including five shared-device scenarios, native
  virtual-authenticator signatures, private employee-session isolation/cleanup,
  wrong-password refusal, witnessed photo confirmation, lost-response recovery,
  guard revocation, location gating, random checks and five-minute camera cleanup.
  Prior authentication, account, workforce/name editing, attendance, accessibility
  and production route checks also passed. Total application/helper tests: **308**.
- `bash scripts/test-supabase.sh`: all migration/authorization/upgrade/concurrency
  suites through 0015 passed in disposable PostgreSQL 16. New assertions cover
  service-only visit/identity grants, independent sessions, no self-authorization
  or self-approval, versioned HR guard grants, exact evidence/proof binding, photo
  upload verification, immediate revocation at commit, immutable witness history,
  repeated attendance pairs, three scheduled checks, an accepted random photo,
  a late check rejected without a punch, and completed retry after expiry.
  A service-role JWT without `sub` verifies correct enrollment/open-visit audit
  actors, without leaking changed claims into the caller's context.
- `XDG_CONFIG_HOME=/workspace/.cloudflare-test-config WRANGLER_SEND_METRICS=false
  npm_config_cache=/workspace/.npm-cache npx --yes --package=wrangler@4.158.0 --
  node scripts/test-worker-runtime.mjs` passed on compatibility dates 2021-11-02
  and 2026-11-07. It includes two Auth subjects and a real guard WebAuthn signature,
  earlier account/photo requests, wrong-origin refusal and disabled bearer QR.
- `WRANGLER_SEND_METRICS=false npm_config_cache=/workspace/.npm-cache npx --yes
  wrangler@4.158.0 pages functions build functions --outdir .wrangler/worker
  --compatibility-date 2026-11-07` compiled the Worker successfully.

Browser/Auth/Storage fixtures and virtual cameras/positions are synthetic; Worker
cryptography and database authorization execute their real implementations. No
live Supabase account, physical phone/GPS/passkey provider, in-person identity or
production deployment is claimed verified. Apply new migration 0015 after 0014,
reload PostgREST and release the frontend manually, then have HR authorize the
intended guards and perform the live acceptance run in SECURITY_ATTENDANCE.md.

## 14 November 2026 · Attendance QR sidebar navigation

Moved QR access to a dedicated sidebar page for Employee, Supervisor and HR.
The workspace page renders the QR and attendance actions without employee tables;
the optional standalone display window remains available. Removed the dashboard
QR card and directory/report display buttons. No server or database code changed.

Executed from `frontend/`:

- `npm run format:check`, `npm run lint`, `npm test`, and `npm run build` passed;
  all **155 unit tests** passed.
- `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium CI=1 npm run test:browser`
  passed all **53 browser tests**. The updated QR scenario covers desktop sidebar
  selection, no employee tables, direct reload, separate display/download, mobile
  drawer navigation, no horizontal overflow and automated WCAG checks. Existing
  attendance, supervised-device and account/access-control regressions passed.
- Desktop/mobile QR screenshots were visually reviewed. No live deployment or
  Supabase changes were performed. This navigation update needs only the manual
  frontend release; existing migration 0015 activation remains separate.
