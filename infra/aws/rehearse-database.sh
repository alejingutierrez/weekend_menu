#!/usr/bin/env bash
set -euo pipefail
umask 077

bucket=$1
envelope=$2
mode=${3:-rehearsal}
[[ "$bucket" =~ ^weekend-menu-storage-[a-z0-9]+$ ]]
[[ "$envelope" =~ ^releases/migration-[a-f0-9]+\.der$ ]]
[[ "$mode" == rehearsal || "$mode" == production ]]
work=/run/weekend-migration
trap 'rm -f "$work"/{unwrap.key,unwrap.crt,envelope.der,credentials.json,snapshot.dump,expected.txt,restored.txt,digests.sql,snapshot.in,snapshot.out}' EXIT
aws s3 cp "s3://$bucket/$envelope" "$work/envelope.der" --only-show-errors
openssl cms -decrypt -binary -inform DER -in "$work/envelope.der" \
  -recip "$work/unwrap.crt" -inkey "$work/unwrap.key" -out "$work/credentials.json"
rm -f "$work/unwrap.key" "$work/unwrap.crt" "$work/envelope.der"

source_password=$(jq -er .sourcePassword "$work/credentials.json")
target_password=$(jq -er .targetPassword "$work/credentials.json")
target_host=$(jq -er .targetHost "$work/credentials.json")
[[ "$target_host" =~ ^weekend-menu-database-[a-z0-9]+\.[a-z0-9]+\.us-east-1\.rds\.amazonaws\.com$ ]]
if [[ "$mode" == production ]]; then
  runtime_password=$(jq -er .runtimePassword "$work/credentials.json")
  [[ "$runtime_password" =~ ^[a-f0-9]{64}$ ]]
fi
rm -f "$work/credentials.json"

source_query() {
  PGHOST=ep-quiet-union-acj8tg2k.sa-east-1.aws.neon.tech PGDATABASE=neondb \
    PGUSER=neondb_owner PGPASSWORD="$source_password" PGSSLMODE=verify-full \
    PGSSLROOTCERT=/etc/pki/tls/certs/ca-bundle.crt PGCHANNELBINDING=require \
    "$@"
}
target_query() {
  PGHOST="$target_host" PGUSER=weekend_owner PGPASSWORD="$target_password" \
    PGSSLMODE=verify-full PGSSLROOTCERT=/etc/weekend/rds-ca.pem "$@"
}

