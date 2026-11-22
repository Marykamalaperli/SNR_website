# Target project structure

```text
frontend/
  src/
    app/          routing, providers and PWA lifecycle
    components/   reusable accessible UI
    features/     auth, workforce, scheduling, attendance, payroll, documents
    services/     typed API clients and upload/download intents
    styles/       tokens and global composition
  tests/          unit, integration and browser support

backend/
  app/
    api/v1/       versioned FastAPI routers
    core/         settings, security, logging, errors and database lifecycle
    modules/      identity, workforce, scheduling, attendance, payroll,
                  documents, reporting and operations
  alembic/        target PostgreSQL migrations
  tests/          unit and integration tests

infra/
  docker/         local and server containers
  aws/            reviewed infrastructure definitions
  proxy/          Caddy or Nginx configuration

docs/             source pack, active target docs and superseded history
scripts/          checks, migration support, backup and operational helpers
```

The current `supabase/`, Cloudflare configuration and provider-specific documents
remain migration history until the cleanup decision. Do not delete them while they
are still needed to compare behavior or map existing private data.
