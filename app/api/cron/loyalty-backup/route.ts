import { NextResponse, type NextRequest } from "next/server";
import { purgeExpiredRateLimits } from "@/lib/loyalty-store";
import { timingSafeEqual } from "node:crypto";
import { createVerifiedLoyaltyBackup } from "@/lib/loyalty-backup";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export async function GET(req: NextRequest) {
  const expected = process.env.CRON_SECRET
      ? `Bearer ${process.env.CRON_SECRET}`
      : "",
    received = req.headers.get("authorization") ?? "";
  if (
    !expected ||
    Buffer.byteLength(received) !== Buffer.byteLength(expected) ||
    !timingSafeEqual(Buffer.from(received), Buffer.from(expected))
  )
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    await purgeExpiredRateLimits();
    return NextResponse.json(await createVerifiedLoyaltyBackup());
  } catch {
    return NextResponse.json(
      { error: "Backup could not be verified" },
      { status: 503 },
    );
  }
}
