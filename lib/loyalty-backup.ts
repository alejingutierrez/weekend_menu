import "server-only";
import { randomUUID } from "node:crypto";
import { put } from "@vercel/blob";
import {
  backupDigest,
  decryptLoyaltyBackup,
  encryptLoyaltyBackup,
  assertCompleteCardTokens,
} from "./loyalty-backup-format";
import { readLoyaltyBackup, recordLoyaltyBackup } from "./loyalty-store";
import {preserveAllCardTokens} from "./customer-token";
export async function createVerifiedLoyaltyBackup() {
  const secret = process.env.LOYALTY_BACKUP_KEY;
  if (!secret) throw new Error("Dedicated backup key missing");
  await preserveAllCardTokens();
  const data = await readLoyaltyBackup();
  if (!data.customers.length)
    throw new Error("Refusing to publish an empty loyalty backup");
  assertCompleteCardTokens(data);
  const digest = backupDigest(data),
    encrypted = encryptLoyaltyBackup(data, secret);
  // This existing Blob store is public: only authenticated ciphertext leaves the database.
  const blob = await put(
    `loyalty-backups/${data.createdAt.slice(0, 10)}/${randomUUID()}.enc`,
    encrypted,
    {
      access: "public",
      addRandomSuffix: false,
      allowOverwrite: false,
      contentType: "application/octet-stream",
    },
  );
  const response = await fetch(blob.url, {
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error("Backup readback failed");
  const verified = decryptLoyaltyBackup(await response.text(), secret);
  if (backupDigest(verified) !== digest)
    throw new Error("Backup integrity verification failed");
  await recordLoyaltyBackup(blob.url, digest, data.customers.length);
  return { verified: true, cards: data.customers.length, digest };
}
