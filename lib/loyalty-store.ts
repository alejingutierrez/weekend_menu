/**
 * Customer / loyalty storage on Postgres (Neon).
 *
 * Balance changes and durable operation results commit atomically, so concurrent stamps
 * or registrations can't clobber each other (the problem the old
 * whole-file Blob store had). Dedup and code uniqueness are enforced by
 * unique indexes. Set DATABASE_URL (or POSTGRES_URL) in the environment.
 */

import "server-only";
import { randomInt, randomUUID } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import { LOYALTY_RECOVERY_SCHEMA } from "./loyalty-schema";
import { normalizeCode } from "./loyalty-code";
import {
  ExistingContactError,
  validateJoin,
  validOperationId,
} from "./loyalty-validation";
import { LOYALTY_RESILIENCE_SCHEMA } from "./loyalty-resilience-schema";
import { updatedSerials } from "./apple-protocol";
import type { LoyaltyBackup } from "./loyalty-backup-format";
import { assertLoyaltyDatabase, assertLoyaltyBranch } from "./loyalty-config";
import {
  STAMPS_PER_REWARD,
  type AppleRegistration,
  type Customer,
} from "./loyalty-types";

const DB_URL = process.env.DATABASE_URL || process.env.POSTGRES_URL;
assertLoyaltyDatabase(DB_URL, process.env.VERCEL_ENV);
const client = DB_URL ? neon(DB_URL) : null;

async function sql() {
  if (!client) {
    throw new Error(
      "DATABASE_URL is not set — the loyalty store needs Postgres (Neon).",
    );
  }
  const rows =
    await client`SELECT current_setting('neon.branch_id', true) AS branch_id`;
  const branch = String(rows[0]?.branch_id ?? "");
  assertLoyaltyBranch(branch, process.env.VERCEL_ENV);
  if (
    process.env.VERCEL_ENV !== "production" &&
    branch === "br-crimson-fire-ac3ov0rp"
  )
    throw new Error(
      "Non-production runtime cannot access the production loyalty database.",
    );
  return client;
}

/* ---------- helpers ---------- */

// No I/O/0/1 so codes are unambiguous when read aloud at the counter.
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function randomCode(): string {
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  }
  return code;
}

function normEmail(e?: string | null): string {
  return (e ?? "").trim().toLowerCase();
}
function normPhone(p?: string | null): string {
  return (p ?? "").replace(/\D/g, "");
}

function iso(v: unknown): string {
  return v ? new Date(v as string | number | Date).toISOString() : "";
}

type Row = Record<string, unknown>;

function rowToCustomer(r: Row): Customer {
  return {
    id: r.id as string,
    code: r.code as string,
    name: r.name as string,
    email: (r.email as string) || undefined,
    phone: (r.phone as string) || undefined,
    stamps: Number(r.stamps),
    rewardsAvailable: Number(r.rewards_available),
    totalStamps: Number(r.total_stamps),
    totalRewards: Number(r.total_rewards),
    createdAt: iso(r.created_at),
    updatedAt: iso(r.updated_at),
    lastStampAt: r.last_stamp_at ? iso(r.last_stamp_at) : undefined,
    archivedAt: r.archived_at ? iso(r.archived_at) : undefined,
    archivedBy: (r.archived_by as string) || undefined,
    aliases: (r.aliases as string[]) || [],
  };
}

