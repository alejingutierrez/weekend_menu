/** Durable delivery jobs are written atomically with the customer's change. */
import "server-only";
import type { Customer } from "./loyalty-types";
import { getBaseUrl } from "./base-url";
import { buildStampUrl } from "./stamp-link";
import { retryDelaySeconds } from "./apple-protocol";
import {
  claimWalletJobs,
  finishWalletJob,
  getCustomer,
  getRegistrationsForSerial,
  revokeApplePushToken,
} from "./loyalty-store";

export async function syncWallets(customer: Customer): Promise<void> {
  const errors: string[] = [];
  const baseUrl = await getBaseUrl();
  const stampUrl = await buildStampUrl(baseUrl, customer.id);
  const { googleConfigured, googleSync } = await import("./google-wallet");
  if (googleConfigured()) {
    try {
      await googleSync(customer, stampUrl);
    } catch {
      errors.push("google_unavailable");
    }
  }
  const { apnsConfigured } = await import("./apple-wallet");
  const registrations = await getRegistrationsForSerial(customer.id);
  if (!apnsConfigured() && registrations.length)
    errors.push("apple_unconfigured");
  if (apnsConfigured()) {
    if (registrations.length) {
      try {
        const { sendPassUpdates } = await import("./apns");
        const results = await sendPassUpdates(
          registrations.map((r) => r.pushToken),
        );
        for (const result of results) {
          if (
            result.status === 410 ||
            (result.status === 400 && result.reason === "BadDeviceToken")
          )
            await revokeApplePushToken(result.pushToken);
          else if (result.status !== 200)
            errors.push("apple_" + (result.status || "unavailable"));
        }
      } catch {
        errors.push("apple_unavailable");
      }
    }
  }
  if (errors.length) throw new Error([...new Set(errors)].join(","));
}

export async function processWalletQueue(limit = 10, customerId?: string) {
  const jobs = await claimWalletJobs(limit, customerId);
  let delivered = 0,
    retained = 0;
  for (const job of jobs) {
    try {
      const customer = await getCustomer(job.customerId);
      if (!customer) throw new Error("customer_missing");
      await syncWallets(customer);
      await finishWalletJob(job);
      delivered++;
    } catch (e) {
      const message =
        e instanceof Error &&
        /^(apple_[a-z0-9]+|google_unavailable|customer_missing)(,(apple_[a-z0-9]+|google_unavailable))*$/.test(
          e.message,
        )
          ? e.message
          : "wallet_unavailable";
      await finishWalletJob(job, message, retryDelaySeconds(job.attempts));
      retained++;
    }
  }
  return { delivered, retained };
}
