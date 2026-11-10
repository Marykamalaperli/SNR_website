# SNR NEST

A warm, straightforward workforce workspace for attendance, team coordination,
employee records and HR reviews. The foundation includes a public website, unified
login, three distinct workspace interfaces, and a runnable API boundary.

**Status:** public frontend, working Supabase authentication (confirmed by the owner),
organization setup, employee profiles/directory and API foundation. The frontend is
at <https://snr-nest.pages.dev>. Dashboard-managed account creation, email/password
changes and workspace/personal settings are implemented. Activate the one-time
server setup in [admin dashboard setup](docs/ADMIN_DASHBOARD_SETUP.md). Routine
staff administration then stays in the app, including existing-account onboarding.
Attendance and shift assignments are implemented; activate the one-time
[attendance migration](docs/ATTENDANCE_SETUP.md). Corrections/documents remain pending. Synthetic workspaces run only in
development. Google Cloud setup is paused.

Per-punch device location capture is implemented with explicit staff notice and
browser permission. Activate migration 0006 using
[attendance locations](docs/ATTENDANCE_LOCATIONS.md). Employee/HR can view saved
coordinates, accuracy and map links; attendance timestamps remain server-generated.
Migration 0007 adds required store distance checks for both punches. HR sets each
store’s centre and radius in **Sites & Shifts → Manage attendance area**; see
[store attendance areas](docs/STORE_ATTENDANCE_AREAS.md) for activation. Migration
0007 originally used a configurable radius; unconfigured stores and
uncertain/outside positions block punches.

Migration 0008 originally added **store QR → photo → location** for each clock-in
and clock-out. Store coordinates/radius are required while adding a site; HR can
download or replace its QR. Apply migration **0008** after 0007 and release the
frontend to activate [photo and QR attendance](docs/ATTENDANCE_PHOTO_QR.md).
Photo/precise-location evidence stays private to the employee and authorized HR.

Migration **0009** adds pasted map links, location checks before each camera and
at the shutter, and separate private Supabase buckets for clock-in/out photos.
Files use the verified user ID plus server date/time and request ID.
See [Storage and location-first activation](docs/ATTENDANCE_STORAGE_LOCATION.md).

Migration **0010** replaces the QR step with **location → photo**. Both clock-in
and clock-out require a fresh, sufficiently accurate position within **50 metres**
before opening the selfie camera and at the shutter. All configured store areas
become 50 metres; old evidence keeps its original radius and QR metadata. QR
controls and new QR provisioning are disabled. The private buckets and filenames
from 0009 are unchanged. Apply 0010 after 0001–0009, then deploy the frontend;
see [photo-only attendance activation](docs/ATTENDANCE_PHOTO_ONLY.md).

## Stack and architecture

React + JavaScript/JSX, Vite, React Router, Lucide, CSS custom properties; ESLint,
Prettier, Vitest, Testing Library and Playwright. Python 3.12+, FastAPI, Pydantic,
Uvicorn and Pytest. Cloudflare Pages includes a narrow Pages Functions Auth gateway;
optional Cloud Run → Supabase Auth,
PostgreSQL/RLS and private Storage. No TypeScript application source.

See [architecture](docs/ARCHITECTURE.md), [decisions](docs/DECISIONS.md),
[design system](design_system.md), [security](docs/SECURITY.md) and
[project map](docs/PROJECT_STRUCTURE.md).

```text
frontend/   React application, styles, local previews, tests, build scripts
backend/    FastAPI health, session boundary, domain contracts, tests
supabase/   Draft tenant-aware schema and RLS review guidance
infra/      Cloudflare and Cloud Run configuration
docs/       Architecture, data, API, design, testing, deployment, runbook
scripts/    Shared verification helpers
```

## Workspaces

- **Employee `/me`:** daily attendance, assigned shift, own history, corrections,
  documents and profile.
- **Supervisor `/team`:** assigned team, roster, exceptions and correction
  recommendations. Final approval belongs to HR.
- **HR `/hr`:** scoped directory, approval queue, attendance, sites/shifts,
  documents and reports. HR does not inherit auditor or system-owner rights.

Protected routes redirect to login without server-confirmed access. During local
development, visit `/preview/me`, `/preview/team`, or `/preview/hr` from the login
page to explore synthetic records. Local sample actions reset on refresh. Preview
routes and fixtures are excluded from production; they never grant real access.

## Local development

Prerequisites: Node.js 24 (see `.node-version`), npm 11+, Python 3.12+, and Git.
No Supabase account is required for the public site, previews, or health API.
Follow [Supabase setup](docs/SUPABASE_SETUP.md) to enable real authentication.

Frontend (first terminal; works in Bash and PowerShell):

```sh
cd frontend
npm ci
npm run dev -- --host 0.0.0.0
```

Open port 5173 in your local browser. Backend (second terminal):

```sh
cd backend
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
.venv/bin/python -m uvicorn app.main:app --no-access-log --reload --host 0.0.0.0 --port 8000
```

Windows PowerShell backend equivalents:

```powershell
cd backend
py -3.12 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe -m uvicorn app.main:app --no-access-log --reload --port 8000
```

Check `http://127.0.0.1:8000/health` and API docs at `/docs` in development.
In PowerShell: `Invoke-RestMethod http://127.0.0.1:8000/api/v1/health`.

