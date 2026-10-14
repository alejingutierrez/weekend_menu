import "server-only";
import { cookies } from "next/headers";
import { sessionCookieName, verifySessionToken } from "./auth";

/** Server actions must authenticate themselves, including calls outside /admin. */
export async function requireAdmin(): Promise<string> {
  const session = await verifySessionToken((await cookies()).get(sessionCookieName)?.value);
  if (!session) throw new Error("Unauthorized");
  return session.userId;
}
