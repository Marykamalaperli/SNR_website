# API contracts

Base prefix: `/api/v1`. Request/response JSON; times are ISO 8601 with offsets/UTC.
The API never returns synthetic workforce records.

## Implemented

| Method/path           | Authentication      | Behavior                                                       |
| --------------------- | ------------------- | -------------------------------------------------------------- |
| `GET /health`         | Public              | Process liveness: `{"status":"ok","service":"snr-nest-api"}`   |
| `GET /api/v1/health`  | Public              | Same status/service plus `"version":"1"`                       |
| `GET /api/v1/session` | Verified Bearer JWT | Trusted membership interface; **503 until adapter configured** |

The session response model, available only from a future trusted adapter, contains
`user_id`, `organization_id`, exact `role`, optional `employee_id`, `team_ids` and
`site_ids`. Roles: `employee`, `supervisor`, `hr`, `security_auditor`, `system_owner`.
The browser maps only the first three to workspaces. Missing token → 401; configured
but invalid token → 401; auth/JWKS unavailable → 503; verified identity without a
membership adapter → 503. A token is never itself workspace authorization.

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
