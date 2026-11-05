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