/** Idempotent schema creation. Safe to call repeatedly. */
export async function ensureSchema(): Promise<void> {
  const db = await sql();
  await db`CREATE TABLE IF NOT EXISTS customers (
    id text PRIMARY KEY,
    code text UNIQUE NOT NULL,
    name text NOT NULL,
    email text,
    phone text,
    stamps int NOT NULL DEFAULT 0,
    rewards_available int NOT NULL DEFAULT 0,
    total_stamps int NOT NULL DEFAULT 0,
    total_rewards int NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    last_stamp_at timestamptz
  )`;
  await db`CREATE UNIQUE INDEX IF NOT EXISTS customers_email_key
    ON customers (lower(email)) WHERE email IS NOT NULL AND email <> ''`;
  await db`CREATE UNIQUE INDEX IF NOT EXISTS customers_phone_key
    ON customers (phone) WHERE phone IS NOT NULL AND phone <> ''`;
  await db`CREATE TABLE IF NOT EXISTS apple_registrations (
    device_library_id text NOT NULL,
    serial text NOT NULL,
    push_token text NOT NULL,
    registered_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (device_library_id, serial)
  )`;
  await db`CREATE INDEX IF NOT EXISTS apple_reg_serial
    ON apple_registrations (serial)`;
  await db.transaction(
    LOYALTY_RECOVERY_SCHEMA.map((statement) => db.query(statement)),
  );
  await db.transaction(
    LOYALTY_RESILIENCE_SCHEMA.map((statement) => db.query(statement)),
  );
}

/* ---------- reads ---------- */

export async function getCustomer(id: string): Promise<Customer | null> {
  const db = await sql();
  const rows = (await db`SELECT * FROM customers WHERE id = ${id}
    OR id = (SELECT customer_id FROM customer_aliases WHERE alias_id = ${id})`) as Row[];
  return rows[0] ? rowToCustomer(rows[0]) : null;
}

export async function findByCode(code: string): Promise<Customer | null> {
  const db = await sql();
  const norm = normalizeCode(code);
  if (!norm) return null;
  const rows = (await db`SELECT * FROM customers WHERE code = ${norm}
    OR id = (SELECT customer_id FROM customer_aliases WHERE alias_code = ${norm})`) as Row[];
  return rows[0] ? rowToCustomer(rows[0]) : null;
}

/** Retain staff-observed failed scans without storing the signed QR token. */
export async function recordFailedScan(
  reference: string | undefined,
  reason: "invalid_signature" | "customer_missing" | "archived",
  actor: string,
): Promise<void> {
  const id =
    reference && /^[0-9a-f-]{36}$/i.test(reference) ? reference : "unknown-qr";
  try {
    const db = await sql();
    await db`INSERT INTO loyalty_events(customer_id, operation, actor, after_state)
      VALUES (${id}, 'SCAN_FAILED', ${actor}, ${JSON.stringify({ reason })}::jsonb)`;
  } catch {
    console.error("[loyalty] could not record failed scan", { reason });
  }
}

export async function findByContact(
  email?: string,
  phone?: string,
): Promise<Customer | null> {
  const db = await sql();
  const e = normEmail(email);
  const p = normPhone(phone);
  if (!e && !p) return null;
  const rows = (await db`
    SELECT c.*, ARRAY(SELECT a.alias_code FROM customer_aliases a
                     WHERE a.customer_id = c.id ORDER BY a.alias_code) AS aliases
    FROM customers c
    WHERE (${e} <> '' AND lower(email) = ${e})
       OR (${p} <> '' AND phone = ${p})
    LIMIT 2`) as Row[];
  if (rows.length > 1) throw new ExistingContactError();
  return rows[0] ? rowToCustomer(rows[0]) : null;
}

export async function listCustomers(): Promise<Customer[]> {
  const db = await sql();
  const rows = (await db`
    SELECT c.*, ARRAY(SELECT a.alias_code FROM customer_aliases a
                     WHERE a.customer_id = c.id ORDER BY a.alias_code) AS aliases
    FROM customers c
    ORDER BY COALESCE(last_stamp_at, created_at) DESC`) as Row[];
  return rows.map(rowToCustomer);
}

/* ---------- mutations ---------- */

export async function createCustomer(input: {
  name: string;
  email?: string;
  phone?: string;
}): Promise<Customer> {
  const db = await sql();
  const { name, email, phone } = validateJoin(input);

  // Existing contacts require authenticated staff recovery, never a public redirect.
  const existing = await findByContact(email ?? undefined, phone ?? undefined);
  if (existing) throw new ExistingContactError();

  const id = randomUUID();
  for (let attempt = 0; attempt < 8; attempt++) {
    try {
      const rows = (await db`
        INSERT INTO customers (id, code, name, email, phone)
        VALUES (${id}, ${randomCode()}, ${name}, ${email}, ${phone})
        RETURNING *`) as Row[];
      return rowToCustomer(rows[0]);
    } catch (e) {
      if ((e as { code?: string }).code !== "23505") throw e;
      // A racing insert with the same contact must not expose their private card.
      const dup = await findByContact(email ?? undefined, phone ?? undefined);
      if (dup) throw new ExistingContactError();
      // Otherwise assume a code collision and retry with a new code.
      if (attempt === 7) throw e;
    }
  }
  throw new Error("could not create customer");
}

