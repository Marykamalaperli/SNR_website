# SNR NEST Rollback Plan

**Version:** 1.0  
**Effective Date:** 23 November 2026

---

## 1. Purpose

This document provides exact, tested step-by-step procedures to revert frontend and backend deployments in the event of an operational anomaly, data integrity violation, or release failure during pilot operations.

---

## 2. Frontend Rollback Procedure (CloudFront + S3)

Because frontend static assets are versioned and content-hashed, rolling back does not require re-building if prior artifacts are retained.

1. **Identify Previous Working Commit / Release Artifacts:**
   Retrieve the previous stable git commit or cached build from CI/CD.
2. **Re-sync Prior Build to S3:**
   ```bash
   aws s3 sync previous_dist/ s3://${FRONTEND_BUCKET}/ \
     --delete \
     --cache-control "public, max-age=31536000, immutable" \
     --exclude "index.html" \
     --exclude "sw.js" \
     --exclude "manifest.webmanifest"

   aws s3 cp previous_dist/index.html s3://${FRONTEND_BUCKET}/index.html \
     --cache-control "public, max-age=0, must-revalidate"
   aws s3 cp previous_dist/sw.js s3://${FRONTEND_BUCKET}/sw.js \
     --cache-control "public, max-age=0, must-revalidate"
   ```
3. **Invalidate CloudFront Cache:**
   Issue targeted invalidation strictly for entry points:
   ```bash
   aws cloudfront create-invalidation \
     --distribution-id "${CLOUDFRONT_DISTRIBUTION_ID}" \
     --paths "/index.html" "/sw.js" "/manifest.webmanifest"
   ```
4. **Verification:**
   Access https://staging.snrnest.com/ and verify version in client bundle and service worker.

---

## 3. Backend & Database Rollback Procedure

### 3.1 Container Reversion
If an application container update introduces regressions:
1. Revert repository code to previous stable tag/commit:
   ```bash
   git checkout <PREVIOUS_STABLE_TAG>
   ```
2. Re-build and re-start backend service:
   ```bash
   docker compose -f compose.prod.yaml build api
   docker compose -f compose.prod.yaml up -d --no-deps api
   ```
3. Verify readiness probe:
   ```bash
   curl -fsS http://127.0.0.1:8000/api/v1/ready
   ```

### 3.2 Database Migration Reversion
If a migration was applied and must be rolled back:
```bash
docker compose -f compose.prod.yaml exec -T api alembic downgrade -1
```
Verify current migration head:
```bash
docker compose -f compose.prod.yaml exec -T api alembic current
```

### 3.3 Database Point-in-Time Restore from Backup
If data corruption occurred:
1. Stop backend API to halt incoming transactions:
   ```bash
   docker compose -f compose.prod.yaml stop api
   ```
2. Download verified backup from S3:
   ```bash
   aws s3 cp s3://${BACKUP_BUCKET}/backups/${BACKUP_TIMESTAMP}/snr_nest_backup.sql.gz /tmp/restore.sql.gz
   aws s3 cp s3://${BACKUP_BUCKET}/backups/${BACKUP_TIMESTAMP}/snr_nest_backup.sql.gz.sha256 /tmp/restore.sql.gz.sha256
   ```
3. Verify SHA-256 checksum:
   ```bash
   cd /tmp && sha256sum -c restore.sql.gz.sha256
   ```
4. Restore into PostgreSQL:
   ```bash
   gunzip < /tmp/restore.sql.gz | docker compose -f compose.prod.yaml exec -T db psql -U snr_nest -d snr_nest
   ```
5. Restart API and verify health:
   ```bash
   docker compose -f compose.prod.yaml start api
   curl -fsS http://127.0.0.1:8000/api/v1/ready
   ```

