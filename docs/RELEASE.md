# Release the application

The application foundation is pushed to GitHub. `.github/workflows/deploy.yml` is
a manual release pipeline for Cloudflare Pages and Cloud Run. A live release still
requires configured hosting access; no public deployment URL has been created.
See `DEPLOYMENT.md` for architecture, security headers and rollback guidance.

## First frontend release

Open repository **Settings → Secrets and variables → Actions**. Configure:

| Kind              | Name                       | Value to supply securely                                            |
| ----------------- | -------------------------- | ------------------------------------------------------------------- |
| Secret            | `CLOUDFLARE_API_TOKEN`     | Account-scoped token with Cloudflare Pages Edit permission          |
| Variable          | `CLOUDFLARE_ACCOUNT_ID`    | Selected account's 32-character ID                                  |
| Optional variable | `CLOUDFLARE_PAGES_PROJECT` | Defaults to `snr-nest`; choose another name if needed               |
| Optional variable | `PUBLIC_SITE_URL`          | Actual HTTPS custom domain already registered on that Pages project |

Open **Actions → Deploy application → Run workflow**, select `main` and `frontend`.
The workflow installs dependencies, runs checks/tests, verifies production route
protection, creates the selected Pages project only after an authenticated 404,
and derives its canonical URL from Cloudflare's actual response. Existing projects
must use `main` for production; other branches are not silently changed. Unknown
custom domains are rejected. Without a custom domain, the verified Pages hostname
is used, with a generated sitemap. After publishing it verifies the public page and
sitemap. A successful job records its URL in GitHub's `production-frontend` environment.

No deployment runs automatically on push or pull requests. Releases use only `main`
and are serialized. GitHub environment protection rules can require review. Pages
DNS setup and API-token creation remain account-owner tasks. Never paste secrets
into source, issues or chat. Do not represent an unexecuted workflow as a deployment.

## Cloud Run prerequisites

First deploy the public site and set `PUBLIC_SITE_URL` to its verified HTTPS origin.
Have the Google Cloud administrator select the project/region, enable Cloud Run,
Cloud Build and Artifact Registry APIs, create an approved Docker Artifact Registry
repository, and configure GitHub OIDC Workload Identity Federation. No long-lived
service-account key is required. Restrict the provider to
`Marykamalaperli/SNR_website` on `refs/heads/main`, not arbitrary repositories/forks.

Set these repository or `production-backend` environment variables:

| Variable                         | Required metadata                                       |
| -------------------------------- | ------------------------------------------------------- |
| `GCP_PROJECT_ID`                 | Approved Google project ID                              |
| `GCP_REGION`                     | Approved Cloud Run/Artifact Registry/Cloud Build region |
| `GCP_ARTIFACT_REPOSITORY`        | Existing Docker repository in that region               |
| `GCP_SERVICE`                    | Optional; defaults to `snr-nest-api`                    |
| `GCP_WORKLOAD_IDENTITY_PROVIDER` | Full workload identity provider resource name           |
| `GCP_DEPLOY_SERVICE_ACCOUNT`     | GitHub-federated deployer service-account email         |
| `GCP_BUILD_SERVICE_ACCOUNT`      | Build service-account email                             |
| `GCP_RUNTIME_SERVICE_ACCOUNT`    | Least-privilege API runtime service-account email       |
| `PUBLIC_SITE_URL`                | Actual public frontend HTTPS origin for CORS            |

The deployer needs scoped permissions to submit builds/upload build sources, read
Artifact Registry, deploy/configure the chosen Cloud Run service and its public
invocation policy, and act as the selected build/runtime accounts. The build account
needs source-read, repository-write and Cloud Logging write permissions. The runtime
needs no broad Google Cloud permissions for the health/session foundation. Have an
administrator review exact IAM bindings. This workflow does not enable billing/APIs
or grant itself IAM roles. Cloud Build may require an approved source staging bucket.
Do not substitute project-owner credentials for scoped IAM.

## Deploy the backend, then connect the frontend

Choose `backend` in the manual workflow. It tests the API, uploads only allowlisted
backend inputs, builds with Cloud Build, resolves the Artifact Registry digest,
deploys that immutable digest and verifies JSON health. It refuses to replace an
existing service without `app=snr-nest`. It manages `APP_ENV`, `CORS_ORIGINS` and
`ALLOWED_HOSTS`, preserving unrelated environment and secret bindings. A first
revision uses TCP startup and rejects unknown HTTP hosts; a second installs the
actual generated Cloud Run hostname. Custom API domains need an explicit extension.
The successful job records the verified URL in `production-backend`.

Set frontend variable `VITE_API_BASE_URL` to that URL and redeploy `frontend`, or
choose `both` once all prerequisites are configured. `both` deploys backend first
and passes its URL to the frontend build. Supabase public variables remain optional
until the real membership adapter is implemented. This release does not expose
sample dashboards or claim private authentication works.

## Direct deployment from the managed task

Alternatively, configure Cloudflare access securely in environment settings and
connect an approved Google Cloud identity/project. The task has no authenticated
Cloudflare account (`wrangler whoami` confirmed this) and its identity manifest has
no Google connections. The saved environment draft lists Cloudflare access and
account/project/region requirements. Environment settings and GitHub Actions
settings are separate; tokens are never copied between them.

The current network policy also blocks `api.github.com`; the draft requests that
host so CI/deployment status can be inspected. Native Git push is verified and does
not require a replacement token. Saving a draft does not apply or publish it.