/**
 * Adds one stamp atomically. When the card fills up it resets to 0 and
 * grants a reward. The CTE locks the row so concurrent stamps can't race.
 */
/** A durable operation key makes double submissions and uncertain retries safe. */
async function mutateBalance(
  id: string,
  actor: string,
  operationId: string,
  kind: "STAMP" | "REDEEM",
): Promise<Row | null> {
  if (!validOperationId(operationId))
    throw new Error("Invalid operation reference");
  const db = await sql();
  const change =
    kind === "STAMP"
      ? db`
    WITH old AS (SELECT stamps AS s FROM customers WHERE id=${id} AND archived_at IS NULL
      AND EXISTS (SELECT 1 FROM loyalty_operations WHERE operation_id=${operationId}::uuid
        AND customer_id=${id} AND kind=${kind} AND result IS NULL AND completed_at IS NULL) FOR NO KEY UPDATE),
    changed AS (
      UPDATE customers c SET total_stamps=c.total_stamps+1, last_stamp_at=clock_timestamp(), updated_at=clock_timestamp(),
        rewards_available=c.rewards_available+CASE WHEN old.s+1>=10 THEN 1 ELSE 0 END,
        total_rewards=c.total_rewards+CASE WHEN old.s+1>=10 THEN 1 ELSE 0 END,
        stamps=(old.s+1)%10 FROM old WHERE c.id=${id}
      RETURNING c.*, (old.s+1>=10) AS reward_earned)
    UPDATE loyalty_operations SET result=(SELECT to_jsonb(changed) FROM changed), completed_at=clock_timestamp()
    WHERE operation_id=${operationId}::uuid AND customer_id=${id} AND kind=${kind} AND completed_at IS NULL`
      : db`
    WITH changed AS (UPDATE customers SET rewards_available=rewards_available-1, updated_at=clock_timestamp()
      WHERE id=${id} AND archived_at IS NULL AND rewards_available>0
        AND EXISTS (SELECT 1 FROM loyalty_operations WHERE operation_id=${operationId}::uuid
          AND customer_id=${id} AND kind=${kind} AND result IS NULL AND completed_at IS NULL)
      RETURNING *)
    UPDATE loyalty_operations SET result=(SELECT to_jsonb(changed) FROM changed), completed_at=clock_timestamp()
    WHERE operation_id=${operationId}::uuid AND customer_id=${id} AND kind=${kind} AND completed_at IS NULL`;
  const result = await db.transaction([
    db`SELECT set_config('weekend.actor', ${actor}, true)`,
    db`INSERT INTO loyalty_operations(operation_id,customer_id,kind,actor)
       SELECT ${operationId}::uuid,id,${kind},${actor} FROM customers WHERE id=${id}
       ON CONFLICT DO NOTHING`,
    change,
    db`SELECT result FROM loyalty_operations WHERE operation_id=${operationId}::uuid AND customer_id=${id} AND kind=${kind}`,
  ]);
  const row = result[3][0]?.result as Row | undefined;
  if (!row) return null;
  // The DB trigger already persisted the delivery job in the same transaction.
  try {
    const { processWalletQueue } = await import("./wallet-sync");
    await processWalletQueue(1, id);
  } catch {
    console.error("[loyalty] Wallet delivery retained for retry");
  }
  return row;
}

export async function addStamp(
  id: string,
  actor = "admin",
  operationId: string = randomUUID(),
): Promise<{ customer: Customer; rewardEarned: boolean } | null> {
  const row = await mutateBalance(id, actor, operationId, "STAMP");
  return row
    ? { customer: rowToCustomer(row), rewardEarned: row.reward_earned === true }
    : null;
}

