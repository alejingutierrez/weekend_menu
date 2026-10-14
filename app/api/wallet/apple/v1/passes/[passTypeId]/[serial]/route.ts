import { walletService } from "@/lib/wallet-service";
/**
 * Apple pass web service — return the latest .pkpass for a serial.
 * Requires `Authorization: ApplePass <authenticationToken>`.
 */

import { NextResponse, type NextRequest } from "next/server";
import { getCustomer } from "@/lib/loyalty-store";
import { getBaseUrl } from "@/lib/base-url";
import { buildStampUrl } from "@/lib/stamp-link";
import {
  appleConfigured,
  buildPkpass,
  verifyApplePassAuth,
} from "@/lib/apple-wallet";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ passTypeId: string; serial: string }> },
) {
  return walletService(async () => {
    const { serial, passTypeId } = await params;
    if (passTypeId !== process.env.APPLE_PASS_TYPE_ID)
      return new NextResponse(null, { status: 404 });
    if (
      !(await verifyApplePassAuth(req.headers.get("authorization"), serial))
    ) {
      return new NextResponse(null, { status: 401 });
    }
    if (!appleConfigured()) return new NextResponse(null, { status: 503 });

    const customer = await getCustomer(serial);
    if (!customer) return new NextResponse(null, { status: 404 });

    const baseUrl = await getBaseUrl();
    const stampUrl = await buildStampUrl(baseUrl, serial);
    const modified = new Date(customer.updatedAt).toUTCString();
    if (
      Date.parse(customer.updatedAt) <=
      Date.parse(req.headers.get("if-modified-since") ?? "")
    )
      return new NextResponse(null, {
        status: 304,
        headers: { "Last-Modified": modified },
      });
    let pkpass;
    try {
      pkpass = await buildPkpass(
        { ...customer, id: serial },
        stampUrl,
        baseUrl,
      );
    } catch {
      return new NextResponse(null, {
        status: 503,
        headers: { "Retry-After": "60" },
      });
    }

    return new NextResponse(pkpass, {
      headers: {
        "Content-Type": "application/vnd.apple.pkpass",
        "Last-Modified": new Date(customer.updatedAt).toUTCString(),
        "Cache-Control": "no-store",
      },
    });
  });
}
