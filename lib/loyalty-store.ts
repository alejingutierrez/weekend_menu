/**
 * Customer / loyalty storage. Mirrors `lib/menu-store.ts`: uses Vercel
 * Blob when `BLOB_READ_WRITE_TOKEN` is set, else a local
 * `data/customers.json` file for dev.
 *
 * Unlike the menu, blob contents are encrypted (see `loyalty-crypto.ts`)
 * because they contain PII and blob URLs are public.
 *
 * Concurrency note: writes serialize the whole customer list (same
 * approach as the menu). For a single-location restaurant with one
 * counter this is fine; if two stamps land in the exact same instant one
 * could be lost. Moving the counters to Vercel KV/Postgres with atomic
 * increments is the upgrade path if that ever matters.
 */

import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import { randomBytes, randomUUID } from "node:crypto";
import {
  STAMPS_PER_REWARD,
  type AppleRegistration,
  type Customer,
  type LoyaltyData,
} from "./loyalty-types";

const FILE_PATH = path.join(process.cwd(), "data", "customers.json");
const BLOB_KEY = "customers.json";
const BLOB_TOKEN = process.env.BLOB_READ_WRITE_TOKEN;

const EMPTY: LoyaltyData = { customers: [] };

/* ---------- storage backends ---------- */

function normalize(raw: unknown): LoyaltyData {
  const d = raw as LoyaltyData;
  if (!d || !Array.isArray(d.customers)) return { customers: [] };
  for (const c of d.customers) {
    if (!c.updatedAt) c.updatedAt = c.lastStampAt ?? c.createdAt;
  }
  return d;
}

