BEGIN;
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

GRANT INSERT, UPDATE ON customers, loyalty_backup_runs, loyalty_card_tokens,
  loyalty_events, loyalty_operations TO weekend_runtime;
GRANT INSERT, UPDATE, DELETE ON app_rate_limits, apple_registrations,
  wallet_sync_jobs TO weekend_runtime;
GRANT USAGE ON SEQUENCE loyalty_backup_runs_id_seq, loyalty_events_id_seq TO weekend_runtime;
COMMIT;
