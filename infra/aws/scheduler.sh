#!/usr/bin/env bash
set -euo pipefail

node_bin="$(command -v node-24 || command -v node)"
cat >/etc/systemd/system/weekend-cron@.service <<SYSTEMD
[Unit]
Description=Weekend Menu scheduled task %i
After=weekend.service
Requires=weekend.service

[Service]
Type=oneshot
User=weekend
Group=weekend
EnvironmentFile=/etc/weekend/service.env
ExecStart=$node_bin /opt/weekend/current/infra/aws/run-cron.mjs %i
NoNewPrivileges=true
PrivateTmp=true
ProtectHome=true
UMask=0077
SYSTEMD

cat >/etc/systemd/system/weekend-wallets.timer <<'SYSTEMD'
[Unit]
Description=Retry Weekend Wallet updates every ten minutes

[Timer]
OnCalendar=*-*-* *:00/10:00 UTC
Unit=weekend-cron@wallets.service
Persistent=true

[Install]
WantedBy=timers.target
SYSTEMD

cat >/etc/systemd/system/weekend-backup.timer <<'SYSTEMD'
[Unit]
Description=Verify the daily Weekend loyalty backup

[Timer]
OnCalendar=*-*-* 08:00:00 UTC
Unit=weekend-cron@loyalty-backup.service
Persistent=true

[Install]
WantedBy=timers.target
SYSTEMD

systemctl daemon-reload
# The timers are enabled only after AWS owns the production database writes.
