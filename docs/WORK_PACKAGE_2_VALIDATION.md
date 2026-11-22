# Work Package 2 validation

Date: 22 November 2026

## Delivered

- PostgreSQL organizations, stores, users, exact role assignments, employee
  identity links and revocable session records.
- Argon2id password verification with generic failures and a pilot login throttle.
- Opaque HttpOnly access and refresh cookies; database token digests, rotation,
  revocation, active-user and token-version checks.
- Exact-Origin CSRF checks and credentialed exact-origin CORS.
- Login, refresh, logout and current-user API endpoints.
- Exact five-role authorization plus organization/store scope helpers and database
  constraints that reject cross-organization store references.
- Explicitly development-only synthetic seed script.

## Local checks

- `python -m ruff check .` - passed.
- `python -m ruff format --check .` - passed.
- `python -m pytest` - 32 passed, two PostgreSQL integration tests skipped because
  no local `DATABASE_URL` was available.
- `alembic upgrade head --sql` - generated PostgreSQL SQL for both target revisions.
- `git diff --check` - passed.

## Pending validation

Docker Desktop was not running, so local live migration upgrade/downgrade,
PostgreSQL session flows, container startup and representative container requests
were not executed. GitHub Actions is configured to run the identity integration
tests between migration upgrade and downgrade. Record that result here before
marking the package validated.

No AWS resources, DNS, live migrations or private data were changed.
