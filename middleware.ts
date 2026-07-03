import { NextResponse, type NextRequest } from "next/server";
import { sessionCookieName, verifySessionToken } from "@/lib/auth";

export const config = {
  matcher: ["/admin/:path*"],
};

export async function middleware(req: NextRequest) {
  // Always allow the login page itself.
  if (req.nextUrl.pathname.startsWith("/admin/login")) {
    return NextResponse.next();
  }
  const token = req.cookies.get(sessionCookieName)?.value;
  const session = await verifySessionToken(token);
  if (!session) {
    // Preserve the full path + query (e.g. /admin/stamp?c=…&t=…) so that
    // scanning a pass QR while logged out lands back on the stamp screen
    // for that exact customer after login.
    const from = req.nextUrl.pathname + req.nextUrl.search;
    const url = req.nextUrl.clone();
    url.pathname = "/admin/login";
    url.search = "";
    url.searchParams.set("from", from);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}