export async function redeemReward(
  id: string,
  actor = "admin",
  operationId: string = randomUUID(),
): Promise<Customer | null> {
  const row = await mutateBalance(id, actor, operationId, "REDEEM");
  return row ? rowToCustomer(row) : null;
}

/** Reversible archival: never erase the card, stamps or Wallet registrations. */
export async function archiveCustomer(
  id: string,
  actor: string,
): Promise<boolean> {
  const db = await sql();
  const results = await db.transaction([
    db`SELECT set_config('weekend.actor', ${actor}, true)`,
    db`UPDATE customers SET archived_at = now(), archived_by = ${actor}, updated_at = now()
       WHERE id = ${id} AND archived_at IS NULL RETURNING id`,
  ]);
  return results[1].length > 0;
}

export async function restoreCustomer(
  id: string,
  actor: string,
): Promise<boolean> {
  const db = await sql();
  const results = await db.transaction([
    db`SELECT set_config('weekend.actor', ${actor}, true)`,
    db`UPDATE customers SET archived_at = NULL, archived_by = NULL, updated_at = now()
       WHERE id = ${id} AND archived_at IS NOT NULL RETURNING id`,
  ]);
  return results[1].length > 0;
}

/** Imports without overwriting balances and reports every unresolved conflict. */
export async function bulkImport(
  customers: Customer[],
): Promise<{ inserted: number; alreadyPresent: number; conflicts: string[] }> {
  const db = await sql();
  let inserted = 0;
  let alreadyPresent = 0;
  const conflicts: string[] = [];
  for (const c of customers) {
    const email = (c.email ?? "").trim() || null;
    const phone = normPhone(c.phone) || null;
    try {
      const r = (await db`
        INSERT INTO customers
          (id, code, name, email, phone, stamps, rewards_available,
           total_stamps, total_rewards, created_at, updated_at, last_stamp_at)
        VALUES (${c.id}, ${c.code}, ${c.name}, ${email}, ${phone}, ${c.stamps},
           ${c.rewardsAvailable}, ${c.totalStamps}, ${c.totalRewards},
           ${c.createdAt}, ${c.updatedAt}, ${c.lastStampAt ?? null})
        ON CONFLICT (id) DO NOTHING
        RETURNING id`) as Row[];
      if (r.length) inserted++;
      else alreadyPresent++;
    } catch (e) {
      if ((e as { code?: string }).code !== "23505") throw e;
      // Keep a visible inventory of unresolved cards. Never silently discard them.
      conflicts.push(c.code);
    }
  }
  return { inserted, alreadyPresent, conflicts };
}

/* ---------- Apple device registrations (push updates) ---------- */

export async function addAppleRegistration(
  reg: AppleRegistration,
): Promise<boolean> {
  const db = await sql();
  const rows = await db`
    INSERT INTO apple_registrations (device_library_id, serial, push_token)
    VALUES (${reg.deviceLibraryId}, ${reg.serial}, ${reg.pushToken})
    ON CONFLICT (device_library_id, serial)
    DO UPDATE SET push_token = EXCLUDED.push_token, revoked_at=NULL, updated_at=clock_timestamp()
    RETURNING (xmax=0) AS inserted`;
  return rows[0].inserted === true;
}

export async function removeAppleRegistration(
  deviceLibraryId: string,
  serial: string,
): Promise<boolean> {
  const db = await sql();
  const rows = (await db`
    DELETE FROM apple_registrations
    WHERE device_library_id = ${deviceLibraryId} AND serial = ${serial}
    RETURNING serial`) as Row[];
  return rows.length > 0;
}

export async function getRegistrationsForSerial(
  serial: string,
): Promise<AppleRegistration[]> {
  const db = await sql();
  const rows = (await db`
    SELECT * FROM apple_registrations WHERE revoked_at IS NULL AND (serial = ${serial}
    OR serial IN (SELECT alias_id FROM customer_aliases WHERE customer_id = ${serial}))`) as Row[];
  return rows.map((r) => ({
    serial: r.serial as string,
    deviceLibraryId: r.device_library_id as string,
    pushToken: r.push_token as string,
    registeredAt: iso(r.registered_at),
  }));
}

