/** Device logs can contain secrets and contacts. Record only a bounded count. */
import { NextResponse, type NextRequest } from "next/server";
export const dynamic = "force-dynamic";
export async function POST(req: NextRequest) {
  if (Number(req.headers.get("content-length") ?? 0) > 16384)
    return new NextResponse(null, { status: 200 });
  try {
    const body = await req.json();
    console.info("[apple-pass-log]", {
      entries: Array.isArray(body?.logs) ? Math.min(body.logs.length, 100) : 0,
    });
  } catch {}
  return new NextResponse(null, { status: 200 });
}
