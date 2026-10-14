/**
 * Absolute base URL for building links that must resolve off-device
 * (wallet barcodes, save-to-wallet routes, printable QR codes).
 *
 * Prefers an explicit PUBLIC_BASE_URL; otherwise derives it from the
 * incoming request headers.
 */

import "server-only";
import { headers } from "next/headers";
import { PRODUCTION_LOYALTY_ORIGIN } from "./loyalty-config";

export async function getBaseUrl(): Promise<string> {
  const explicit = process.env.PUBLIC_BASE_URL;
  if (explicit) return explicit.replace(/\/+$/, "");
  if (process.env.VERCEL_ENV === "production") return PRODUCTION_LOYALTY_ORIGIN;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto =
    h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}
