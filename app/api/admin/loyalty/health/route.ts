import { NextResponse, type NextRequest } from "next/server";
import { sessionCookieName, verifySessionToken } from "@/lib/auth";
import { loyaltyHealth } from "@/lib/loyalty-store";
import { appleCertificateStatus } from "@/lib/apple-wallet";
export const dynamic = "force-dynamic";
export async function GET(req: NextRequest) {
  if (!(await verifySessionToken(req.cookies.get(sessionCookieName)?.value)))
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const data = await loyaltyHealth();
    return NextResponse.json(
      { ...data, apple: appleCertificateStatus() },
      {
        status: data.healthy ? 200 : 503,
        headers: { "Cache-Control": "no-store" },
      },
    );
  } catch {
    return NextResponse.json(
      { error: "Data service temporarily unavailable" },
      { status: 503, headers: { "Retry-After": "30" } },
    );
  }
}
