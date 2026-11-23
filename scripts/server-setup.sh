#!/usr/bin/env bash
# ==============================================================================
# SNR NEST Staging Server Provisioning & Firewall Hardening
# Sets up UFW firewall, systemd docker-compose service, and backup cron.
# ==============================================================================

set -euo pipefail

echo "=== Configuring SNR NEST Host Security ==="

# 1. Firewall Configuration (UFW)
# Default policy: deny all incoming, allow outgoing
ufw default deny incoming
ufw default allow outgoing

# Allow HTTP and HTTPS for web traffic
ufw allow 80/tcp comment 'HTTP reverse proxy'
ufw allow 443/tcp comment 'HTTPS reverse proxy'

# Allow SSH with rate limiting (or restrict to admin CIDR if provided)
if [ -n "${ADMIN_IP_CIDR:-}" ]; then
    ufw allow from "${ADMIN_IP_CIDR}" to any port 22 proto tcp comment 'Restricted SSH'
else
    ufw limit 22/tcp comment 'Rate-limited SSH'
fi

# CRITICAL: PostgreSQL port 5432 is explicitly denied externally
ufw deny 5432/tcp comment 'Block direct PostgreSQL'

# Enable firewall non-interactively
ufw --force enable
ufw status verbose

# 2. Systemd Service Unit for Docker Compose
cat << 'EOF' > /etc/systemd/system/snr-nest.service
[Unit]
Description=SNR NEST Production Monolith Containers
Requires=docker.service
After=docker.service network-online.target
Wants=network-online.target

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/opt/snr-nest
ExecStart=/usr/bin/docker compose -f compose.prod.yaml up -d --remove-orphans
ExecStop=/usr/bin/docker compose -f compose.prod.yaml down
ExecReload=/usr/bin/docker compose -f compose.prod.yaml restart

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable snr-nest.service

# 3. Daily Backup Cron Setup
cat << 'EOF' > /etc/cron.d/snr-nest-backup
# Execute database backup daily at 02:00 UTC
0 2 * * * root cd /opt/snr-nest && ./scripts/backup-db.sh >> /var/log/snr-nest-backup.log 2>&1
EOF
chmod 644 /etc/cron.d/snr-nest-backup

echo "=== SNR NEST Host Setup & Hardening Complete ==="