export async function getSerialsForDevice(
  deviceLibraryId: string,
  updatedSince?: string,
): Promise<{ serials: string[]; lastUpdated: string }> {
  const db = await sql();
  const rows = (await db`
    SELECT r.serial AS serial, to_char(GREATEST(c.updated_at,r.updated_at) AT TIME ZONE 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS update_tag
    FROM apple_registrations r
    JOIN customers c ON c.id = r.serial OR c.id =
      (SELECT customer_id FROM customer_aliases WHERE alias_id = r.serial)
    WHERE r.device_library_id = ${deviceLibraryId} AND r.revoked_at IS NULL`) as Row[];
  return updatedSerials(
    rows.map((r) => ({
      serial: String(r.serial),
      updatedAt: String(r.update_tag),
    })),
    updatedSince,
  );
}

/** Retire invalid Apple devices without erasing their registration history. */
export async function revokeApplePushToken(token: string): Promise<void> {
  const db = await sql();
  await db`UPDATE apple_registrations SET revoked_at=clock_timestamp(), updated_at=clock_timestamp()
    WHERE push_token=${token} AND revoked_at IS NULL`;
}

export async function claimWalletJobs(limit: number, customerId?: string) {
  const db = await sql();
  const lease = randomUUID();
  const rows = await db`WITH due AS (
    SELECT customer_id FROM wallet_sync_jobs WHERE available_at<=now()
      AND (locked_until IS NULL OR locked_until<now()) AND (${customerId ?? null}::text IS NULL OR customer_id=${customerId ?? null})
    ORDER BY available_at LIMIT ${Math.min(25, Math.max(1, limit))} FOR UPDATE SKIP LOCKED)
    UPDATE wallet_sync_jobs j SET lease_id=${lease}::uuid, locked_until=now()+interval '90 seconds', attempts=attempts+1
    FROM due WHERE j.customer_id=due.customer_id RETURNING j.*`;
  return rows.map((r) => ({
    customerId: String(r.customer_id),
    revision: String(r.revision),
    lease: String(r.lease_id),
    attempts: Number(r.attempts),
  }));
}

export async function finishWalletJob(
  job: { customerId: string; revision: string; lease: string },
  error?: string,
  delay = 60,
) {
  const db = await sql();
  if (!error)
    await db`DELETE FROM wallet_sync_jobs WHERE customer_id=${job.customerId} AND revision=${job.revision}::bigint AND lease_id=${job.lease}::uuid`;
  await db`UPDATE wallet_sync_jobs SET lease_id=NULL,locked_until=NULL,
    available_at=CASE WHEN revision<>${job.revision}::bigint THEN now() ELSE now()+${delay}*interval '1 second' END,
    last_error=${error ?? null} WHERE customer_id=${job.customerId} AND lease_id=${job.lease}::uuid`;
}

export async function walletQueueStatus() {
  const db = await sql();
  const rows =
    await db`SELECT count(*)::int AS pending, count(*) FILTER(WHERE attempts>0)::int AS retries FROM wallet_sync_jobs`;
  return { pending: Number(rows[0].pending), retries: Number(rows[0].retries) };
}

export async function missingCardTokenSerials(): Promise<string[]> {
  const db = await sql();
  const rows =
    await db`SELECT serial FROM (SELECT id AS serial FROM customers UNION SELECT alias_id FROM customer_aliases) cards
    WHERE NOT EXISTS(SELECT 1 FROM loyalty_card_tokens t WHERE t.serial=cards.serial)`;
  return rows.map((r) => String(r.serial));
}

export async function saveCardTokens(
  tokens: { serial: string; token: string }[],
): Promise<void> {
  const db = await sql();
  if (!tokens.length) return;
  await db`INSERT INTO loyalty_card_tokens(serial,token)
    SELECT serial,token FROM jsonb_to_recordset(${JSON.stringify(tokens)}::jsonb) AS t(serial text,token text)
    ON CONFLICT DO NOTHING`;
}

