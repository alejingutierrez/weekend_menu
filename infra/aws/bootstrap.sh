#!/usr/bin/env bash
set -euo pipefail

dnf install -y nginx nodejs24 nodejs24-npm postgresql17 jq
if ! id weekend >/dev/null 2>&1; then
  useradd --system --home-dir /var/lib/weekend --shell /sbin/nologin weekend
fi
install -d -m 0750 -o root -g weekend /etc/weekend /opt/weekend /opt/weekend/releases
install -d -m 0750 -o weekend -g weekend /var/lib/weekend
curl -fsS --retry 3 https://truststore.pki.rds.amazonaws.com/us-east-1/us-east-1-bundle.pem \
  -o /etc/weekend/rds-ca.pem
chmod 0644 /etc/weekend/rds-ca.pem

cat >/etc/nginx/conf.d/weekend.conf <<'NGINX'
map $http_x_forwarded_for $weekend_viewer_address {
    ~,\s*(?<weekend_last_address>[^,\s]+)\s*$ $weekend_last_address;
    default $http_x_forwarded_for;
}

server {
    listen 8080 default_server;
    server_name _;
    access_log off;
    error_log /var/log/nginx/weekend-error.log crit;
    client_max_body_size 128k;

    location = /_weekend_origin {
        add_header Cache-Control "no-store" always;
        return 204;
    }

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $http_host;
        proxy_set_header X-Forwarded-Host $http_host;
        proxy_set_header X-Forwarded-Proto https;
        proxy_set_header X-Forwarded-For $weekend_viewer_address;
        proxy_set_header Connection "";
        proxy_buffering off;
    }
}
NGINX
nginx -t
systemctl enable nginx
systemctl restart nginx

node_bin="$(command -v node-24 || command -v node)"
cat >/etc/systemd/system/weekend.service <<SYSTEMD
[Unit]
Description=Weekend Menu
Wants=network-online.target
After=network-online.target

[Service]
Type=simple
User=weekend
Group=weekend
WorkingDirectory=/opt/weekend/current
EnvironmentFile=/etc/weekend/service.env
ExecStart=$node_bin infra/aws/start.mjs
Restart=on-failure
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true
ProtectHome=true
ProtectSystem=full
UMask=0077

[Install]
WantedBy=multi-user.target
SYSTEMD
systemctl daemon-reload
