import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { processWalletQueue } from "@/lib/wallet-sync";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export async function GET(req: NextRequest) {
  const expected = process.env.CRON_SECRET
    ? `Bearer ${process.env.CRON_SECRET}`
    : "";
  const received = req.headers.get("authorization") ?? "";
  if (
    !expected ||
    Buffer.byteLength(received) !== Buffer.byteLength(expected) ||
    !timingSafeEqual(Buffer.from(received), Buffer.from(expected))
  )
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    if (req.nextUrl.searchParams.get("probe") === "1") {
      // Verify APNs with a synthetic token, without addressing customer devices.
      const { sendPassUpdates } = await import("@/lib/apns");
      const [result] = await sendPassUpdates(["0".repeat(64)]);
      const verified =
        result.status === 400 && result.reason === "BadDeviceToken";
      return NextResponse.json(
        {
          connectionVerified: verified,
          status: result.status,
          reason: result.reason ?? "no_reason",
        },
        { status: verified ? 200 : 503 },
      );
    }
    return NextResponse.json(await processWalletQueue(10));
  } catch {
    return NextResponse.json(
      { error: "Wallet retry unavailable" },
      { status: 503 },
    );
  }
}
