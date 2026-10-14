/** Apply transactionally. Never reseed existing cards or rewrite balances. */
export const LOYALTY_RESILIENCE_SCHEMA = [
  `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='customers_balances_valid' AND conrelid='customers'::regclass) THEN
  ALTER TABLE customers ADD CONSTRAINT customers_balances_valid CHECK (
    stamps BETWEEN 0 AND 9 AND rewards_available >= 0 AND total_rewards >= 0
    AND rewards_available <= total_rewards AND total_stamps >= 0
    AND total_stamps::bigint = total_rewards::bigint * 10 + stamps
  ) NOT VALID; END IF; END $$`,
  `ALTER TABLE customers VALIDATE CONSTRAINT customers_balances_valid`,
  `CREATE TABLE IF NOT EXISTS loyalty_operations (
    operation_id uuid PRIMARY KEY, customer_id text NOT NULL REFERENCES customers(id),
    kind text NOT NULL CHECK(kind IN ('STAMP','REDEEM')), actor text NOT NULL,
    result jsonb, created_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz
  )`,
  `CREATE TABLE IF NOT EXISTS loyalty_card_tokens (serial text PRIMARY KEY, token text NOT NULL, created_at timestamptz NOT NULL DEFAULT now())`,
  `CREATE TABLE IF NOT EXISTS wallet_sync_jobs (
    customer_id text PRIMARY KEY REFERENCES customers(id), revision bigint NOT NULL DEFAULT 1,
    attempts int NOT NULL DEFAULT 0, available_at timestamptz NOT NULL DEFAULT now(),
    lease_id uuid, locked_until timestamptz, last_error text, updated_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE OR REPLACE FUNCTION loyalty_queue_wallet() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
    INSERT INTO wallet_sync_jobs(customer_id) VALUES(NEW.id)
    ON CONFLICT(customer_id) DO UPDATE SET revision=wallet_sync_jobs.revision+1,
      attempts=0, available_at=now(), last_error=NULL, updated_at=now();
    RETURN NEW;
  END $$`,
  `DROP TRIGGER IF EXISTS loyalty_wallet_queue ON customers`,
  `CREATE TRIGGER loyalty_wallet_queue AFTER UPDATE ON customers
    FOR EACH ROW WHEN (OLD IS DISTINCT FROM NEW) EXECUTE FUNCTION loyalty_queue_wallet()`,
  `ALTER TABLE apple_registrations ADD COLUMN IF NOT EXISTS revoked_at timestamptz`,
  `ALTER TABLE apple_registrations ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now()`,
  `CREATE OR REPLACE FUNCTION loyalty_keep_history() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
    RAISE EXCEPTION 'Loyalty history and recovered identifiers must be preserved.' USING ERRCODE='55000';
  END $$`,
  `DROP TRIGGER IF EXISTS loyalty_immutable_event ON loyalty_events`,
  `CREATE TRIGGER loyalty_immutable_event BEFORE UPDATE ON loyalty_events FOR EACH ROW EXECUTE FUNCTION loyalty_keep_history()`,
  `CREATE OR REPLACE FUNCTION loyalty_keep_alias_identity() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
    IF NEW.alias_id<>OLD.alias_id OR NEW.alias_code<>OLD.alias_code OR NEW.customer_id<>OLD.customer_id THEN
      RAISE EXCEPTION 'Recovered identifiers cannot be reassigned.' USING ERRCODE='55000';
    END IF; RETURN NEW;
  END $$`,
  `DROP TRIGGER IF EXISTS loyalty_immutable_alias ON customer_aliases`,
  `CREATE TRIGGER loyalty_immutable_alias BEFORE UPDATE ON customer_aliases FOR EACH ROW EXECUTE FUNCTION loyalty_keep_alias_identity()`,
  `CREATE OR REPLACE FUNCTION loyalty_keep_operation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
    IF NEW.operation_id<>OLD.operation_id OR NEW.customer_id<>OLD.customer_id OR NEW.kind<>OLD.kind OR NEW.actor<>OLD.actor
      OR (OLD.completed_at IS NOT NULL AND NEW IS DISTINCT FROM OLD) THEN
      RAISE EXCEPTION 'Completed loyalty operations are immutable.' USING ERRCODE='55000';
    END IF; RETURN NEW;
  END $$`,
  `DROP TRIGGER IF EXISTS loyalty_immutable_operation ON loyalty_operations`,
  `CREATE TRIGGER loyalty_immutable_operation BEFORE UPDATE ON loyalty_operations FOR EACH ROW EXECUTE FUNCTION loyalty_keep_operation()`,
  ...[
    "customer_aliases",
    "loyalty_events",
    "loyalty_operations",
    "loyalty_card_tokens",
  ].flatMap((table) => [
    `DROP TRIGGER IF EXISTS loyalty_preserve_delete ON ${table}`,
    `CREATE TRIGGER loyalty_preserve_delete BEFORE DELETE ON ${table} FOR EACH ROW EXECUTE FUNCTION loyalty_keep_history()`,
    `DROP TRIGGER IF EXISTS loyalty_preserve_truncate ON ${table}`,
    `CREATE TRIGGER loyalty_preserve_truncate BEFORE TRUNCATE ON ${table} FOR EACH STATEMENT EXECUTE FUNCTION loyalty_keep_history()`,
  ]),
  `DROP TRIGGER IF EXISTS loyalty_immutable_token ON loyalty_card_tokens`,
  `CREATE TRIGGER loyalty_immutable_token BEFORE UPDATE ON loyalty_card_tokens FOR EACH ROW EXECUTE FUNCTION loyalty_keep_history()`,
  `CREATE TABLE IF NOT EXISTS loyalty_schema_migrations(version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`,
  `CREATE TABLE IF NOT EXISTS loyalty_backup_runs(id bigserial PRIMARY KEY, blob_url text NOT NULL, digest text NOT NULL, cards int NOT NULL, verified_at timestamptz NOT NULL DEFAULT now())`,
  `INSERT INTO loyalty_schema_migrations(version) VALUES ('2026-10-13-resilience') ON CONFLICT DO NOTHING`,
];
