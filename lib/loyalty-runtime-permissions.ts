/** Apply as database owner, never from a public runtime request. */
export const LOYALTY_RUNTIME_PERMISSIONS = [
  `DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='weekend_runtime') THEN
    CREATE ROLE weekend_runtime NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  END IF; END $$`,
  `GRANT CONNECT ON DATABASE neondb TO weekend_runtime`,
  `GRANT USAGE ON SCHEMA public TO weekend_runtime`,
  `GRANT SELECT ON customer_aliases,loyalty_schema_migrations TO weekend_runtime`,
  `GRANT SELECT,INSERT,UPDATE ON customers,apple_registrations,loyalty_events,loyalty_operations,loyalty_card_tokens,wallet_sync_jobs,loyalty_backup_runs,app_rate_limits TO weekend_runtime`,
  `GRANT DELETE ON apple_registrations,wallet_sync_jobs,app_rate_limits TO weekend_runtime`,
  `GRANT USAGE,SELECT ON SEQUENCE loyalty_events_id_seq,loyalty_backup_runs_id_seq TO weekend_runtime`,
];
