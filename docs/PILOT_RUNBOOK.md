# SNR NEST Pilot Deployment and Operations Runbook

**Version:** 1.0  
**Effective Date:** 23 November 2026  
**Scope:** One-store pilot deployment (up to 100 employees)

---

## 1. Architecture Summary

- **Frontend:** Static Single Page Application (React, Vite, TypeScript, PWA) hosted on private AWS S3 bucket, delivered via Amazon CloudFront with Origin Access Control (OAC), TLS 1.2/1.3, and security headers.
- **Backend:** Python 3.12+ FastAPI modular monolith running in Docker with non-root user `appuser`.
- **Database:** PostgreSQL 17 in private Docker bridge network (`backend-net`). Direct host port 5432 is strictly unexposed.
- **Reverse Proxy:** Caddy 2 with automated TLS, HSTS (`max-age=31536000`), `nosniff`, `DENY` framing, and structured JSON logging.
- **Evidence & Storage:** Private S3 buckets with SSE-S3 AES-256 encryption, Object Ownership BucketOwnerEnforced, and S3 Block Public Access.

---

## 2. Pre-Flight Deployment Checklist

1. **DNS & Certificate:** Verify staging DNS records point to CloudFront (frontend) and server reverse proxy (API).
2. **Environment Variables:**
   - Copy `.env.example` to `.env` on target server.
   - Set strong, random `SECRET_KEY` (minimum 32 characters).
   - Set strong `POSTGRES_PASSWORD`.
   - Configure `ALLOWED_HOSTS` and `CORS_ORIGINS` to exact authorized domains.
   - Confirm `SESSION_COOKIE_SECURE="true"` for production HTTPS.
3. **AWS Staging Buckets:**
   - Verify `FrontendBucket`, `EvidenceBucket`, `PayslipBucket`, and `BackupBucket` exist and have full S3 Block Public Access enabled.
4. **AWS Budgets Alerting:**
   - Configure AWS Budget for monthly target (INR 2,000–4,000).
   - Set email notifications at 50%, 80%, and 100% threshold triggers.

---

## 3. Server Provisioning & Startup Procedures

### 3.1 Host Hardening
Execute the host setup script on clean Ubuntu LTS instance:
```bash
sudo ./scripts/server-setup.sh
```
This configures UFW firewall:
- Allow incoming: 80/tcp, 443/tcp, and rate-limited 22/tcp (SSH).
- Deny incoming: 5432/tcp (PostgreSQL).
- Enables `snr-nest.service` systemd unit.
- Configures daily backup cron at 02:00 UTC.

### 3.2 Starting Application Stack
```bash
docker compose -f compose.prod.yaml up -d
```
Verify container statuses:
```bash
docker compose -f compose.prod.yaml ps
```

---

## 4. Operational Health & Readiness Verification

- **Liveness probe:**
  ```bash
  curl -fsS https://api.staging.snrnest.com/health
  # Expected: {"status": "ok", "service": "snr-nest-api"}
  ```
- **Readiness probe:**
  ```bash
  curl -fsS https://api.staging.snrnest.com/api/v1/ready
  # Expected: {"status": "ready", "service": "snr-nest-api", "database": "available"}
  ```
- **Container health inspections:**
  ```bash
  docker inspect --format='{{json .State.Health}}' snr-nest-prod-api-1
  docker inspect --format='{{json .State.Health}}' snr-nest-prod-db-1
  ```

---

## 5. Routine Maintenance & Backup Procedures

- **Automated Daily Backups:**
  The cron task `/etc/cron.d/snr-nest-backup` runs daily at 02:00 UTC:
  - Generates compressed `pg_dump`.
  - Computes SHA-256 integrity hash.
  - Uploads to private S3 BackupBucket with SSE-S3 encryption.
  - Prunes local dumps older than 7 days.
- **Manual Backup Trigger:**
  ```bash
  sudo ./scripts/backup-db.sh
  ```
- **Log Inspection (Structured JSON):**
  ```bash
  docker compose -f compose.prod.yaml logs -f api | jq .
  ```

