/** Owner-applied migration; runtime requests only verify its version. */
export const LOYALTY_SECURITY_VERSION = "2026-10-14-security";
export const LOYALTY_SECURITY_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS app_rate_limits (
    bucket text PRIMARY KEY, window_started timestamptz NOT NULL,
    attempts int NOT NULL, expires_at timestamptz NOT NULL
  )`,
  `INSERT INTO loyalty_schema_migrations(version) VALUES ('2026-10-14-security') ON CONFLICT DO NOTHING`,
];
export const MAX_CARD_DEVICES = 10;
export const MAX_CARD_REGISTRATION_ROWS = 20;
export const MAX_WALLET_ATTEMPTS = 12;