database=weekend_rehearsal
if [[ "$mode" == production ]]; then
  database=weekend
  [[ $(source_query psql -XAtq -v ON_ERROR_STOP=1 -c "
    SELECT count(*) FROM pg_roles WHERE rolname='weekend_runtime'
      AND NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public'
        AND has_table_privilege(rolname,format('%I.%I',schemaname,tablename),'INSERT,UPDATE,DELETE'))
      AND NOT EXISTS (SELECT 1 FROM pg_sequences WHERE schemaname='public'
        AND has_sequence_privilege(rolname,format('%I.%I',schemaname,sequencename),'USAGE,UPDATE'))") == 1 ]]
  [[ $(target_query psql -XAtq -v ON_ERROR_STOP=1 -d "$database" \
    -c "SELECT count(*) FROM pg_tables WHERE schemaname='public'") == 0 ]]
fi

cat > "$work/digests.sql" <<'SQL'
SET LOCAL TIME ZONE 'UTC';
SELECT format(
  'SELECT %L, count(*), encode(sha256(convert_to(coalesce(string_agg(record, chr(10) ORDER BY record COLLATE "C"), ''''), ''UTF8'')), ''hex'') FROM (SELECT to_jsonb(t)::text AS record FROM public.%I t) AS rows',
  tablename, tablename
)
FROM pg_tables WHERE schemaname='public' ORDER BY tablename
\gexec
SQL
if [[ "$mode" == production ]]; then
  cat >> "$work/digests.sql" <<'SQL'
SELECT format('SELECT %L, last_value, is_called FROM public.%I', 'sequence:' || sequencename, sequencename)
FROM pg_sequences WHERE schemaname='public' ORDER BY sequencename
\gexec
SQL
fi

mkfifo "$work/snapshot.in" "$work/snapshot.out"
source_query psql -X -A -t -q -v ON_ERROR_STOP=1 <"$work/snapshot.in" >"$work/snapshot.out" &
snapshot_pid=$!
exec 3>"$work/snapshot.in"
exec 4<"$work/snapshot.out"
printf '%s\n' "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;" \
  "SELECT current_setting('neon.branch_id', true) || '|' || (current_setting('server_version_num')::int/10000)::text || '|' || pg_export_snapshot();" \
  >&3
IFS='|' read -r branch major snapshot <&4
[[ "$branch" == br-crimson-fire-ac3ov0rp && "$major" == 17 && "$snapshot" =~ ^[0-9A-Fa-f]+-[0-9A-Fa-f]+-[0-9]+$ ]]

source_query pg_dump --format=custom --schema=public --no-owner --no-privileges \
  --snapshot="$snapshot" --file="$work/snapshot.dump"
{
  printf "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;\nSET TRANSACTION SNAPSHOT '%s';\n" "$snapshot"
  cat "$work/digests.sql"
  printf 'ROLLBACK;\n'
} | source_query psql -X -A -t -q -v ON_ERROR_STOP=1 > "$work/expected.txt"
grep -Eq '^customers\|[1-9][0-9]*\|' "$work/expected.txt"
grep -Eq '^loyalty_card_tokens\|[1-9][0-9]*\|' "$work/expected.txt"
printf '%s\n' 'ROLLBACK;' '\q' >&3
exec 3>&-
exec 4<&-
wait "$snapshot_pid"

if [[ "$mode" == rehearsal ]]; then
  [[ $(target_query psql -X -A -t -q -v ON_ERROR_STOP=1 -d postgres \
    -c "SELECT count(*) FROM pg_database WHERE datname='$database'") == 0 ]]
  target_query createdb "$database"
fi
target_query pg_restore --dbname="$database" --single-transaction --exit-on-error \
  --clean --if-exists --no-owner --no-privileges "$work/snapshot.dump"
{
  printf 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;\n'
  cat "$work/digests.sql"
  printf 'ROLLBACK;\n'
} | target_query psql -X -A -t -q -v ON_ERROR_STOP=1 -d "$database" > "$work/restored.txt"
cmp -s "$work/expected.txt" "$work/restored.txt"
if [[ "$mode" == production ]]; then
  {
    printf "BEGIN;\nCREATE ROLE weekend_runtime LOGIN PASSWORD '%s';\n" "$runtime_password"
    cat <<'SQL'
REVOKE CONNECT ON DATABASE weekend FROM PUBLIC;
GRANT CONNECT ON DATABASE weekend TO weekend_runtime;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO weekend_runtime;
GRANT SELECT ON customer_aliases,loyalty_schema_migrations TO weekend_runtime;
GRANT SELECT,INSERT,UPDATE ON customers,loyalty_backup_runs,loyalty_card_tokens,loyalty_events,loyalty_operations TO weekend_runtime;
GRANT SELECT,INSERT,UPDATE,DELETE ON app_rate_limits,apple_registrations,wallet_sync_jobs TO weekend_runtime;
GRANT SELECT,USAGE ON SEQUENCE loyalty_backup_runs_id_seq,loyalty_events_id_seq TO weekend_runtime;
COMMIT;
SQL
  } | target_query psql -X -A -t -q -v ON_ERROR_STOP=1 -d "$database"
fi
printf 'Verified PostgreSQL table digests: %s\n' "$(grep -cv '^sequence:' "$work/restored.txt")"
if [[ "$mode" == production ]]; then
  printf 'Verified PostgreSQL sequence states: %s\n' "$(grep -c '^sequence:' "$work/restored.txt")"
fi
target_query psql -X -A -t -q -v ON_ERROR_STOP=1 -d "$database" -c \
  "SELECT json_build_object('customers',count(*),'currentStamps',sum(stamps),'totalStamps',sum(total_stamps),'rewardsAvailable',sum(rewards_available),'totalRewards',sum(total_rewards),'appleRegistrations',(SELECT count(*) FROM apple_registrations),'permanentTokens',(SELECT count(*) FROM loyalty_card_tokens)) FROM customers"
