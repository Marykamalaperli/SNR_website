# API contracts

Base prefix: `/api/v1`. Request/response JSON; times are ISO 8601 with offsets/UTC.
The API never returns synthetic workforce records.

## Implemented

| Method/path           | Authentication      | Behavior                                                       |
| --------------------- | ------------------- | -------------------------------------------------------------- |
| `GET /health`         | Public              | Process liveness: `{"status":"ok","service":"snr-nest-api"}`   |
| `GET /api/v1/health`  | Public              | Same status/service plus `"version":"1"`                       |
| `GET /api/v1/session` | Verified Bearer JWT | Trusted membership interface; **503 until adapter configured** |

The optional API session adapter is implemented and must be configured with the
Supabase project origin and publishable key. Its response model contains
`user_id`, `organization_id`, exact `role`, optional `employee_id`, `team_ids` and
`site_ids`. Roles: `employee`, `supervisor`, `hr`, `security_auditor`, `system_owner`.
The browser maps only the first three to workspaces. Missing token → 401; configured
but invalid token → 401; auth/JWKS unavailable → 503; verified identity without a
membership adapter → 503; no active assignment → 403; multiple organizations → 409.
A token is never itself workspace authorization.

The default frontend source is Supabase `rpc('current_workspace', {})`, with the
same response plus optional `organization_name` and `display_name`. The function is
SECURITY INVOKER, authenticated-only, read-only and protected by existing RLS. Supabase
Auth/PostgREST verifies the token server-side; role/user/org inputs are not accepted.
This supports authentication while Cloud Run is paused. Optional API mode still
performs its own JWT verification and never trusts client-selected roles.

## Supabase workforce RPCs

Implemented in migration `202611070003_workforce_directory.sql`, activated separately
from the frontend. They receive the caller JWT through the existing SDK. No
organization/actor/audit ID is accepted as authority. Fixed-search-path definer
functions check single-membership, exact role and scope. These are not new
FastAPI `/api/v1` endpoints.

| RPC                                                                                                                                        | Scope / inputs / result                                                                                                                                                                                                |
| ------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `hr_organization_setup()`                                                                                                                  | HR; own organization, sites/departments/shifts and real staff counts                                                                                                                                                   |
| `workforce_directory(p_search='',p_site_id=null,p_department_id=null,p_status='active',p_page=1)`                                          | Self/team/HR projection; literal name/number search ≤80 characters, status active/inactive/all, page 1–10000; `{rows,total,page,page_size:20}`. Email and membership version are HR-only; `is_self` marks own profile. |
| `hr_save_site(p_id,p_version,p_name,p_timezone)`                                                                                           | HR; null ID/version creates, matching version updates; IANA zone; returns UUID                                                                                                                                         |
| `hr_save_department(p_id,p_version,p_name)`                                                                                                | HR; create/update own department; returns UUID                                                                                                                                                                         |
| `hr_save_shift(p_id,p_version,p_name,p_site_id,p_starts_at,p_ends_at)`                                                                     | HR; active own site, captured site zone, nonzero/overnight hours; assigned/historical schedules immutable; returns UUID                                                                                                |
| `hr_save_employee(p_id,p_version,p_membership_version,p_email,p_display_name,p_employee_number,p_site_id,p_department_id,p_role,p_active)` | HR; link confirmed Auth account or edit profile; Employee/Supervisor only, explicit access and one supervisor scope; returns UUID                                                                                      |

Every save appends server-generated audit metadata atomically. Names are ≤120
characters and employee numbers ≤40. Duplicate names/numbers/accounts and stale
snapshots are rejected. Existing profile identity is resolved by ID, never an
edit-time email. No Auth password/admin operation is exposed.

PostgREST codes: `PT401` unauthenticated; `PT403` denied/protected role; `PT404`
own-scope record unavailable; `PT409` stale/conflicting/ambiguous assignment;
`PT422` invalid fields/site/department or unconfirmed account. The UI allowlists
safe machine messages and hides arbitrary database text. Direct table writes
remain denied. See `WORKFORCE_SETUP.md`.

Errors use this envelope with the same sanitized ID in `X-Request-ID`:

```json
{
  "error": {
    "code": "authorization_unavailable",
    "message": "Your workspace is not ready yet. Contact your administrator.",
    "request_id": "a-generated-request-id"
  }
}
```

Validation errors are generic 422 (do not echo submitted sensitive input). Unknown
paths → 404, unsupported methods → 405, unexpected errors → generic 500. Correlation
IDs accept 8–64 ASCII letters/digits/underscore/hyphen; otherwise server-generated UUID.
Health confirms the process only, not Supabase or business readiness.

