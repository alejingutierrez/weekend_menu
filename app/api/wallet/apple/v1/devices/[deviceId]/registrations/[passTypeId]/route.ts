import { walletService } from "@/lib/wallet-service";
/**
 * Apple pass web service — list serials of passes that changed for a
 * device since `passesUpdatedSince`. No auth header on this endpoint.
 * Returns 204 when nothing changed.
 */

import { NextResponse, type NextRequest } from "next/server";
import { getSerialsForDevice } from "@/lib/loyalty-store";

import { validAppleIdentifiers } from "@/lib/apple-protocol";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ deviceId: string; passTypeId: string }> },
) {
  return walletService(async () => {
    const { deviceId, passTypeId } = await params;
    if (!validAppleIdentifiers(deviceId, passTypeId))
      return new NextResponse(null, { status: 404 });
    const since =
      req.nextUrl.searchParams.get("passesUpdatedSince") ?? undefined;
    const { serials, lastUpdated } = await getSerialsForDevice(deviceId, since);
    if (serials.length === 0) return new NextResponse(null, { status: 204 });
    return NextResponse.json({ serialNumbers: serials, lastUpdated });
  });
}
