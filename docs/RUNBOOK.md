# Development and operations runbook

## Start locally

Use the existing checkout; no worktree is needed. In `frontend`, `npm ci` then
`npm run dev -- --host 0.0.0.0`. In `backend`, create `.venv`, install
`requirements.txt`, then `.venv/bin/python -m uvicorn app.main:app --no-access-log --host 0.0.0.0
--port 8000`. Live processes must restart after restoring a cloud snapshot.
Use separate terminals or save process IDs/logs outside the repository. Never
terminate unrelated processes to free ports.

`curl --fail http://127.0.0.1:8000/health` must return status ok. Vite must serve
HTML at `/`, `/login` and development sample routes. A production build deliberately
does not serve sample dashboards. Use `npm run build` and `npm run preview` to check.

## Common problems

| Symptom                     | Check/action                                                                                                                                                                                                 |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Package access fails        | Inspect configured proxy/CA and permitted registry hosts; preserve TLS verification. Never dump credentials. This managed command sandbox may require an approved external command execution for networking. |
| Preview routes not found    | They exist only under `npm run dev`, not production builds.                                                                                                                                                  |
| Sign-in unavailable         | Check public config names/presence, then backend auth configuration. Do not fabricate a session.                                                                                                             |
| Valid sign-in then 503      | Expected until trusted membership repository is implemented. No extra secret fixes missing code.                                                                                                             |
| JWT 401                     | Verify project issuer/audience, asymmetric algorithm, expiry, server clock and JWKS; never weaken signature checks.                                                                                          |
| API browser request blocked | Check exact CORS origin, frontend API origin and Cloudflare connect-src. CORS does not authenticate requests.                                                                                                |
| API 400                     | Check actual request hostname against `ALLOWED_HOSTS`.                                                                                                                                                       |
| Empty directory search      | Clear query/filter; do not replace an empty state with invented records.                                                                                                                                     |
| Sitemap missing             | Set the real `PUBLIC_SITE_URL` at build time, rebuild. Never insert a sample/localhost URL.                                                                                                                  |
| Port already in use         | Identify ownership; reuse only your own service or choose another documented port.                                                                                                                           |

## Incidents and maintenance (before live operation)

Record sanitized request IDs, timestamps, release revisions and affected operations.
Never paste Authorization headers, request bodies, passwords or private documents
into an issue. Rotate compromised credentials via platform settings, revoke affected
sessions and stop unauthorized access. Preserve audit history and evidence. Follow
approved incident ownership and notification policy once defined.

Dependency refreshes require lockfile review, lint/tests/build and browser checks;
do not run blind breaking upgrades. Backups, restore drills, audit retention, alert
thresholds, on-call ownership and data deletion policy remain organizational decisions.
