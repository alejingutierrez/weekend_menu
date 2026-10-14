/**
 * Customer / loyalty storage on Postgres (Neon).
 *
 * Every mutation is a single atomic SQL statement, so concurrent stamps
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
  STAMPS_PER_REWARD,
  type AppleRegistration,
  type Customer,
} from "./loyalty-types";

const DB_URL = process.env.DATABASE_URL || process.env.POSTGRES_URL;
const client = DB_URL ? neon(DB_URL) : null;

function sql() {
  if (!client) {
    throw new Error(
      "DATABASE_URL is not set — the loyalty store needs Postgres (Neon).",
    );
  }
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
  const db = sql();
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
  await db.transaction(LOYALTY_RECOVERY_SCHEMA.map((statement) => db.query(statement)));
}

/* ---------- reads ---------- */

export async function getCustomer(id: string): Promise<Customer | null> {
  const rows = (await sql()`SELECT * FROM customers WHERE id = ${id}
    OR id = (SELECT customer_id FROM customer_aliases WHERE alias_id = ${id})`) as Row[];
  return rows[0] ? rowToCustomer(rows[0]) : null;
}

export async function findByCode(code: string): Promise<Customer | null> {
  const norm = normalizeCode(code);
  if (!norm) return null;
  const rows = (await sql()`SELECT * FROM customers WHERE code = ${norm}
    OR id = (SELECT customer_id FROM customer_aliases WHERE alias_code = ${norm})`) as Row[];
  return rows[0] ? rowToCustomer(rows[0]) : null;
}

export async function findByContact(
  email?: string,
  phone?: string,
): Promise<Customer | null> {
  const e = normEmail(email);
  const p = normPhone(phone);
  if (!e && !p) return null;
  const rows = (await sql()`
    SELECT c.*, ARRAY(SELECT a.alias_code FROM customer_aliases a
                     WHERE a.customer_id = c.id ORDER BY a.alias_code) AS aliases
    FROM customers c
    WHERE (${e} <> '' AND lower(email) = ${e})
       OR (${p} <> '' AND phone = ${p})
    LIMIT 1`) as Row[];
  return rows[0] ? rowToCustomer(rows[0]) : null;
}

