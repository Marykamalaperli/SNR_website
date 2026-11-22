# Development and operations runbook

## Current transition state

The existing JavaScript/Supabase/Cloudflare application can be run only for baseline
inspection and reuse analysis. Work Package 1 will introduce the target Docker
Compose, PostgreSQL, Alembic and TypeScript development workflow. Do not represent
the current provider stack as the final deployment.

## Baseline commands

```powershell
cd frontend
npm ci
npm run format:check
npm run lint
npm run test
npm run build
```

```powershell
cd backend
.\.venv\Scripts\python.exe -m ruff check .
.\.venv\Scripts\python.exe -m ruff format --check .
.\.venv\Scripts\python.exe -m pytest
```

Review `git status --short` before and after work. Preserve unrelated owner changes.

## Target startup

Run `docker compose up --build` from the repository root. Compose starts PostgreSQL,
runs `alembic upgrade head` in a one-shot migration service, waits for database and
API readiness, then starts Vite. Stop with `docker compose down`; do not add `--volumes`
unless the local database is intentionally being destroyed.

The foundation migration contains no business tables. `/health` confirms process
liveness; `/api/v1/ready` requires a working target PostgreSQL connection.

## Incident rules

- Record sanitized request IDs, UTC times, release versions and affected operations.
- Never paste passwords, authorization headers, signed URLs, payroll details, photos
  or private request bodies into issues or logs.
- Revoke sessions and rotate compromised credentials through approved channels.
- Preserve attendance, payroll and audit evidence.
- Stop unsafe processing, notify the responsible owner and follow the approved legal
  and employee-notification procedure.

## Backup and restore

Create encrypted off-server backups on schedule, monitor success and perform a
restore into a clean environment. Record duration, data verification and failures.
No production readiness claim is allowed without restore evidence.
