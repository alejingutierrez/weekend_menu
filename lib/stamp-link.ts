/**
 * Builds the signed stamp URL encoded into a customer's barcode /
 * on-screen QR. Staff (logged into /admin on their phone) scan it to
 * add a stamp; the `t` signature prevents tampering and id guessing.
 */

import "server-only";
import { signCustomerId } from "./customer-token";

export async function buildStampUrl(baseUrl: string, id: string): Promise<string> {
  const t = await signCustomerId(id);
  return `${baseUrl}/admin/stamp?c=${encodeURIComponent(id)}&t=${encodeURIComponent(t)}`;
}