export async function listCustomers(): Promise<Customer[]> {
  const rows = (await sql()`
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
  const db = sql();
  const email = input.email?.trim() || null;
  const phone = normPhone(input.phone) || null;

  // Dedup: reuse an existing card with the same email/phone.
  const existing = await findByContact(email ?? undefined, phone ?? undefined);
  if (existing) return existing;

  const id = randomUUID();
  for (let attempt = 0; attempt < 8; attempt++) {
    try {
      const rows = (await db`
        INSERT INTO customers (id, code, name, email, phone)
        VALUES (${id}, ${randomCode()}, ${input.name}, ${email}, ${phone})
        RETURNING *`) as Row[];
      return rowToCustomer(rows[0]);
    } catch (e) {
      if ((e as { code?: string }).code !== "23505") throw e;
      // A racing insert with the same contact → return theirs.
      const dup = await findByContact(email ?? undefined, phone ?? undefined);
      if (dup) return dup;
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
export async function addStamp(
  id: string,
  actor = "admin",
): Promise<{ customer: Customer; rewardEarned: boolean } | null> {
  const db = sql();
  const results = await db.transaction([
    db`SELECT set_config('weekend.actor', ${actor}, true)`,
    db`
    WITH old AS (SELECT stamps AS s FROM customers
      WHERE id = ${id} AND archived_at IS NULL FOR UPDATE)
    UPDATE customers c SET
      total_stamps = c.total_stamps + 1,
      last_stamp_at = now(),
      updated_at = now(),
      rewards_available = c.rewards_available
        + (CASE WHEN old.s + 1 >= ${STAMPS_PER_REWARD} THEN 1 ELSE 0 END),
      total_rewards = c.total_rewards
        + (CASE WHEN old.s + 1 >= ${STAMPS_PER_REWARD} THEN 1 ELSE 0 END),
      stamps = CASE WHEN old.s + 1 >= ${STAMPS_PER_REWARD}
        THEN old.s + 1 - ${STAMPS_PER_REWARD} ELSE old.s + 1 END
    FROM old
    WHERE c.id = ${id}
    RETURNING c.*, (old.s + 1 >= ${STAMPS_PER_REWARD}) AS reward_earned`,
  ]);
  const rows = results[1] as Row[];
  if (!rows[0]) return null;
  const customer = rowToCustomer(rows[0]);
  const rewardEarned = rows[0].reward_earned === true;
  await syncWalletsBestEffort(customer);
  return { customer, rewardEarned };
}

/** Redeems one available reward (free burger). Null if none available. */
export async function redeemReward(id: string, actor = "admin"): Promise<Customer | null> {
  const db = sql();
  const results = await db.transaction([
    db`SELECT set_config('weekend.actor', ${actor}, true)`,
    db`
    UPDATE customers
    SET rewards_available = rewards_available - 1, updated_at = now()
    WHERE id = ${id} AND rewards_available > 0 AND archived_at IS NULL
    RETURNING *`,
  ]);
  const rows = results[1] as Row[];
  if (!rows[0]) return null;
  const customer = rowToCustomer(rows[0]);
  await syncWalletsBestEffort(customer);
  return customer;
}

/** Reversible archival: never erase the card, stamps or Wallet registrations. */
export async function archiveCustomer(id: string, actor: string): Promise<boolean> {
  const db = sql();
  const results = await db.transaction([
    db`SELECT set_config('weekend.actor', ${actor}, true)`,
    db`UPDATE customers SET archived_at = now(), archived_by = ${actor}, updated_at = now()
       WHERE id = ${id} AND archived_at IS NULL RETURNING id`,
  ]);
  return results[1].length > 0;
}

export async function restoreCustomer(id: string, actor: string): Promise<boolean> {
  const db = sql();
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
  const db = sql();
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

/** Propagates a change to the customer's wallet passes; never throws. */
async function syncWalletsBestEffort(customer: Customer): Promise<void> {
  try {
    const { syncWallets } = await import("./wallet-sync");
    await syncWallets(customer);
  } catch (e) {
    console.error("[loyalty] wallet sync failed:", e);
  }
}

/* ---------- Apple device registrations (push updates) ---------- */

export async function addAppleRegistration(reg: AppleRegistration): Promise<void> {
  await sql()`
    INSERT INTO apple_registrations (device_library_id, serial, push_token)
    VALUES (${reg.deviceLibraryId}, ${reg.serial}, ${reg.pushToken})
    ON CONFLICT (device_library_id, serial)
    DO UPDATE SET push_token = EXCLUDED.push_token`;
}

export async function removeAppleRegistration(
  deviceLibraryId: string,
  serial: string,
): Promise<boolean> {
  const rows = (await sql()`
    DELETE FROM apple_registrations
    WHERE device_library_id = ${deviceLibraryId} AND serial = ${serial}
    RETURNING serial`) as Row[];
  return rows.length > 0;
}

export async function getRegistrationsForSerial(
  serial: string,
): Promise<AppleRegistration[]> {
  const rows = (await sql()`
    SELECT * FROM apple_registrations WHERE serial = ${serial}
    OR serial IN (SELECT alias_id FROM customer_aliases WHERE customer_id = ${serial})`) as Row[];
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
  const rows = (await sql()`
    SELECT r.serial AS serial, c.updated_at AS updated_at
    FROM apple_registrations r
    JOIN customers c ON c.id = r.serial OR c.id =
      (SELECT customer_id FROM customer_aliases WHERE alias_id = r.serial)
    WHERE r.device_library_id = ${deviceLibraryId}`) as Row[];
  let lastUpdated = updatedSince ?? "1970-01-01T00:00:00.000Z";
  const serials: string[] = [];
  for (const r of rows) {
    const u = iso(r.updated_at);
    if (u > lastUpdated) lastUpdated = u;
    if (!updatedSince || u > updatedSince) serials.push(r.serial as string);
  }
  return { serials, lastUpdated };
}