## Supabase attendance RPCs

Migration `202611070005_attendance.sql` adds the following caller-JWT functions.
These are PostgreSQL transactions, not new FastAPI or privileged Pages endpoints.

| RPC                                                                                                                       | Scope / behavior                                                                                                                                                                                                                 |
| ------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `attendance_workspace()`                                                                                                  | Single active Employee/Supervisor/HR membership; scoped filter options and server date/time. Employees additionally receive their actual state, prior event ID, current shift and up to 50 own schedule rows.                    |
| `record_attendance(p_event_type,p_request_id,p_previous_event_id)`                                                        | Active Employee only. `clock_in`/`clock_out`, UUID and expected prior event only. Identity/tenant/shift/time are server-derived. Returns `{id,event_type,occurred_at,replayed}`.                                                 |
| `attendance_records(p_from,p_to,p_search='',p_site_id=null,p_department_id=null,p_status='all',p_page=1)`                 | Self/team/HR projection; ≤31 inclusive dates, literal search ≤80, status all/open/closed, 20-row pages. `{rows,total,page,page_size,summary:{sessions,open,completed_seconds}}`; summaries cover all permitted filtered matches. |
| `hr_employee_shifts(p_employee_id)`                                                                                       | HR, own tenant; employee version, matching site templates and up to 50 dated assignments with edit/cancel eligibility.                                                                                                           |
| `hr_save_employee_shift(p_employee_id,p_employee_version,p_id,p_version,p_shift_id,p_starts_on,p_ends_on,p_cancel=false)` | HR; create an assignment, update its end, or retain an unused current/future assignment as cancelled. Immutable shift/start fields on edits, version and overlap checks, atomic audit; returns UUID.                             |

Record rows contain employee name/number, site/department, work date/time zone,
shift name/scheduled window, actual paired UTC times, status and completed elapsed
seconds. They contain no staff email, credential, raw Auth data or private audit.
Supervisor access checks both current team/profile scope and captured event scope.
`PT409` covers stale state, changed request payload, overlapping/used assignments,
open-session reassignment and missing/inactive shift/site; `PT422` invalid fields
or date bounds. SQL error text is sanitized through a fixed frontend allowlist.
History is append-only. Correction events are not accepted by the normal writer.

## Per-punch location contract (migration 0006)

The active `record_attendance` signature is
`(p_event_type,p_request_id,p_previous_event_id,p_location,p_employee_id)`. The
employee ID is an expected-subject guard; verified identity and tenant still come
from the caller's active membership. The three-argument compatibility signature
rejects location-free requests. Private base functions are not executable by API
roles.

`p_location` accepts exactly numeric `latitude`, `longitude`, `accuracy_meters`,
ISO `captured_at`, and `consent_version: 'attendance-location-v1'`. Latitude is
−90…90, longitude −180…180, accuracy finite/nonnegative; new fixes must be within
120 seconds of server receipt and at most 30 seconds ahead. It cannot supply an
attendance timestamp, actor, tenant or assignment. The result adds
`location_saved: true`. Event/audit/GPS commit together. A matching retry keeps the
original fix even after it ages; a changed location or legacy request ID conflicts.

`attendance_workspace()` adds `location_required: true` and the notice version.
An updated client requires that handshake before capture. `attendance_records()`
adds in/out availability flags only for Employee/HR; coordinates never appear in
list payloads and Supervisor responses contain no such flags.

`attendance_location_details(p_session_id)` checks Employee ownership or HR tenant
scope and appends a minimal view audit. It returns
`{session_id,timezone,clock_in,clock_out}`; each point is null or contains numeric
latitude/longitude/accuracy, device `captured_at`, server `recorded_at` and type.
Legacy points are null. Other employees/tenants and Supervisor/auditor/owner roles
are denied. Direct location-table reads/writes are denied.

New machine messages include `attendance_location_required`,
`invalid_attendance_location`, `stale_attendance_location`, and
`legacy_attendance_request`. The frontend renders only fixed safe messages.

## Dashboard account gateway and settings

Cloudflare Pages Functions hosts these same-origin endpoints. The caller sends a
Bearer access token; Auth verifies identity and SQL derives one active HR tenant.
No user-selected Auth role, actor or tenant is accepted. Request body limit 8 KiB;
upstream calls are bounded and redirects denied. Responses are JSON/no-store,
with fixed safe errors. The admin binding is used only for targeted GoTrue APIs;
all SQL operations forward the caller JWT with the public key.

