# Target deployment

No target AWS infrastructure is currently claimed deployed. Provisioning, DNS,
live migration and release require explicit owner authorization.

## Frontend

- Build the React/Vite PWA into hashed static assets.
- Store assets in a private S3 bucket with Block Public Access enabled.
- Allow reads only from the named CloudFront distribution through OAC.
- Redirect HTTP to HTTPS and use an approved ACM certificate.
- Cache hashed assets for one year as immutable; keep `index.html` and service-worker
  entry files short-lived or no-cache.
- Configure SPA fallbacks carefully so missing immutable assets are not masked.
- Set exact security headers and exclude private routes from indexing.

## API and database

- Run the FastAPI image as a non-root container behind Caddy or Nginx with TLS.
- Expose only approved 80/443 paths; restrict administrative access to approved IPs
  or a managed tunnel.
- Bind PostgreSQL to the private Docker network and never publish its port.
- Configure exact frontend CORS origins and trusted hostnames.
- Disable API docs in production and bound request size, timeout and concurrency.
- Supply secrets through the host or secret manager, never images or source.

## Object storage

Use separate private storage for frontend assets, attendance evidence/payslips and
backups. Apply encryption, least-privilege policies, lifecycle rules and access
logging. Presigned operations must restrict key, purpose, type, size and expiry.

## CI and release

GitHub Actions runs format, lint, tests, migration checks, browser tests and the
production build. AWS access uses OIDC and least-privilege roles. The release syncs
hashed assets, invalidates only mutable frontend entries and deploys an immutable API
image. Pushes do not automatically release production unless separately approved.

## Backup and rollback

- Create encrypted nightly PostgreSQL backups off-server.
- Record frontend version, API image digest and database migration together.
- Test restore into a clean database before pilot reliance.
- Back up immediately before live migrations.
- Roll back application versions independently where schema compatibility permits.
- Never describe a backup as working without restore evidence.

## Cost controls

Use the supplied infrastructure estimate as a planning range, not a quote. Reprice
in the selected region and account, set AWS Budgets alerts at 50, 80 and 100 percent,
enable anomaly detection and monitor photo size, retention, requests, egress, CPU,
memory, disk, database growth and backup success.
