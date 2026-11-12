/**
 * Import the retained historical customer archive into PostgreSQL.
 * Existing identities are kept and contact or code conflicts are reported.
 */

import { NextResponse, type NextRequest } from "next/server";
import { sessionCookieName, verifySessionToken } from "@/lib/auth";
import { bulkImport, ensureSchema, listCustomers } from "@/lib/loyalty-store";
import { decryptJson } from "@/lib/loyalty-crypto";
import { awsStorageBucket, readAwsObject } from "@/lib/aws-storage";
import type { LoyaltyData } from "@/lib/loyalty-types";

export const dynamic = "force-dynamic";

async function readArchive(): Promise<string | undefined> {
  if (awsStorageBucket) return await readAwsObject("legacy-private/customers.json");
  const { list } = await import("@vercel/blob");
  const { blobs } = await list({ prefix: "customers.json", limit: 5 });
  const match = blobs.find((blob) => blob.pathname === "customers.json");
  if (!match) return;
  const response = await fetch(`${match.url}?ts=${Date.now()}`, { cache: "no-store" });
  if (!response.ok) throw new Error(`Historical archive returned HTTP ${response.status}`);
  return await response.text();
}

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
    const text = (await readArchive())?.trim();
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