async function readFromBlob(): Promise<LoyaltyData | null> {
  try {
    const { list } = await import("@vercel/blob");
    const { blobs } = await list({ prefix: BLOB_KEY, limit: 5 });
    const match = blobs.find((b) => b.pathname === BLOB_KEY);
    if (!match) return { customers: [] }; // not seeded yet → start empty
    // Cache-bust: Vercel Blob serves public URLs from a long-lived CDN cache,
    // so a fixed-pathname blob would return a stale copy right after a write
    // (a just-registered customer would 404). A unique query forces origin.
    const res = await fetch(`${match.url}?ts=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) return null;
    const text = (await res.text()).trim();
    if (!text) return { customers: [] };
    if (text.startsWith("{")) return normalize(JSON.parse(text)); // legacy plaintext
    const { decryptJson } = await import("./loyalty-crypto");
    return normalize(decryptJson<LoyaltyData>(text));
  } catch {
    return null;
  }
}

async function writeToBlob(data: LoyaltyData): Promise<void> {
  const { put } = await import("@vercel/blob");
  const { encryptJson } = await import("./loyalty-crypto");
  await put(BLOB_KEY, encryptJson(data), {
    access: "public",
    addRandomSuffix: false,
    contentType: "text/plain",
    allowOverwrite: true,
    cacheControlMaxAge: 0, // don't let the CDN cache customer data
  });
}

async function readFromFile(): Promise<LoyaltyData> {
  try {
    const raw = await fs.readFile(FILE_PATH, "utf8");
    return normalize(JSON.parse(raw));
  } catch (e) {
    if ((e as NodeJS.ErrnoException)?.code === "ENOENT") return { customers: [] };
    throw e;
  }
}

async function writeToFile(data: LoyaltyData): Promise<void> {
  await fs.writeFile(FILE_PATH, JSON.stringify(data, null, 2) + "\n", "utf8");
}

async function readLoyalty(): Promise<LoyaltyData> {
  if (BLOB_TOKEN) {
    const fromBlob = await readFromBlob();
    if (fromBlob) return fromBlob;
  }
  return readFromFile();
}

async function writeLoyalty(data: LoyaltyData): Promise<void> {
  if (BLOB_TOKEN) {
    await writeToBlob(data);
    return;
  }
  await writeToFile(data);
}

/* ---------- helpers ---------- */

// No I/O/0/1 to keep codes unambiguous when read aloud at the counter.
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function makeCode(existing: Customer[]): string {
  const used = new Set(existing.map((c) => c.code));
  for (let attempt = 0; attempt < 50; attempt++) {
    const bytes = randomBytes(6);
    let code = "";
    for (const b of bytes) code += CODE_ALPHABET[b % CODE_ALPHABET.length];
    if (!used.has(code)) return code;
  }
  return randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase();
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

/* ---------- public API ---------- */

export async function getCustomer(id: string): Promise<Customer | null> {
  const data = await readLoyalty();
  return data.customers.find((c) => c.id === id) ?? null;
}

export async function findByCode(code: string): Promise<Customer | null> {
  const norm = code.trim().toUpperCase();
  if (!norm) return null;
  const data = await readLoyalty();
  return data.customers.find((c) => c.code === norm) ?? null;
}

export async function listCustomers(): Promise<Customer[]> {
  const data = await readLoyalty();
  return [...data.customers].sort((a, b) =>
    (b.lastStampAt ?? b.createdAt).localeCompare(a.lastStampAt ?? a.createdAt),
  );
}

function normEmail(e?: string): string {
  return (e ?? "").trim().toLowerCase();
}
function normPhone(p?: string): string {
  return (p ?? "").replace(/\D/g, "");
}

/** Finds an existing customer by (normalized) email or phone. */
export async function findByContact(
  email?: string,
  phone?: string,
): Promise<Customer | null> {
  const e = normEmail(email);
  const p = normPhone(phone);
  if (!e && !p) return null;
  const data = await readLoyalty();
  return (
    data.customers.find(
      (c) => (e && normEmail(c.email) === e) || (p && normPhone(c.phone) === p),
    ) ?? null
  );
}

export async function createCustomer(input: {
  name: string;
  email?: string;
  phone?: string;
}): Promise<Customer> {
  const data = await readLoyalty();
  // Dedup: reuse an existing card with the same email/phone so a customer
  // never ends up with several cards.
  const email = normEmail(input.email);
  const phone = normPhone(input.phone);
  const existing = data.customers.find(
    (c) => (email && normEmail(c.email) === email) || (phone && normPhone(c.phone) === phone),
  );
  if (existing) return existing;

  const now = new Date().toISOString();
  const customer: Customer = {
    id: randomUUID(),
    code: makeCode(data.customers),
    name: input.name,
    email: input.email,
    phone: input.phone,
    stamps: 0,
    rewardsAvailable: 0,
    totalStamps: 0,
    totalRewards: 0,
    createdAt: now,
    updatedAt: now,
  };
  data.customers.push(customer);
  await writeLoyalty(data);
  return customer;
}

/**
 * Adds one stamp. When the card fills up (STAMPS_PER_REWARD), it resets
 * to 0 and grants one reward. Returns the updated customer and whether a
 * reward was just earned, or null if the id is unknown.
 */
export async function addStamp(
  id: string,
): Promise<{ customer: Customer; rewardEarned: boolean } | null> {
  const data = await readLoyalty();
  const customer = data.customers.find((c) => c.id === id);
  if (!customer) return null;

  const now = new Date().toISOString();
  customer.stamps += 1;
  customer.totalStamps += 1;
  customer.lastStampAt = now;
  customer.updatedAt = now;

  let rewardEarned = false;
  if (customer.stamps >= STAMPS_PER_REWARD) {
    customer.stamps -= STAMPS_PER_REWARD;
    customer.rewardsAvailable += 1;
    customer.totalRewards += 1;
    rewardEarned = true;
  }

  await writeLoyalty(data);
  await syncWalletsBestEffort(customer);
  return { customer, rewardEarned };
}

/** Redeems one available reward (free burger). Null if none available. */
export async function redeemReward(id: string): Promise<Customer | null> {
  const data = await readLoyalty();
  const customer = data.customers.find((c) => c.id === id);
  if (!customer || customer.rewardsAvailable <= 0) return null;
  customer.rewardsAvailable -= 1;
  customer.updatedAt = new Date().toISOString();
  await writeLoyalty(data);
  await syncWalletsBestEffort(customer);
  return customer;
}

/** Permanently deletes a customer and their device registrations. */
export async function deleteCustomer(id: string): Promise<boolean> {
  const data = await readLoyalty();
  const before = data.customers.length;
  data.customers = data.customers.filter((c) => c.id !== id);
  if (data.customers.length === before) return false;
  if (data.appleRegistrations?.length) {
    data.appleRegistrations = data.appleRegistrations.filter((r) => r.serial !== id);
  }
  await writeLoyalty(data);
  return true;
}

/* ---------- Apple device registrations (push updates) ---------- */

export async function addAppleRegistration(reg: AppleRegistration): Promise<void> {
  const data = await readLoyalty();
  const list = (data.appleRegistrations ??= []);
  const existing = list.find(
    (r) => r.deviceLibraryId === reg.deviceLibraryId && r.serial === reg.serial,
  );
  if (existing) existing.pushToken = reg.pushToken;
  else list.push(reg);
  await writeLoyalty(data);
}

export async function removeAppleRegistration(
  deviceLibraryId: string,
  serial: string,
): Promise<boolean> {
  const data = await readLoyalty();
  const list = data.appleRegistrations ?? [];
  const kept = list.filter(
    (r) => !(r.deviceLibraryId === deviceLibraryId && r.serial === serial),
  );
  if (kept.length === list.length) return false;
  data.appleRegistrations = kept;
  await writeLoyalty(data);
  return true;
}

export async function getRegistrationsForSerial(
  serial: string,
): Promise<AppleRegistration[]> {
  const data = await readLoyalty();
  return (data.appleRegistrations ?? []).filter((r) => r.serial === serial);
}

/**
 * Serials registered to a device that changed since `updatedSince`, plus
 * a new opaque `lastUpdated` tag (ISO time, sorts chronologically). Used
 * by Apple's "get serials" endpoint.
 */
export async function getSerialsForDevice(
  deviceLibraryId: string,
  updatedSince?: string,
): Promise<{ serials: string[]; lastUpdated: string }> {
  const data = await readLoyalty();
  const byId = new Map(data.customers.map((c) => [c.id, c]));
  const mine = (data.appleRegistrations ?? []).filter(
    (r) => r.deviceLibraryId === deviceLibraryId,
  );
  let lastUpdated = updatedSince ?? "1970-01-01T00:00:00.000Z";
  const serials: string[] = [];
  for (const r of mine) {
    const c = byId.get(r.serial);
    if (!c) continue;
    if (c.updatedAt > lastUpdated) lastUpdated = c.updatedAt;
    if (!updatedSince || c.updatedAt > updatedSince) serials.push(r.serial);
  }
  return { serials, lastUpdated };
}
