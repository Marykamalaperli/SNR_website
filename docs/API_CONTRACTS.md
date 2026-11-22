# Target API contracts

Base path: `/api/v1`. JSON timestamps use ISO 8601 with offsets; stored instants use
UTC. Money is serialized as decimal strings. Mutation responses include a sanitized
`request_id`. The endpoints below are planned unless a test and implementation
explicitly mark them operational. Identity endpoints marked **Implemented** exist
in the target FastAPI application but are not claimed deployed.

## Identity and workforce

| Method and path             | Authority and purpose                                    |
| --------------------------- | -------------------------------------------------------- |
| `POST /auth/login`          | **Implemented:** generic errors, Argon2id and pilot rate limit |
| `POST /auth/refresh`        | **Implemented:** rotate opaque access and refresh state       |
| `POST /auth/logout`         | **Implemented:** revoke current database session              |
| `GET /me`                   | **Implemented:** active identity, exact roles and scopes       |
| `GET/POST /stores`          | System Admin or approved HR scope                        |
| `GET/POST/PATCH /employees` | Store Admin assigned store or HR organization scope      |
| `GET/POST /shifts`          | Store Admin/HR with store validation                     |
| `POST /shift-assignments`   | Store Admin/HR; reject overlaps and invalid dates        |

## Attendance

| Method and path                          | Authority and purpose                                           |
| ---------------------------------------- | --------------------------------------------------------------- |
| `POST /stores/{id}/qr-challenges`        | Assigned Store Admin; return short-lived signed payload         |
| `POST /attendance/upload-intents`        | Employee; constrained private photo upload                      |
| `POST /attendance/events`                | Employee; idempotency, QR, photo, store and sequence validation |
| `GET /attendance/me`                     | Employee own records only                                       |
| `GET /attendance/days`                   | Store Admin/HR scoped exception review                          |
| `POST /attendance/days/{id}/adjustments` | Authorized reviewer; reason and expected version                |
| `POST /attendance/days/{id}/approve`     | Explicit HR authority; conflict checks and append-only decision |

## Payroll and documents

| Method and path                       | Authority and purpose                                |
| ------------------------------------- | ---------------------------------------------------- |
| `POST /pay-periods`                   | HR/Payroll; create approved period                   |
| `POST /payroll-runs`                  | HR/Payroll; calculate deterministic draft            |
| `GET /payroll-runs/{id}/preview`      | Scoped reconciliation and blockers                   |
| `POST /payroll-runs/{id}/validate`    | Authorized validation step                           |
| `POST /payroll-runs/{id}/approve`     | Explicit approver; transactional lock                |
| `POST /payroll-runs/{id}/release`     | Release private payslips after lock                  |
| `GET /payslips/me`                    | Employee own released payslips                       |
| `POST /payslips/{id}/download-intent` | Owner only; short-lived signed download              |
| `GET /reports/attendance.csv`         | Authorized scoped export with formula neutralization |
| `GET /reports/payroll.csv`            | HR/Payroll approved scope and reconciliation         |

## Error envelope

```json
{
  "code": "attendance_state_conflict",
  "message": "Attendance changed. Refresh and try again.",
  "field_errors": {},
  "request_id": "sanitized-request-id"
}
```

Use 401 for missing/invalid authentication, 403 for known but unauthorized scope,
404 where resource existence should not be disclosed, 409 for stale/idempotency or
state conflicts and 422 for safe validation detail. Never echo passwords, tokens,
provider bodies, signed URLs or private request content.
