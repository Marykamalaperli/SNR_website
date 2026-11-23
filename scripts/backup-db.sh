#!/usr/bin/env bash
# ==============================================================================
# SNR NEST Database Backup Script
# Creates an encrypted PostgreSQL dump and securely uploads to private S3 BackupBucket.
# ==============================================================================

set -euo pipefail

TIMESTAMP=$(date -u +"%Y%m%dT%H%M%SZ")
BACKUP_DIR="${BACKUP_DIR:-/var/backups/snr-nest}"
BACKUP_FILE="${BACKUP_DIR}/snr_nest_backup_${TIMESTAMP}.sql.gz"
CHECKSUM_FILE="${BACKUP_FILE}.sha256"

# Verify required environment configuration
test -n "${AWS_REGION:-}" || { echo "[ERROR] AWS_REGION must be set." >&2; exit 1; }
test -n "${BACKUP_BUCKET:-}" || { echo "[ERROR] BACKUP_BUCKET must be set." >&2; exit 1; }
test -n "${POSTGRES_USER:-}" || { echo "[ERROR] POSTGRES_USER must be set." >&2; exit 1; }
test -n "${POSTGRES_DB:-}" || { echo "[ERROR] POSTGRES_DB must be set." >&2; exit 1; }

mkdir -p "${BACKUP_DIR}"
chmod 700 "${BACKUP_DIR}"

echo "[INFO] [${TIMESTAMP}] Starting database backup for database '${POSTGRES_DB}'..."

# Dump PostgreSQL database using pg_dump via docker exec
docker compose -f compose.prod.yaml exec -T db pg_dump \
    -U "${POSTGRES_USER}" \
    -d "${POSTGRES_DB}" \
    --no-owner \
    --no-privileges \
    --format=plain | gzip -9 > "${BACKUP_FILE}"

chmod 600 "${BACKUP_FILE}"

# Compute SHA-256 integrity checksum
sha256sum "${BACKUP_FILE}" > "${CHECKSUM_FILE}"
echo "[INFO] Dump completed. SHA-256: $(cat "${CHECKSUM_FILE}")"

# Upload to private AWS S3 BackupBucket with S3 SSE-S3 encryption
echo "[INFO] Uploading backup to s3://${BACKUP_BUCKET}/backups/${TIMESTAMP}/..."
aws s3 cp "${BACKUP_FILE}" "s3://${BACKUP_BUCKET}/backups/${TIMESTAMP}/snr_nest_backup.sql.gz" \
    --region "${AWS_REGION}" \
    --sse AES256

aws s3 cp "${CHECKSUM_FILE}" "s3://${BACKUP_BUCKET}/backups/${TIMESTAMP}/snr_nest_backup.sql.gz.sha256" \
    --region "${AWS_REGION}" \
    --sse AES256

echo "[INFO] Backup uploaded successfully."

# Prune local backups older than 7 days
find "${BACKUP_DIR}" -type f -name "snr_nest_backup_*.sql.gz*" -mtime +7 -delete

echo "[INFO] [$(date -u +"%Y%m%dT%H%M%SZ")] Backup process finished cleanly."

