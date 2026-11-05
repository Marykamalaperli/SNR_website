# Google Cloud setup for SNR NEST

Selected project ID: `snr-nest`. Frontend URL reported by the owner:
`https://snr-nest.pages.dev`. The proposed backend region is `asia-south1` (Mumbai).
The backend is not deployed yet. This managed task has no connected Google identity;
the commands below run in your authenticated Google Cloud Shell instead.

## Run the one-time setup

Open [Google Cloud Console](https://console.cloud.google.com/home/dashboard?project=snr-nest),
select `snr-nest`, and click **Activate Cloud Shell** (the terminal icon). Authorize
Cloud Shell with the Google account that administers this project when prompted.
Paste these commands:

```sh
git clone --branch main https://github.com/Marykamalaperli/SNR_website.git
cd SNR_website
python3 scripts/bootstrap_gcp.py --project snr-nest --region asia-south1 --site-url https://snr-nest.pages.dev
```

If this checkout already exists in Cloud Shell, use `cd SNR_website` and
`git pull --ff-only` instead of cloning again. A private GitHub repository requires
your own authenticated GitHub access; no password or token belongs in this document.

The setup checks project access and billing before any change. If billing is disabled,
open **Billing**, link an account, then rerun. Cloud resources can incur charges;
configure a budget alert in the selected Google project. To inspect scope offline
before running setup, add `--plan` to the same Python command.

The script prepares:

- Cloud Run, Cloud Build, Artifact Registry and identity APIs in the selected project.
- Three distinct service accounts: deployer, builder and runtime.
- A Docker Artifact Registry repository named `snr-nest` in Mumbai.
- A private source-staging bucket with uniform access and public access prevention.
- A dedicated GitHub workload identity pool/provider, limited to
  `Marykamalaperli/SNR_website` on `refs/heads/main`.
- Required deployment/build IAM bindings. No Owner/Editor grant or service-account
  private key is created. Storage Admin is confined to the dedicated build-source
  bucket; the runtime receives no project-level role.

It uses explicit project flags, preserves unrelated resources, rejects conflicting
identity/trust/privacy settings, and can be rerun. It does not configure payment
details, apply database migrations, access Supabase, or deploy the API itself.
An organization policy or lack of administrative IAM/API permissions can block setup;
the Google CLI reports the specific error rather than weakening those policies.

## Copy public deployment variables to GitHub

On success, setup creates `.local/gcp-github-variables.env`, an ignored file containing
only project IDs, service-account emails, provider names and the frontend origin.
It contains no credentials. Existing different output files are preserved; choose
another `--output` path if you intentionally configure another project/region.

If GitHub CLI is available in Cloud Shell, sign in to your own GitHub account and
upload these variables:

```sh
gh auth login --hostname github.com --git-protocol https --web
gh variable set --repo Marykamalaperli/SNR_website --env-file .local/gcp-github-variables.env
```

If you are already signed in, skip the login command. Alternatively, copy the named
values into repository **Settings → Secrets and variables → Actions → Variables**.
These Google variables are metadata; Google authentication uses short-lived GitHub
OIDC tokens, not a JSON private key.

The generated file contains `GCP_PROJECT_ID`, `GCP_REGION`,
`GCP_ARTIFACT_REPOSITORY`, `GCP_SERVICE`, `GCP_BUILD_SOURCE_BUCKET`,
`GCP_DEPLOY_SERVICE_ACCOUNT`, `GCP_BUILD_SERVICE_ACCOUNT`,
`GCP_RUNTIME_SERVICE_ACCOUNT`, `GCP_WORKLOAD_IDENTITY_PROVIDER`, and `PUBLIC_SITE_URL`.
Keep the existing Cloudflare secret/account settings unchanged.

## Deploy and verify

Open GitHub **Actions → Deploy application → Run workflow**, choose branch `main`
and target `both`. Or, after authenticating GitHub CLI, run:

```sh
gh workflow run deploy.yml --repo Marykamalaperli/SNR_website --ref main --field target=both
```

The workflow tests/builds/deploys the API first, verifies `/health`, then rebuilds
and publishes the frontend with the actual API URL. If IAM changes have not propagated
yet, wait for propagation and retry after checking the reported error. Do not broaden
roles blindly. Follow subsequent errors as actual evidence; a script unit test does
not establish that Google accepts the configuration.

A successful deployment still exposes only the backend foundation. Real login,
employee records, attendance and corrections remain pending Supabase and trusted
membership/business-service integration. No live Google or Supabase validation has
been claimed. See [RELEASE.md](RELEASE.md) for the full workflow and IAM boundaries.
