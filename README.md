# SNR NEST

A warm, straightforward workforce workspace for attendance, team coordination,
employee records and HR reviews. The foundation includes a public website, unified
login, three distinct workspace interfaces, and a runnable API boundary.

**Status:** frontend prototype + backend foundation. Synthetic workspaces run only
in development. Live attendance, membership authorization, documents and database
integration are pending; no cloud resources have been created.

## Stack and architecture

React + JavaScript/JSX, Vite, React Router, Lucide, CSS custom properties; ESLint,
Prettier, Vitest, Testing Library and Playwright. Python 3.12+, FastAPI, Pydantic,
Uvicorn and Pytest. Target hosting: Cloudflare Pages → Cloud Run → Supabase Auth,
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

Protected routes redirect to login without backend-confirmed access. During local
development, visit `/preview/me`, `/preview/team`, or `/preview/hr` from the login
page to explore synthetic records. Local sample actions reset on refresh. Preview
routes and fixtures are excluded from production; they never grant real access.

## Local development

Prerequisites: Node.js 24 (see `.node-version`), npm 11+, Python 3.12+, and Git.
No Supabase account is required for the public site, previews, or health API.

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
`VITE_SUPABASE_PUBLISHABLE_KEY`. These are public values. All `VITE_*` values are
bundled into the browser: **never place service-role keys or database credentials
there**. `PUBLIC_SITE_URL` is a build-only canonical HTTPS origin, not a fake domain.

Backend uses `APP_ENV`, `CORS_ORIGINS`, `ALLOWED_HOSTS`, `SUPABASE_URL`,
`SUPABASE_JWT_ISSUER`, `SUPABASE_JWT_AUDIENCE`, and `SUPABASE_JWKS_URL`.
See examples and [deployment](docs/DEPLOYMENT.md) for exact configuration.
No database password or service-role credential is required by the current API.

Supabase sign-in is prepared, but a valid token alone cannot open a workspace.
`/api/v1/session` must resolve a trusted membership; its current adapter deliberately
returns 503. Do not replace this with frontend roles or JWT user metadata.
The draft migration enables RLS and denies browser writes. Test it in an isolated
Supabase project before implementing adapters. See [data model](docs/DATA_MODEL.md).

## Commands and testing

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

Sitemap generation includes only `/`, requires an actual `PUBLIC_SITE_URL`, and
never invents a domain. Login, private routes and previews are noindex. Robots is
crawler guidance, never a substitute for authorization. No tracking or PWA enabled.

Never log credentials, commit `.env`, expose private Storage, trust client roles,
or overwrite attendance history. Do not collect location without approved consent.
See the security matrix before adding permissions.

## Remaining milestones

Approve organizational policies and domain; implement/test memberships and RLS;
then transactional attendance and correction APIs; finally private documents,
scoped exports and production hardening. See the [roadmap](docs/DEVELOPMENT_ROADMAP.md).
No payroll, facial recognition, live HR data, or working production private session
is claimed. License selection remains with the repository owner.