| Method/path                                             | Inputs / behavior                                                                                                                                                                                                                                                 |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /api/admin/staff`                                 | `request_id` UUID, `account_mode` create/existing, email, initial password (required for create), and profile `{display_name,employee_number,site_id,department_id,role,active}`. Employee/Supervisor only. Existing unprofiled accounts can be linked/confirmed. |
| `PATCH /api/admin/staff/{profile_id}/account`           | UUID request ID, email, optional password, profile `version` and `membership_version`. Server resolves the target Auth identity and checks its current scope.                                                                                                     |
| `POST /api/admin/staff/operations/{request_id}/recover` | Auth/HR scoped status check. Finishes a confirmed operation without another credential write; expired unconfirmed operations end safely.                                                                                                                          |

Success returns `{status:"completed",employee_id}`. Recovery can return
`status:"failed"` plus the reserved snapshot. A recoverable error includes an
operation ID; definite rejections can include `operation_closed` and current
reserved versions. No password/key is returned. HTTP 401/403/404/409/422/429/503
represent identity, capability, unavailable record, pending/stale/conflict,
validation, rate limit and unavailable/interrupted server respectively.

Connection errors may also include a fixed `connection_stage`: `verify_session`,
`prepare_request`, `auth_account`, or `account_record`. This contains no URL,
credentials or person data. A session-service connection failure does not imply a
pending account. Upstream redirects are refused with HTTP 503 / `upstream_unavailable`;
an already prepared operation retains its recovery ID.

Additional authenticated-only HR RPCs in migration 0004:
`hr_begin_staff_account`, `hr_staff_account_context`, `hr_complete_staff_account`,
`hr_recover_staff_account`, `hr_close_staff_account`, `hr_pending_staff_accounts`,
`hr_workspace_settings` and `hr_save_workspace_settings`. The private ledger is
not directly exposed. Begin binds a keyed fingerprint and a 90-second lease;
completion requires server-only Auth metadata. Settings save organization name,
default time zone and own display name using an expected organization version.
The read-only INVOKER `current_workspace()` retains RLS and adds the own-name
fallback. Own credential changes use standard Auth `getUser`/`updateUser`, with
normal email verification and a refreshed verified session.

Auth/application changes span services; they are not falsely described as one
transaction. SQL stages and audit entries are transactional; the pending/recovery
flow handles the cross-service boundary. See `ADMIN_DASHBOARD_SETUP.md`.

## Proposed, NOT implemented

The following domain `/api/v1` endpoints remain proposed. The implemented Pages
account endpoints below are a separate hosting adapter.

Do not call these endpoints from production UI until authorization and integration
tests exist. Currently they return 404.

| Domain      | Proposed operations                             | Required enforcement                                                          |
| ----------- | ----------------------------------------------- | ----------------------------------------------------------------------------- |
| Employees   | `GET /employees`, `GET /employees/{id}`         | Tenant + self/team/HR projection, cursor pagination, allowlisted filters      |
| Attendance  | `GET /attendance`, `POST /attendance/events`    | Own employee, server timestamp, active site/shift, state machine, idempotency |
| Shifts      | `GET /shifts`, `GET /me/schedule`               | Active assignment and authorized site scope                                   |
| Corrections | `POST /corrections`, `GET /corrections`         | Own request, bounded reason/date, scoped reading                              |
| Reviews     | `POST /corrections/{id}/recommendations`        | Assigned supervisor; recommend/flag only                                      |
| Decisions   | `POST /corrections/{id}/decisions`              | HR scope, final authority/conflict policy, immutable outcome                  |
| Documents   | `GET /documents`, `POST /documents/{id}/access` | Approved category/owner, private Storage, short-lived access                  |
| Reports     | `POST /reports/attendance`                      | Scoped approved projection, audit and export limits                           |

Future mutation example: `POST /attendance/events` accepts an event type and an
authorized assignment reference, **not** a trusted user/organization/role/timestamp.
Require a UUID `Idempotency-Key` header; store a request payload fingerprint with the
result. Same key/payload returns the original result; conflicting payload returns 409. A punch uses server time, and correction events retain separate recorded and
historical occurrence times. Shift/site and state checks must be transactional.

Future correction/approval APIs append requests, recommendations, decisions, linked
events and audit entries. Repeated/concurrent final decisions must not overwrite
history. Use 403 for denied capabilities and 404 for records outside permitted scope
when existence disclosure would be unsafe. Approval/self-review/retention policies
remain decisions, not implicit behavior of the frontend prototype.
