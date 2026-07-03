/**
 * Shared types for the loyalty program ("Weekend Club").
 *
 * Customer records live in Vercel Blob (`customers.json`, encrypted) in
 * production, or a local `data/customers.json` file in dev — see
 * `lib/loyalty-store.ts`, which mirrors `lib/menu-store.ts`.
 */

/** Stamps required to earn one free burger. */
export const STAMPS_PER_REWARD = 10;

export type Customer = {
  /** Opaque, unguessable id (UUID). Signed into the wallet barcode. */
  id: string;
  /** Short human code (e.g. "K7Q2AF") for manual lookup at the counter. */
  code: string;
  name: string;
  email?: string;
  phone?: string;
  /** Stamps toward the next reward: 0 .. STAMPS_PER_REWARD-1. */
  stamps: number;
  /** Free burgers earned and not yet redeemed. */
  rewardsAvailable: number;
  /** Lifetime counters, for analytics. */
  totalStamps: number;
  totalRewards: number;
  /** ISO timestamps. */
  createdAt: string;
  /** Bumped on every change; used as Apple's `passesUpdatedSince` tag. */
  updatedAt: string;
  lastStampAt?: string;
  /** Google Wallet object id, once the pass is issued (Fase 2). */
  googleObjectId?: string;
  /** Apple pass serial number, once issued (Fase 3). */
  appleSerial?: string;
};

/**
 * A device that registered an Apple pass for push updates. Recorded via
 * Apple's pass web service when the user adds the pass to their iPhone.
 */
export type AppleRegistration = {
  /** The pass serial number (== Customer.id). */
  serial: string;
  deviceLibraryId: string;
  /** APNs push token for this device+pass. */
  pushToken: string;
  registeredAt: string;
};

export type LoyaltyData = {
  customers: Customer[];
  appleRegistrations?: AppleRegistration[];
};
