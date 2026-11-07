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

## Proposed, NOT implemented

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
