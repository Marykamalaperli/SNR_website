# Dashboard-managed accounts and information

After this release, everyday staff and workspace administration happens in SNR
NEST. Staff do not need to be created or edited in the Supabase dashboard first.
Cloudflare Pages Functions provides a small Auth administration gateway; Google
Cloud remains paused. FastAPI remains the planned business API, not a deployment
dependency for these account operations.

## One-time activation by the project owner

These are hosting/database setup steps, not a recurring staff workflow.

1. In the existing Supabase SQL Editor, run
   [202611070004_dashboard_accounts.sql](../supabase/migrations/202611070004_dashboard_accounts.sql)
   once. It requires migrations 0001–0003 already used by the live site. Keep all
   existing records; do not rerun old migrations or apply anything under tests.
2. In Supabase **Project Settings → API Keys**, obtain a server **secret key**
   (`sb_secret_…`) or the legacy **service_role** key. A dedicated named secret
   makes rotation easier. This is different from the existing public publishable key.
3. In Cloudflare **Workers & Pages → snr-nest → Settings → Variables and Secrets**
   (called Environment variables in some dashboards), select **Production** and
   add an encrypted **Secret** named **`SUPABASE_ADMIN_KEY`** with that value.
   Save it directly in Cloudflare. Never paste it into chat, source, a `VITE_*`
   variable, or a public GitHub variable. The existing public build settings remain.
4. After this code is on `main`, run GitHub **Actions → Deploy application → Run
   workflow → main → frontend**. The existing deployment includes the server
   functions automatically. A fresh deployment is needed after setting the binding.

The build generates an ignored server configuration file containing only the
existing public project URL/key. The administrative key is read only from the
Cloudflare runtime binding. It is never passed to Vite or generated into a bundle.
Without that binding, account administration fails closed; normal scoped profile
reads/edits do not acquire elevated access. Preview deployments have no privileged
binding unless deliberately configured separately.

## Add and manage people in the app

**Employees → Add employee → Create new account** asks for email, an initial
password, name, employee number, site, department, workspace role and account
access. It creates a confirmed Auth account and its profile/membership through the
server. Use 12–64 password characters; the Auth provider can enforce additional
password policies. Share the initial password securely with the person. The app
does not send invitations or store/re-display their password.

For an account that already exists without a profile, choose **Link existing
account**. It can confirm an existing unconfirmed account in this same workflow.
Leave the new password blank to retain the current one or set a replacement.
Protected roles, existing profiles, revoked assignments and cross-organization
accounts cannot be silently reclaimed or promoted.

For an existing row:

- **Edit profile:** name, employee number, site, department, Employee/Supervisor
  role, and active/inactive workspace access. Inactive preserves the profile and
  denies organization data on the next request. No history is deleted.
- **Manage account:** sign-in email and an optional new password, keeping the
  same identity/profile/history. A blank password preserves the existing one.

HR cannot assign HR/auditor/owner roles or reset protected-role accounts through
staff controls. The supervisor's supported scope remains one department/site;
existing multi-assignment changes are deliberately blocked for review.

## Workspace and personal settings

**Settings → Edit workspace** updates the organization name, default IANA time
zone and the signed-in HR administrator's display name. Existing sites/shifts
retain their time zones. Saves check the organization version, append an audit
event and refresh the verified session; the display name grants no authority.

**Settings → Change my login details** updates the signed-in administrator's own
email/password using their ordinary Auth session, without an administrative key.
An email change may need confirmation in the current/new inboxes according to
Supabase's email settings. The UI reports it as pending until confirmed. This is
an email verification step; no Supabase dashboard edit is required.

Changing credentials follows Supabase's session expiry/revocation behavior; this
release does not promise immediate invalidation of every existing access token.
Use inactive workspace access when organization data must be denied immediately.
Account deletion, invitations, bulk import and other privileged-role management
are outside this release. Attendance/corrections/documents remain separate work.

## Interrupted requests

An immediate “request was interrupted” error in the initial account-management
release came from an unsupported Cloudflare request option, before any account
was created. The corrected release fixes that connection. Deploy the latest `main`
using the existing frontend workflow, then reload the app. This fix needs no SQL
migration or key change. All routine staff actions continue in the dashboard.

An account request has a UUID and a private database intent before Auth is called.
It stores safe profile fields and an opaque keyed HMAC fingerprint, never a
password or admin key. GoTrue's server-only `app_metadata` identifies the operation
that actually changed the account. User-editable metadata cannot complete a request.

The form offers **Check account setup/request** after an interruption. Closing the
form preserves the request under **Pending account requests** in the directory.
**Check request** can finish a confirmed account/profile without repeating its
credential write. If no Auth change is confirmed after the 90-second processing
window, the request ends and a new attempt is possible. **Refresh status** updates
the list. **Close request** becomes available after that window and never deletes
an account or undoes credentials already saved; review the directory afterward.

Auth and application tables cannot share a single transaction. The durable intent,
server-only operation marker, duplicate protections and recovery UI handle this
boundary explicitly. Profile edits and relationship/privileged-role changes are
held while an account operation is pending; membership deactivation remains
available. Requests with completed IDs return their result without replaying a
password/email update. Each action has append-only audit records. HR has no audit
reading inheritance. New account operations are limited to 12 per actor/org/minute.

## Implementation and checks

- Same-origin server routes: `POST /api/admin/staff`, `PATCH
/api/admin/staff/{profile_id}/account`, and `POST
/api/admin/staff/operations/{request_id}/recover`.
- The server verifies the caller with Supabase Auth, then database-derived HR
  membership and target scope before using an admin key. Browser-selected actor,
  tenant and Auth role are never trusted. Only Employee/Supervisor profiles are
  managed here. The application does not log request bodies, authorization headers or credentials.
- SQL guards recheck active scope, stale versions and pending requests. Private
  operation tables/helpers are inaccessible directly to browser roles. Auth data
  is changed only through GoTrue APIs, not direct SQL inserts.
- Production browser builds exclude server source, generated configuration and
  all private bindings. `_routes.json` invokes Functions only for `/api/admin/*`;
  the rest of the site remains static.
- `npm run test:server` covers permission failures, redaction, replay, recovery,
  linking, snapshots and an actual local HTTP handler. PostgreSQL tests emulate
  GoTrue writes only in local fixtures and check real SQL permissions/triggers.
  Browser tests use intercepted HTTP contracts. Live account creation/login must
  still be tested after the owner activates the server binding and migration.
