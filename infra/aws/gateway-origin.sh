#!/usr/bin/env bash
set -euo pipefail
install -d -m 0755 /etc/nginx/weekend-gates

cat >/etc/nginx/weekend-gateway-proxy.inc <<'NGINX'
proxy_pass http://127.0.0.1:3000;
proxy_http_version 1.1;
proxy_set_header Host $http_x_weekend_edge_host;
proxy_set_header X-Forwarded-Host $http_x_weekend_edge_host;
proxy_set_header X-Forwarded-Proto https;
proxy_set_header X-Forwarded-For $http_x_weekend_edge_client;
proxy_set_header Connection "";
proxy_buffering off;
NGINX

cat >/etc/nginx/conf.d/weekend-gateway.conf <<'NGINX'
server {
    listen 8081 default_server;
    server_name _;
    access_log off;
    error_log /var/log/nginx/weekend-gateway-error.log crit;
    client_max_body_size 128k;
    include /etc/nginx/weekend-gates/*.conf;

    if ($http_x_weekend_edge_host !~ "^[a-z0-9]+\.execute-api\.us-east-1\.amazonaws\.com$") {
        return 404;
    }

    location = /_weekend_origin {
        add_header Cache-Control "no-store" always;
        return 204;
    }

    location / {
        include /etc/nginx/weekend-gateway-proxy.inc;
        proxy_set_header X-Weekend-Legacy-Proxy "";
    }

    location ^~ /_weekend_legacy_wallet/ {
        rewrite ^/_weekend_legacy_wallet/(.*)$ /api/wallet/$1 break;
        include /etc/nginx/weekend-gateway-proxy.inc;
        proxy_set_header X-Weekend-Legacy-Proxy 1;
    }
}
NGINX
nginx -t
systemctl reload nginx
