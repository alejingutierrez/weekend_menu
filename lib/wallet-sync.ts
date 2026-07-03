/**
 * Best-effort propagation of a customer's current state to their wallet
 * passes after a stamp/redeem. Google: PATCH the object (auto-syncs).
 * Apple: push to registered devices so they re-fetch the pass.
 *
 * Everything is wrapped so a wallet outage never breaks stamping.
 */

import "server-only";
import type { Customer } from "./loyalty-types";
import { buildStampUrl } from "./stamp-link";
import { getBaseUrl } from "./base-url";

async function resolveBaseUrl(): Promise<string> {
  try {
    return await getBaseUrl();
  } catch {
    return (process.env.PUBLIC_BASE_URL ?? "").replace(/\/+$/, "");
  }
}

export async function syncWallets(customer: Customer): Promise<void> {
  const baseUrl = await resolveBaseUrl();
  const stampUrl = await buildStampUrl(baseUrl, customer.id);

  // Google Wallet — PATCH the loyalty object.
  try {
    const { googleConfigured, googleSync } = await import("./google-wallet");
    if (googleConfigured()) await googleSync(customer, stampUrl);
  } catch (e) {
    console.error("[wallet-sync] Google sync failed:", e);
  }

  // Apple Wallet — push registered devices to re-fetch.
  try {
    const { apnsConfigured } = await import("./apple-wallet");
    if (apnsConfigured()) {
      const { getRegistrationsForSerial } = await import("./loyalty-store");
      const { sendPassUpdates } = await import("./apns");
      const regs = await getRegistrationsForSerial(customer.id);
      if (regs.length) await sendPassUpdates(regs.map((r) => r.pushToken));
    }
  } catch (e) {
    console.error("[wallet-sync] Apple push failed:", e);
  }
}
