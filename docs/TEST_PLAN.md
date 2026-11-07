# Test plan

The account gateway also needs its real hosting runtime, since Node's Fetch API
accepts options that Workers rejects. From `frontend`, run:

```sh
npm exec --yes --package=wrangler@4.158.0 -- node scripts/test-worker-runtime.mjs
```

This checks authenticated account/profile creation and refuses redirects during
identity verification and administrative Auth writes, with both old/current
compatibility dates. All outbound services and credentials are synthetic. The
check runs in CI and before the production frontend deployment; it does not
replace real project-owner acceptance testing after a release.

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

## Supabase authentication checks

`npm run test` additionally tests project/key validation, prohibition/redaction of
service-role keys, tab storage/fallback, Auth-server user verification, RPC errors,
identity mismatch, role separation, API transport selection, sign-in/restore/refresh
and logout races. The Playwright `authentication` project runs the real Supabase JS
SDK against intercepted HTTP responses on an isolated Vite fixture server at port 5174. It verifies login, reload persistence, database-assigned roles, logout, revoked
membership, wrong-password denial and the authenticated page's accessibility. These
are contract tests, not a live Supabase account test.

Run `bash scripts/test-supabase.sh` for an actual disposable PostgreSQL database.
It applies all migrations, exercises owner-only provisioning helpers and nine
authorization scenarios as anon/authenticated roles. The test-only Auth schema
emulates PostgREST's trusted user-ID context; it does not test GoTrue or JWT signature
verification. The container is private, accepts no live DB URL, and is removed after
the run. Fixtures under `supabase/tests/` must never be applied to a real project.
CI has a separate database job; standard frontend/API checks remain in place.

## Workforce setup and directory

Service tests verify allowed RPC inputs, snapshot versions, sanitized errors and
absence of client identity/tenant authority. Component tests exercise search and
pagination reset, denied saves without lost form input, role-specific controls,
missing setup, in-flight dialogs and stale loader cancellation. The `workforce`
Playwright project uses the real SDK with intercepted HTTP to cover HR setup,
profile creation/editing, access filters, persistence, supervisor/employee screens,
missing migrations and desktop/mobile accessibility (including modal forms).

The additional actual PostgreSQL suite covers HR transactions and audit rollback,
unconfirmed/missing/protected/cross-tenant accounts, direct-write/helper denial,
normalized duplicates, IANA/overnight schedule validation, version conflicts,
external access changes, self/team projections, bounded literal search/pagination,
assigned-shift protection, supervisor reassignment and revoked/ambiguous users.
Live Supabase/PostgREST and owner-account checks remain activation steps.

## Dashboard account administration

Run `npm run test:server` for real Web Request/Response handler and local HTTP
checks with intercepted upstream contracts: role/tenant/identity denial, protected
snapshots, input/origin/size limits, credential redaction, no privileged database
queries, linking/confirmation, replay and lost-response recovery. PostgreSQL
checks actual private-ledger ACLs, operation markers, pending profile/member/role
guards, version reservations, own settings and stale/revoked/cross-tenant calls.
GoTrue writes are emulated only in local SQL fixtures; no Auth schema is edited in
production. Browser tests cover in-app creation, email/password management,
recovery after closing a form, organization/own settings and mobile accessibility.
CI also compiles the real Worker. Live account creation/login needs one-time owner
activation; mocked HTTP and local SQL are not a live-provider integration result.
