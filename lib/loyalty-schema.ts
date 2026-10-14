/** Additive migration: existing cards, contacts and balances stay intact. */
export const LOYALTY_RECOVERY_SCHEMA = [
  `ALTER TABLE customers ADD COLUMN IF NOT EXISTS archived_at timestamptz`,
  `ALTER TABLE customers ADD COLUMN IF NOT EXISTS archived_by text`,
  `CREATE TABLE IF NOT EXISTS customer_aliases (
    alias_id text PRIMARY KEY,
    alias_code text UNIQUE NOT NULL,
    customer_id text NOT NULL REFERENCES customers(id),
    recovered_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS customer_aliases_customer ON customer_aliases(customer_id)`,
  `CREATE TABLE IF NOT EXISTS loyalty_events (
    id bigserial PRIMARY KEY,
    customer_id text NOT NULL,
    operation text NOT NULL,
    actor text NOT NULL,
    before_state jsonb,
    after_state jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS loyalty_events_customer ON loyalty_events(customer_id, created_at DESC)`,
  `CREATE OR REPLACE FUNCTION loyalty_block_customer_delete() RETURNS trigger
    LANGUAGE plpgsql AS $$ BEGIN
      RAISE EXCEPTION 'Customer deletion is disabled. Archive the card instead.' USING ERRCODE = '55000';
    END $$`,
  `DROP TRIGGER IF EXISTS loyalty_no_delete ON customers`,
  `CREATE TRIGGER loyalty_no_delete BEFORE DELETE ON customers
    FOR EACH ROW EXECUTE FUNCTION loyalty_block_customer_delete()`,
  `DROP TRIGGER IF EXISTS loyalty_no_truncate ON customers`,
  `CREATE TRIGGER loyalty_no_truncate BEFORE TRUNCATE ON customers
    FOR EACH STATEMENT EXECUTE FUNCTION loyalty_block_customer_delete()`,
  `CREATE OR REPLACE FUNCTION loyalty_check_identity() RETURNS trigger
    LANGUAGE plpgsql AS $$ BEGIN
      IF TG_OP = 'UPDATE' AND (NEW.id <> OLD.id OR NEW.code <> OLD.code) THEN
        RAISE EXCEPTION 'Card identifiers and codes are permanent.' USING ERRCODE = '55000';
      END IF;
      IF EXISTS (SELECT 1 FROM customer_aliases a
                 WHERE (a.alias_id = NEW.id OR a.alias_code = NEW.code) AND a.customer_id <> NEW.id) THEN
        RAISE EXCEPTION 'Card identifier or code already belongs to a recovered card.' USING ERRCODE = '23505';
      END IF;
      RETURN NEW;
    END $$`,
  `DROP TRIGGER IF EXISTS loyalty_identity ON customers`,
  `CREATE TRIGGER loyalty_identity BEFORE INSERT OR UPDATE ON customers
    FOR EACH ROW EXECUTE FUNCTION loyalty_check_identity()`,
  `CREATE OR REPLACE FUNCTION loyalty_check_alias() RETURNS trigger
    LANGUAGE plpgsql AS $$ BEGIN
      IF EXISTS (SELECT 1 FROM customers c
                 WHERE (c.id = NEW.alias_id OR c.code = NEW.alias_code) AND c.id <> NEW.customer_id) THEN
        RAISE EXCEPTION 'Recovered identifier or code belongs to another card.' USING ERRCODE = '23505';
      END IF;
      RETURN NEW;
    END $$`,
  `DROP TRIGGER IF EXISTS loyalty_alias_identity ON customer_aliases`,
  `CREATE TRIGGER loyalty_alias_identity BEFORE INSERT OR UPDATE ON customer_aliases
    FOR EACH ROW EXECUTE FUNCTION loyalty_check_alias()`,
  `CREATE OR REPLACE FUNCTION loyalty_record_change() RETURNS trigger
    LANGUAGE plpgsql AS $$ BEGIN
      INSERT INTO loyalty_events(customer_id, operation, actor, before_state, after_state)
      VALUES (
        CASE WHEN TG_TABLE_NAME = 'customers' THEN to_jsonb(NEW)->>'id' ELSE to_jsonb(NEW)->>'customer_id' END,
        CASE WHEN TG_TABLE_NAME = 'customer_aliases' THEN 'ALIAS_' ELSE '' END || TG_OP,
        COALESCE(NULLIF(current_setting('weekend.actor', true), ''), current_user),
        CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) ELSE NULL END,
        to_jsonb(NEW)
      );
      RETURN NEW;
    END $$`,
  `DROP TRIGGER IF EXISTS loyalty_customer_history ON customers`,
  `CREATE TRIGGER loyalty_customer_history AFTER INSERT OR UPDATE ON customers
    FOR EACH ROW EXECUTE FUNCTION loyalty_record_change()`,
  `DROP TRIGGER IF EXISTS loyalty_alias_history ON customer_aliases`,
  `CREATE TRIGGER loyalty_alias_history AFTER INSERT OR UPDATE ON customer_aliases
    FOR EACH ROW EXECUTE FUNCTION loyalty_record_change()`,
  `INSERT INTO loyalty_events(customer_id, operation, actor, after_state)
    SELECT c.id, 'BASELINE', 'migration:2026-10-13', to_jsonb(c) FROM customers c
    WHERE NOT EXISTS (SELECT 1 FROM loyalty_events e WHERE e.customer_id = c.id)`,
];
