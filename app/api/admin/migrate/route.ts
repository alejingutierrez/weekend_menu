/**
 * One-time migration: create the Postgres schema and copy customers from
 * the old Vercel Blob store into Postgres. Admin-session gated, idempotent
 * (existing IDs are kept; contact/code conflicts are reported). Runs inside Vercel where DATABASE_URL and the
 * Blob token are available.
 */

import { NextResponse, type NextRequest } from "next/server";
import { sessionCookieName, verifySessionToken } from "@/lib/auth";
import { bulkImport, ensureSchema, listCustomers } from "@/lib/loyalty-store";
import { decryptJson } from "@/lib/loyalty-crypto";
import type { LoyaltyData } from "@/lib/loyalty-types";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const session = await verifySessionToken(req.cookies.get(sessionCookieName)?.value);
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  await ensureSchema();

  let migrated = 0;
  let fromBlob = 0;
  let alreadyPresent = 0;
  let conflicts: string[] = [];
  try {
    const { list } = await import("@vercel/blob");
    const { blobs } = await list({ prefix: "customers.json", limit: 5 });
    const match = blobs.find((b) => b.pathname === "customers.json");
    if (match) {
      const res = await fetch(`${match.url}?ts=${Date.now()}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`Blob read failed: HTTP ${res.status}`);
      const text = (await res.text()).trim();
      if (text) {
        const data = text.startsWith("{")
          ? (JSON.parse(text) as LoyaltyData)
          : decryptJson<LoyaltyData>(text);
        fromBlob = data.customers?.length ?? 0;
        const result = await bulkImport(data.customers ?? []);
        migrated = result.inserted;
        alreadyPresent = result.alreadyPresent;
        conflicts = result.conflicts;
      }
    }
  } catch (e) {
    console.error("[loyalty] migration failed", e instanceof Error ? e.name : "unknown error");
    return NextResponse.json(
      { error: "migration failed" },
      { status: 500 },
    );
  }

  const total = (await listCustomers()).length;
  return NextResponse.json({ ok: conflicts.length === 0, fromBlob, migrated, alreadyPresent, conflicts, totalInPostgres: total });
}