export async function storedCardToken(serial: string): Promise<string | null> {
  const db = await sql();
  const rows =
    await db`SELECT token FROM loyalty_card_tokens WHERE serial=${serial}`;
  return rows[0] ? String(rows[0].token) : null;
}

export async function loyaltyHealth() {
  const db = await sql();
  const rows = await db`SELECT
    (SELECT count(*)::int FROM customers) AS cards,
    (SELECT COALESCE(sum(total_stamps),0)::int FROM customers) AS total_stamps,
    (SELECT count(*)::int FROM apple_registrations WHERE revoked_at IS NULL) AS devices,
    (SELECT count(*)::int FROM wallet_sync_jobs) AS pending_wallets,
    (SELECT count(*)::int FROM customers WHERE stamps<0 OR stamps>9 OR rewards_available<0
      OR rewards_available>total_rewards OR total_stamps::bigint<>total_rewards::bigint*10+stamps) AS invalid_balances,
    (SELECT count(*)::int FROM customers c WHERE NOT EXISTS(SELECT 1 FROM loyalty_events e WHERE e.customer_id=c.id)) AS missing_history,
    (SELECT count(*)::int FROM apple_registrations r WHERE NOT EXISTS(SELECT 1 FROM customers WHERE id=r.serial)
      AND NOT EXISTS(SELECT 1 FROM customer_aliases WHERE alias_id=r.serial)) AS orphan_devices,
    (SELECT count(*)::int FROM pg_trigger WHERE tgname LIKE 'loyalty_%' AND tgenabled<>'D' AND NOT tgisinternal) AS triggers,
    (SELECT count(*)::int FROM pg_constraint WHERE conname='customers_balances_valid' AND convalidated) AS balance_constraints`;
  const r = rows[0];
  return {
    cards: Number(r.cards),
    totalStamps: Number(r.total_stamps),
    devices: Number(r.devices),
    pendingWallets: Number(r.pending_wallets),
    healthy:
      Number(r.cards) > 0 &&
      Number(r.invalid_balances) === 0 &&
      Number(r.missing_history) === 0 &&
      Number(r.orphan_devices) === 0 &&
      Number(r.triggers) >= 19 &&
      Number(r.balance_constraints) === 1,
  };
}

export async function readLoyaltyBackup(): Promise<LoyaltyBackup> {
  const db = await sql();
  const rows =
    await db`SELECT jsonb_build_object('version',1,'createdAt',clock_timestamp(),
    'customers',(SELECT COALESCE(jsonb_agg(to_jsonb(c) ORDER BY id),'[]') FROM customers c),
    'aliases',(SELECT COALESCE(jsonb_agg(to_jsonb(a) ORDER BY alias_id),'[]') FROM customer_aliases a),
    'registrations',(SELECT COALESCE(jsonb_agg(to_jsonb(r) ORDER BY device_library_id,serial),'[]') FROM apple_registrations r),
    'events',(SELECT COALESCE(jsonb_agg(to_jsonb(e) ORDER BY id),'[]') FROM loyalty_events e),
    'operations',(SELECT COALESCE(jsonb_agg(to_jsonb(o) ORDER BY operation_id),'[]') FROM loyalty_operations o),
    'tokens',(SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY serial),'[]') FROM loyalty_card_tokens t)) AS backup`;
  return rows[0].backup as LoyaltyBackup;
}
export async function recordLoyaltyBackup(
  url: string,
  digest: string,
  cards: number,
) {
  const db = await sql();
  await db`INSERT INTO loyalty_backup_runs(blob_url,digest,cards) VALUES(${url},${digest},${cards})`;
}
export async function lastLoyaltyBackup() {
  const db = await sql();
  const rows =
    await db`SELECT cards,verified_at FROM loyalty_backup_runs ORDER BY verified_at DESC LIMIT 1`;
  return rows[0]
    ? { cards: Number(rows[0].cards), verifiedAt: iso(rows[0].verified_at) }
    : null;
}
