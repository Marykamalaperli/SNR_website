# Work Package 1 validation

Date: 22 November 2026

## Delivered

- Gradual TypeScript configuration with strict target settings and a `typecheck`
  script. Existing JavaScript remains operational for focused later migration.
- PostgreSQL driver, SQLAlchemy 2 and Alembic with pinned dependencies.
- Target database settings and a database-aware `/api/v1/ready` endpoint.
- An Alembic foundation revision that establishes migration tracking without
  introducing business tables.
- Dockerfiles for the target frontend and backend development images.
- Docker Compose services for PostgreSQL, one-shot migration, API and frontend with
  health/dependency gates.

## Executed checks

- `python -m ruff check app tests alembic` — passed.
- `python -m ruff format --check app tests alembic` — passed.
- `python -m pytest` — 57 passed; one upstream Starlette/httpx deprecation warning.
- `python -m pip check` — no broken requirements.
- `alembic upgrade head --sql` — generated valid PostgreSQL transactional SQL for
  revision `202611220001`.
- `npm run format:check` — passed.
- `npm run lint` — no errors; one pre-existing missing `useEffect` dependency warning
  in `GuardApprovedAttendance.jsx`.
- `npm run typecheck` — passed.
- `npm run test` — 159 passed across 18 files.
- `npm run build` — passed; existing dynamic-import warning and missing optional
  `PUBLIC_SITE_URL` notice remain.
- `docker compose config --quiet` — passed.
- `npx playwright install chromium` — installed the matching local test browser.
- `npm run test:browser` — 56 passed. Playwright emitted only the existing
  `NO_COLOR`/`FORCE_COLOR` environment warning.

## Blocker

`docker compose up --build --detach` could not connect to
`dockerDesktopLinuxEngine`; a Docker daemon is not installed or running in this
environment. Therefore container builds, live PostgreSQL migration, service health
checks and representative container HTTP requests are not yet verified. Run the
Compose startup on a machine with Docker Desktop or another compatible engine before
closing the package gate.
