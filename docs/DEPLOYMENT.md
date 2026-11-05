# Deployment preparation

The executable, manual release workflow is documented in [RELEASE.md](RELEASE.md).
It supports Cloudflare Pages and Cloud Run once hosting access is configured.

The owner reports the frontend live at `https://snr-nest.pages.dev`. Google backend
provisioning and deployment remain pending. The current foundation supports public UI review;
private business workflows and membership authorization remain incomplete.

## Cloudflare Pages

1. Connect this repository to a Pages project after approval. Choose `frontend` as
   root directory, Node 24, build command `npm ci && npm run build`, output `dist`
   (repository-relative output: `frontend/dist`). `infra/cloudflare/wrangler.toml`
   describes the equivalent output location for a future CLI release.
2. Set public `VITE_API_BASE_URL` to the actual HTTPS API origin. Configure
   `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` only for the selected
   project. Never put server secrets in frontend build settings.
3. Set `PUBLIC_SITE_URL` to the actual HTTPS canonical origin. Without it, no sitemap
   or canonical is emitted. Generator accepts no path, port, credentials or loopback.
   Only `/` is indexable. Login, private workspaces and previews are excluded.
4. Review `public/_headers`: replace the Supabase/Cloud Run connect-src wildcard
   hosts with the exact real API/Auth origins when known. Custom domains need an
   explicit CSP entry. Self-hosted fonts need no third-party font destination.
5. `_redirects` sends unknown client routes to the SPA; production JS handles them
   with a noindex not-found interface. Private routes require sign-in, never fixtures.
   Edge headers add noindex/no-store for private paths; robots is not access control.
6. Configure non-production Pages branch previews as `noindex` for **all paths**
   using a branch-specific header artifact or platform access policy. Dev workspace
   routes are absent even in branch builds. Do not set a branch URL as canonical.

After release, validate asset caching, `/login` and `/hr/approvals` refresh behavior,
HTTP security/noindex headers, CSP enforcement, configured sitemap XML and absence
of development fixtures. Test sign-in only after the membership adapter is complete.
No manifest/service worker exists because a PWA is not enabled.

## Cloud Run

Build from the repository root with `infra/cloud-run/Dockerfile`. The container runs
as a non-root user, binds the injected `PORT` (8080 default), and contains backend
runtime dependencies only. The Dockerfile has been built and its production health,
authentication denial, non-root user and absence of test/lint packages were verified
locally. This does not establish a live Cloud Run deployment.

Use managed deployment settings for:

| Variable                | Production setting                                                 |
| ----------------------- | ------------------------------------------------------------------ |
| `APP_ENV`               | `production`                                                       |
| `CORS_ORIGINS`          | JSON list of exact HTTPS frontend origins                          |
| `ALLOWED_HOSTS`         | JSON list of actual API hostnames, never `*`                       |
| `SUPABASE_URL`          | Selected project's HTTPS URL                                       |
| `SUPABASE_JWT_ISSUER`   | Selected project's Auth issuer, normally project URL + `/auth/v1`  |
| `SUPABASE_JWT_AUDIENCE` | `authenticated`, unless approved project policy differs            |
| `SUPABASE_JWKS_URL`     | Project URL + `/auth/v1/.well-known/jwks.json` for asymmetric keys |

The current application requires no DB password or service role. Add only the
credentials a future reviewed adapter needs, via Secret Manager and least-privilege
runtime identity, never image layers, frontend variables or committed YAML.
Projects using legacy symmetric signing keys need migration to asymmetric JWTs;
this API does not accept HS256 or a user-supplied key endpoint.

Set a startup/liveness **TCP** probe on the configured port, or an HTTP `/health`
probe whose `Host` header is in `ALLOWED_HOSTS`. `/health` checks process liveness,
not database readiness. Set bounded request timeouts/concurrency and abuse controls;
autoscaling is not rate limiting. API docs are disabled in production. Public HTTPS
invocation may be needed for browser Bearer authentication; protect every private
route inside the API. Do not confuse Cloud Run IAM with application authorization.

When deployment is approved, build/push an image to an approved Artifact Registry
and deploy that immutable image revision using the selected Google project/region
and approved runtime identity. No project IDs, registry paths or production domains
have been invented in this repository.

## Release and rollback

Run CI and browser checks; review tenant RLS and privacy policies before live data.
Use a staging Supabase project first. Review migrations separately, take backups
and test restore; startup does not apply SQL. Record frontend deployment and API
revision together. Validate HTTPS, health, auth denial, allowed-origin requests,
role isolation and critical workflows. Roll back Pages and Cloud Run to known-good
versions if necessary. Database rollback is a separately reviewed forward-fix/restore
operation; never delete attendance/audit history to roll back application code.
