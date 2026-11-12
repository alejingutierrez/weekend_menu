#!/usr/bin/env bash
set -euo pipefail

bucket=$1
release=$2
origin=$3
secret_arn=$4
action=${5:-activate}
[[ "$bucket" =~ ^weekend-menu-storage-[a-z0-9]+$ ]]
[[ "$release" =~ ^[a-f0-9]{40}$ ]]
[[ "$origin" == prepare || "$origin" =~ ^https://[a-z0-9]+\.(cloudfront\.net|execute-api\.us-east-1\.amazonaws\.com)$ ]]
[[ "$secret_arn" =~ ^arn:aws:secretsmanager:us-east-1:907264907058:secret:[A-Za-z0-9/_+=.@-]+$ ]]
[[ "$action" == prepare || "$action" == activate ]]

umask 077
destination="/opt/weekend/releases/$release"
if [[ ! -e "$destination" ]]; then
  stage=$(mktemp -d /opt/weekend/releases/.build.XXXXXX)
  trap 'rm -rf "$stage"' EXIT
  aws s3 cp "s3://$bucket/releases/$release.tar.gz" "$stage/source.tar.gz" --only-show-errors
  tar -xzf "$stage/source.tar.gz" -C "$stage"
  rm "$stage/source.tar.gz"
  chown -R weekend:weekend "$stage"

  if [[ $(swapon --noheadings | wc -l) -eq 0 ]]; then
    if [[ ! -e /var/lib/weekend-build.swap ]]; then
      dd if=/dev/zero of=/var/lib/weekend-build.swap bs=1M count=2048 status=none
      chmod 0600 /var/lib/weekend-build.swap
      mkswap /var/lib/weekend-build.swap >/dev/null
    fi
    swapon /var/lib/weekend-build.swap
  fi

  cd "$stage"
  npm_bin="$(command -v npm-24 || command -v npm)"
  printf 'Installing the pinned application dependencies.\n'
  runuser -u weekend -- env npm_config_cache=/var/lib/weekend/npm "$npm_bin" ci --no-audit --no-fund
  build_origin="$origin"
  if [[ "$build_origin" == prepare ]]; then build_origin=; fi
  runuser -u weekend -- env PUBLIC_BASE_URL="$build_origin" NEXT_TELEMETRY_DISABLED=1 \
    NODE_OPTIONS=--max-old-space-size=1450 "$npm_bin" run build
  test -f .next/standalone/server.js
  test -d .next/static
  cp -R .next/static .next/standalone/.next/static
  cp -R public .next/standalone/public
  cp -R data .next/standalone/data
  install -d .next/standalone/infra/aws
  install -m 0644 infra/aws/start.mjs infra/aws/run-cron.mjs .next/standalone/infra/aws/
  chown -R weekend:weekend .next/standalone

  mv .next/standalone "$destination"
fi
if [[ "$origin" == prepare || "$action" == prepare ]]; then
  printf 'Weekend release %s compiled and prepared.\n' "$release"
  exit 0
fi
printf 'AWS_REGION=us-east-1\nWEEKEND_SECRET_ARN=%s\n' "$secret_arn" >/etc/weekend/service.env
chown root:weekend /etc/weekend/service.env
chmod 0640 /etc/weekend/service.env
previous="$(readlink /opt/weekend/current || true)"
ln -sfn "$destination" /opt/weekend/.next-release
mv -Tf /opt/weekend/.next-release /opt/weekend/current
systemctl enable weekend
systemctl restart weekend
for attempt in {1..20}; do
  if curl -fsS --max-time 4 -o /dev/null http://127.0.0.1:3000/; then
    printf 'Weekend release %s is serving the menu.\n' "$release"
    exit 0
  fi
  sleep 2
done
if [[ -n "$previous" ]]; then
  ln -sfn "$previous" /opt/weekend/.next-release
  mv -Tf /opt/weekend/.next-release /opt/weekend/current
  systemctl restart weekend
else
  systemctl stop weekend
fi
exit 1
