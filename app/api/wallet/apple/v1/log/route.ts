/** Apple pass web service — device log sink. Best-effort; always 200. */

import { NextResponse, type NextRequest } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { logs?: unknown };
    console.log("[apple-pass-log]", body?.logs ?? body);
  } catch {
    // ignore malformed log bodies
  }
  return new NextResponse(null, { status: 200 });
}
