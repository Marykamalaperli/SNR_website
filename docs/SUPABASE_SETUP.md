# Connect your Supabase project

> **Superseded implementation history.** Supabase is not the target identity,
> database or storage platform. Do not create or connect a project for the target.

The previous Supabase project belonged to a friend and is not an authorized
destination. This repository no longer configures that project. Create a new
Supabase project in your own organization before enabling real sign-in or private
data. Google Cloud is paused; the frontend can use Supabase Auth and the
RLS-protected `current_workspace()` RPC without Cloud Run.

The project URL and publishable key are public client configuration. Never share
or place a database password, service-role/secret key, Auth password, or access
token in chat or in a `VITE_*` setting.

## 1. Create your project

In the Supabase dashboard, create a project under an organization you own or
control. Choose the region and retention/backup settings appropriate for your
staff data. Save the database password in a password manager; it is not needed
by the frontend or current FastAPI session adapter.

From the new project's **Connect** or **API Keys** page, note:

- Project URL (`https://<your-project-ref>.supabase.co`).
- Publishable key (starts with `sb_publishable_`).

Do not use the former project's URL or key. Do not select or expose a secret or
service-role key as the publishable key.

## 2. Apply this repository's schema

In the new project's **SQL Editor**, run the migration files below one at a time,
in order, using the full file contents from this repository:

1. [Foundation](../supabase/migrations/202611050001_foundation.sql)
2. [Authentication session](../supabase/migrations/202611050002_auth_session.sql)
3. [Workforce directory](../supabase/migrations/202611070003_workforce_directory.sql)
4. [Dashboard accounts](../supabase/migrations/202611070004_dashboard_accounts.sql)
5. [Attendance](../supabase/migrations/202611070005_attendance.sql)
6. [Attendance locations](../supabase/migrations/202611070006_attendance_locations.sql)
7. [Store attendance areas](../supabase/migrations/202611080007_store_attendance_areas.sql)

Stop and review any SQL error before continuing. These are migrations, not reset
scripts; never rerun them blindly on an existing database. Never apply files under
`supabase/tests/` to a live project. No live migration has been run by this
assistant. Migration 0006 stores precise punch locations for new events; it must
only be activated when the approved staff notice/consent and retention policy is
in place. If that policy is not ready, defer 0006 and 0007 and do not release
location-dependent punches.

The foundation creates the tenant/role tables and denies all browser writes. The
second migration adds `current_workspace()`, callable only by authenticated users.
It takes no role, user ID or organization from the browser. It reads the caller's
active database assignment under RLS and returns their workspace metadata. No active
assignment is denied; multiple assignments are denied until explicit organization
selection is implemented. Auditor and owner remain distinct from HR.

## 3. Create your account and assign its workspace

In Supabase **Authentication → Users**, choose **Add user → Create user**. Enter your
own email and a strong password in Supabase, not in chat. For this owner-controlled
initial account, use the email-confirmation option so the account is confirmed.
The app currently supports email/password sign-in; invite, OAuth and password-reset
callback pages are not implemented yet.

For a new, empty organization database, open
[first-administrator.sql](../supabase/setup/first-administrator.sql), change only
`REPLACE_WITH_YOUR_CONFIRMED_EMAIL` in the `administrator_email` declaration to your
account's email, and run it in SQL Editor as the project owner. This explicitly creates the SNR NEST
organization and assigns that selected account the `hr` workspace. It does not
promote the first person who signs up or grant auditor/system-owner privileges.

For additional staff, use **Employees → Add employee** after the one-time account
server activation. New credentials, existing-account confirmation/linking, profiles
and assignments are managed inside the application. The owner-only SQL helpers
remain bootstrap/recovery tools, not the regular staff workflow. Roles are never
self-assigned and supervisor scope remains an explicit department/site.

No SMTP/password/email secrets are needed in frontend variables. Do not enable
unsupported email-link/OAuth flows in the UI.

## 4. Configure the frontend

Copy `frontend/.env.example` to `frontend/.env.local` and set:

```dotenv
VITE_SUPABASE_URL=https://<your-project-ref>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_<your-public-key>
VITE_AUTH_SESSION_SOURCE=supabase
```

Keep the file local and ignored by Git. These values are public, but should still
only point to your own project.

Open repository **Settings → Secrets and variables → Actions → Variables** and add:

| Name                            | Value                                       |
| ------------------------------- | ------------------------------------------- |
| `VITE_SUPABASE_URL`             | Your new project's HTTPS URL                |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Your new project's `sb_publishable_...` key |
| `VITE_AUTH_SESSION_SOURCE`      | `supabase`                                  |

Use repository **Variables** for these public frontend values. Keep the existing
Cloudflare API token in **Secrets**. Service-role/secret keys and database passwords
must never be supplied as Vite values; build validation rejects service-role keys.

Real passwords, access/refresh tokens and elevated keys must not be written to
source or saved setup instructions. For optional future FastAPI mode,
set `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` on the API, derive its issuer/JWKS,
deploy it, and choose `VITE_AUTH_SESSION_SOURCE=api` with an HTTPS API base URL.

## 5. Configure the production Auth URL and gateway

In Supabase **Authentication → URL Configuration**, set the Site URL to the
actual frontend origin you control and add only its approved redirect URLs. Disable
public sign-ups for this staff-only application.

If deploying the dashboard account gateway, complete the one-time setup in
[Admin dashboard setup](ADMIN_DASHBOARD_SETUP.md), including the server-only
Cloudflare secret binding. Never expose that key to Vite or the browser.

## 6. Publish the frontend and sign in

Open **Actions → Deploy application → Run workflow**, select `main` and **frontend**.
Google Cloud is not needed for this release. After it succeeds, open
your controlled frontend's `/login` page and use the account you created in your
new Supabase project.

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

This activates authentication and workspace authorization for your new project.
Feature availability still depends on the migrations and server bindings above;
no preview mutation becomes a real business transaction.

## Moving authorized data from the previous project

The previous project's organization owner must provide an authorized export; this
assistant cannot access or export it. Keep the export in a private, access-controlled
location and do not upload employee records, attendance, SQL dumps or credentials
to chat or commit them to the repository.

The requested migration scope is organization/sites/departments, employee profiles,
shifts/assignments and attendance history. Supabase Auth accounts are **not** copied
as ordinary application rows: re-create or re-invite staff in the new project first,
then map each old Auth user ID to the corresponding new account before importing
membership/profile data. Do not import old membership IDs or assume identity IDs
match. Preserve attendance and audit history append-only; do not rewrite event times
or discard foreign-key relationships. There is no generic data-import command in
this repository, so review an export-specific mapping/import procedure against the
schema and take backups before any import.

Exclude precise attendance GPS coordinates while the transfer/retention policy is
unknown. Migration 0006 data includes sensitive coordinates and notice versions;
transfer it only after policy and authorization explicitly cover that data. Keep
the requested categories limited to the approved set; “other” data is not included.
Do not remove or alter any data in the friend's project.

## Troubleshooting and validation

- “No active workspace assignment”: create/confirm the Auth user and run the
  explicit administrator assignment query. An Auth account alone grants no access.
- “More than one workspace”: resolve active organization assignments administratively;
  the application deliberately does not choose a tenant arbitrarily.
- “Workspace could not be opened”: check the RPC migration exists, email/password
  auth is enabled, and the configured publishable key belongs to your project.
- “Sign-in isn’t available yet”: both public frontend variables must be set, followed
  by a new frontend deployment. Changing variables does not rebuild an existing site.
- A service-role/secret-key build error must be fixed by using the publishable key;
  do not disable that validation.

Local checks include actual PostgreSQL migrations/RLS tests in a disposable container,
backend JWT/RPC contracts, provider/session tests, and real browser SDK requests against
intercepted Auth responses. These are not a live Supabase sign-in test. The owner must
apply the migrations, provision the account and test the actual project after release.
