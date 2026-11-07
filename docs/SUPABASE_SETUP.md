# Connect Supabase authentication

The owner has since confirmed working sign-in. For the organization setup and
employee directory release, follow [workforce activation](WORKFORCE_SETUP.md).
The steps below document the original authentication setup.

Google Cloud setup is paused. The public frontend can authenticate directly with
Supabase Auth and use a read-only Postgres RPC under RLS for server-confirmed workspace
assignments. FastAPI remains available for later business APIs and optional API-based
session verification; it is not needed to host this sign-in flow.

Selected project: <https://emvppphhkmbpgqduikup.supabase.co>.
Frontend: <https://snr-nest.pages.dev>.
The supplied publishable key is saved only in ignored local configuration. No secret
or service-role key is required. Live project access could not be independently
checked because this environment's proxy blocks that hostname.

## 1. Prepare the database

Open the [selected Supabase project](https://supabase.com/dashboard/project/emvppphhkmbpgqduikup),
then **SQL Editor → New query**. For a new project, run these files in order:

1. [Foundation migration](../supabase/migrations/202611050001_foundation.sql).
2. [Authentication session migration](../supabase/migrations/202611050002_auth_session.sql).

Open each file on GitHub, copy its raw contents, paste into a new SQL Editor query,
and click **Run**. These are additive CREATE statements, not reset scripts. If the
schema already exists, review which migrations were applied; do not drop user data
or rerun the foundation blindly. No live migration has been executed by this agent.
Never apply files under `supabase/tests/` to a real project.

The foundation creates the tenant/role tables and denies all browser writes. The
second migration adds `current_workspace()`, callable only by authenticated users.
It takes no role, user ID or organization from the browser. It reads the caller's
active database assignment under RLS and returns their workspace metadata. No active
assignment is denied; multiple assignments are denied until explicit organization
selection is implemented. Auditor and owner remain distinct from HR.

## 2. Create your account and assign its workspace

In Supabase **Authentication → Users**, choose **Add user → Create user**. Enter your
own email and a strong password in Supabase, not in chat. For this owner-controlled
initial account, use the email-confirmation option so the account is confirmed.
The app currently supports email/password sign-in; invite, OAuth and password-reset
callback pages are not implemented yet.

For an empty organization database, open
[first-administrator.sql](../supabase/setup/first-administrator.sql), change only
`REPLACE_WITH_YOUR_CONFIRMED_EMAIL` in the `administrator_email` declaration to your
account's email, and run it in SQL Editor as the project owner. This explicitly creates the SNR NEST
organization and assigns that selected account the `hr` workspace. It does not
promote the first person who signs up or grant auditor/system-owner privileges.

For additional people, use
[assign-workspace.sql](../supabase/setup/assign-workspace.sql). Set the organization
UUID from the `organizations` table, a confirmed Auth email and one exact role.
The helper preserves existing memberships; role changes/reactivation need an explicit
administrator review. Supervisors also need appropriate department/site assignments
before they can read team records. No self-service role selection exists.

In Authentication settings, disable public sign-ups for this staff-only application.
In **URL Configuration**, set Site URL to `https://snr-nest.pages.dev` and use only
approved application redirect URLs. No SMTP/password/email secrets are needed in
frontend variables. Do not enable unsupported email-link/OAuth flows in the UI.

## 3. Set GitHub Actions variables

Open repository **Settings → Secrets and variables → Actions → Variables** and add:

| Name                            | Value                                                        |
| ------------------------------- | ------------------------------------------------------------ |
| `VITE_SUPABASE_URL`             | `https://emvppphhkmbpgqduikup.supabase.co`                   |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | The publishable key you supplied, starting `sb_publishable_` |
| `VITE_AUTH_SESSION_SOURCE`      | `supabase`                                                   |

Use repository **Variables** for these public frontend values. Keep the existing
Cloudflare API token in **Secrets**. Service-role/secret keys and database passwords
must never be supplied as Vite values; build validation rejects service-role keys.

The local frontend already has the supplied public project configuration in ignored
`frontend/.env.local`. Real passwords, access/refresh tokens and elevated keys are
not written to source or saved setup instructions. For optional future FastAPI mode,
set `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` on the API, derive its issuer/JWKS,
deploy it, and choose `VITE_AUTH_SESSION_SOURCE=api` with an HTTPS API base URL.

## 4. Publish the frontend and sign in

Open **Actions → Deploy application → Run workflow**, select `main` and **frontend**.
Google Cloud is not needed for this release. After it succeeds, open
`https://snr-nest.pages.dev/login` and use the account you created in Supabase.

Supabase verifies email/password and user identity. The database confirms the
application role; the browser never uses `user_metadata.role` to grant access.
An assigned HR account opens `/hr`, a supervisor `/team`, and an employee `/me`.
The account page displays real verified identity/organization details and honest
empty states. Synthetic preview data remains development-only.

Sessions persist across reloads in the same tab using `sessionStorage`; they are not
stored in `localStorage`. Closing the tab ends local persistence. Sign-out clears
local credentials even on a network error. Token refresh rechecks membership, and
RLS checks active assignments on data requests. Ordinary JWT expiry/revocation
behavior still follows the Supabase project configuration.

This activates authentication and workspace authorization only. Operational
attendance, employee administration, corrections and private file workflows remain
unimplemented; no preview mutation becomes a real business transaction.

## Troubleshooting and validation

- “No active workspace assignment”: create/confirm the Auth user and run the
  explicit administrator assignment query. An Auth account alone grants no access.
- “More than one workspace”: resolve active organization assignments administratively;
  the application deliberately does not choose a tenant arbitrarily.
- “Workspace could not be opened”: check the RPC migration exists, email/password
  auth is enabled, and the configured publishable key belongs to this project.
- “Sign-in isn’t available yet”: both public frontend variables must be set, followed
  by a new frontend deployment. Changing variables does not rebuild an existing site.
- A service-role/secret-key build error must be fixed by using the publishable key;
  do not disable that validation.

Local checks include actual PostgreSQL migrations/RLS tests in a disposable container,
backend JWT/RPC contracts, provider/session tests, and real browser SDK requests against
intercepted Auth responses. These are not a live Supabase sign-in test. The owner must
apply the migrations, provision the account and test the actual project after release.
