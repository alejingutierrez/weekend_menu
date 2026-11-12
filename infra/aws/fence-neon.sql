BEGIN;
SET LOCAL lock_timeout = '3s';
DO $$
BEGIN
  IF current_database() <> 'neondb'
    OR current_user <> 'neondb_owner'
    OR current_setting('neon.branch_id', true) IS DISTINCT FROM 'br-crimson-fire-ac3ov0rp'
  THEN
    RAISE EXCEPTION 'This command requires the original Weekend Menu database owner';
  END IF;
END;
$$;

LOCK TABLE app_rate_limits, apple_registrations, customer_aliases, customers,
  loyalty_backup_runs, loyalty_card_tokens, loyalty_events, loyalty_operations,
  loyalty_schema_migrations, wallet_sync_jobs IN ACCESS EXCLUSIVE MODE NOWAIT;
REVOKE INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public FROM weekend_runtime;
REVOKE USAGE, UPDATE ON ALL SEQUENCES IN SCHEMA public FROM weekend_runtime;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_tables WHERE schemaname = 'public'
      AND has_table_privilege('weekend_runtime',
        format('%I.%I', schemaname, tablename), 'INSERT,UPDATE,DELETE')
  ) OR EXISTS (
    SELECT 1 FROM pg_sequences WHERE schemaname = 'public'
      AND has_sequence_privilege('weekend_runtime',
        format('%I.%I', schemaname, sequencename), 'USAGE,UPDATE')
  ) THEN
    RAISE EXCEPTION 'The Weekend runtime still has a PostgreSQL write grant';
  END IF;
END;
$$;
COMMIT;
