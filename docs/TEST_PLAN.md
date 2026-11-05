# Test plan

## Required foundation checks

Frontend: `npm ci`, `npm run lint`, `npm run format:check`, `npm run test`,
`npm run build`. Backend: install `requirements.txt` (constrained by the full
`requirements.lock`), `python -m ruff check .`, `python -m ruff format --check .`,
`python -m pytest`. Run from each component's directory. The root `scripts/check.sh`
combines standard checks; it preserves failure exit codes.

Frontend tests cover startup, prescribed homepage content, sign-in navigation,
mobile toggle/Escape, login validation and visibility, unconfigured sign-in,
private route denial, role mismatch, sample clock-in/out, correction submission,
supervisor-only recommendations, HR decisions, directory search/filter/empty state,
distinct role navigation and error/loading states. SEO tests use temporary directories
and reserved example domains only; they verify a single public URL, no fake sitemap
without configuration, invalid origin rejection, and safe sample CSV output.

Backend tests exercise both health endpoints, sanitized IDs, CORS/hosts, errors that
do not leak submitted data, absent domain APIs, missing/invalid authentication,
verified identity without membership, explicit test-only membership injection,
cross-tenant denial, no implicit HR/auditor/owner inheritance, production docs
restriction and real asymmetric JWT signatures/expiry/audience/issuer/key rejection.
The test adapter is never used in the running application.

## Browser checks

Build, then `npm run test:browser`. Playwright starts a Vite dev server on 5173
and a production preview server on 4173; both use strict ports. CI installs trusted
Playwright Chromium. This cloud machine uses `/usr/bin/chromium` through
`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`. Browser processes/local test client sockets
can require the execution platform's command sandbox allowance.

Validate `/`, `/login`, and all three preview overview pages at **360, 390, 768,
1024 and 1440px**, asserting no page overflow or runtime errors and capturing
screenshots in ignored `frontend/test-results/`. Verify mobile workspace drawers,
keyboard/Escape focus restoration, review submission and CSV download. Axe checks
WCAG A/AA rules at 390 and 1440px and in an open correction modal. Automated checks
are not a certification; manually inspect screenshots and keyboard behavior too.

Production checks verify preview routes are 404 interfaces, login has no preview
shortcuts, bundle files contain no fixture identities or preview paths, and direct
private refreshes redirect to login. Cloudflare headers are prepared separately;
Vite preview does not emulate the Cloudflare edge header engine.

## Required before live data, not yet executed

Run the tenant/role suite in `supabase/policies/README.md` against isolated Supabase
with real JWTs. Add integration tests for actual memberships/revocation, private
Storage, scoped API queries, transactional punches/idempotency/concurrency and HR
decisions. Test overnight shifts and time-zone boundaries once policy is approved.
Validate Cloudflare headers/CSP/CORS and Cloud Run deployment/rollback after approval.
No zero-test suite, mocked-only database check or process PID establishes readiness.