## Configuration and authentication

Copy `frontend/.env.example` and `backend/.env.example` to `.env` in their own
directories (`Copy-Item .env.example .env` in PowerShell). Restart services after
changes. Example files contain names and safe defaults, never real secrets.

Frontend uses `VITE_API_BASE_URL`, `VITE_SUPABASE_URL`, and
`VITE_SUPABASE_PUBLISHABLE_KEY`, plus `VITE_AUTH_SESSION_SOURCE` (default `supabase`).
These are public values. All `VITE_*` values are
bundled into the browser: **never place service-role keys or database credentials
there**. `PUBLIC_SITE_URL` is a build-only canonical HTTPS origin, not a fake domain.

Backend uses `APP_ENV`, `CORS_ORIGINS`, `ALLOWED_HOSTS`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`,
`SUPABASE_JWT_ISSUER`, `SUPABASE_JWT_AUDIENCE`, and `SUPABASE_JWKS_URL`.
See examples and [deployment](docs/DEPLOYMENT.md) for exact configuration.
No database password or service-role credential is required by the current API.

Supabase verifies sign-in and user identity; the `current_workspace()` database RPC
confirms the active role/organization under RLS. This works without Cloud Run.
The project owner bootstraps HR once; authorized HR staff then create and assign
Employee/Supervisor accounts in the dashboard. User metadata never grants
privileges. Sessions survive reloads within
the same tab via sessionStorage and are removed on sign-out.

The optional `api` session source calls FastAPI `/api/v1/session`, whose Supabase
adapter uses the same RPC with the caller's verified JWT and public key. It requires
a deployed HTTPS API; unconfigured installs still deny access. Direct browser table
writes remain denied. The third migration adds scoped directory reads and audited
HR save functions without Cloud Run. It needs separate live activation; see
[data model](docs/DATA_MODEL.md) and [workforce setup](docs/WORKFORCE_SETUP.md).

The Pages account and attendance gateways use a Cloudflare Production secret
binding named `SUPABASE_ADMIN_KEY`. Vite never reads it; it is absent from source/build artifacts.
Existing public URL/key settings generate an ignored server config. Scoped data
queries still use the caller JWT, never the elevated key.

## Commands and testing

`npm run test:server` additionally verifies account authorization, recovery and
representative HTTP requests.

Run inside `frontend/`:

| Command                | Purpose                                                      |
| ---------------------- | ------------------------------------------------------------ |
| `npm run dev`          | Vite development server, including local previews            |
| `npm run build`        | Production output in `dist/`; SEO generation when configured |
| `npm run preview`      | Serve the production build for verification                  |
| `npm run lint`         | ESLint                                                       |
| `npm run format`       | Format frontend source/configuration                         |
| `npm run format:check` | Check formatting                                             |
| `npm run test`         | Vitest/Testing Library, one complete run                     |
| `npm run test:watch`   | Interactive test runner                                      |
| `npm run test:browser` | Playwright responsive/a11y/production checks                 |

For browser checks install Chromium with `npx playwright install chromium` (CI), or
set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to a trusted system Chromium. Tests start
their own development and production servers. Build first.

Backend: from `backend/`, run `.venv/bin/python -m pytest` and
`.venv/bin/python -m ruff check .`; formatting with `ruff format .`.
Use `.\.venv\Scripts\python.exe` on Windows. Root `scripts/check.sh` runs all
standard checks after dependencies are installed. GitHub Actions mirrors these.
See [test plan](docs/TEST_PLAN.md) and the recorded [validation](docs/VALIDATION.md).

For API changes: agree contracts and authorization first, add service/adapter and
router with validated schemas, test cross-tenant denial and state changes, then wire
the UI. Do not publish planned endpoints as if they work. Existing API endpoints
are listed in [API contracts](docs/API_CONTRACTS.md).

## Deployment and security

Cloudflare uses `frontend/dist` with SPA fallback and security/noindex headers.
Cloud Run uses `infra/cloud-run/Dockerfile`, managed secrets, exact CORS origins
and `/health`. Nothing is deployed automatically. Review
[deployment instructions](docs/DEPLOYMENT.md) and [runbook](docs/RUNBOOK.md).
For the manual GitHub Actions release workflow and required hosting credentials,
see [release setup](docs/RELEASE.md). It publishes only after an explicit workflow
dispatch on `main`; pushes alone run checks.
Google Cloud setup is paused at the owner's request. The optional later API hosting
instructions remain in [Cloud Shell setup](docs/GCP_SETUP.md). Current Supabase
authentication needs only a frontend deployment and the database setup.

Sitemap generation includes only `/`, requires an actual `PUBLIC_SITE_URL`, and
never invents a domain. Login, private routes and previews are noindex. Robots is
crawler guidance, never a substitute for authorization. No tracking or PWA enabled.

Never log credentials, commit `.env`, expose private Storage, trust client roles,
or overwrite attendance history. Do not collect location without approved consent.
See the security matrix before adding permissions.

## Remaining milestones

Activate and verify attendance using an assigned Employee and Supervisor;
then implement correction requests and approvals, private documents, scoped exports and production
hardening. See the [roadmap](docs/DEVELOPMENT_ROADMAP.md). No payroll, facial
recognition or correction workflow is claimed. License selection remains
with the repository owner.
