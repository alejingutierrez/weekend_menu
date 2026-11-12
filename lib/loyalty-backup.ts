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
import { awsStorageBucket, readAwsObject, writeAwsObject } from "./aws-storage";

async function storeEncryptedBackup(key: string, encrypted: string) {
  if (awsStorageBucket) {
    const location = await writeAwsObject(key, encrypted, "application/octet-stream", false);
    return { location, contents: await readAwsObject(key) };
  }
  // The existing Blob store is public, so it receives only ciphertext.
  const blob = await put(key, encrypted, {
    access: "public",
    addRandomSuffix: false,
    allowOverwrite: false,
    contentType: "application/octet-stream",
  });
  const response = await fetch(blob.url, {
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error("Backup readback failed");
  return { location: blob.url, contents: await response.text() };
}

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
  const backup = await storeEncryptedBackup(
    `loyalty-backups/${data.createdAt.slice(0, 10)}/${randomUUID()}.enc`,
    encrypted,
  );
  const verified = decryptLoyaltyBackup(backup.contents, secret);
  if (backupDigest(verified) !== digest)
    throw new Error("Backup integrity verification failed");
  await recordLoyaltyBackup(backup.location, digest, data.customers.length);
  return { verified: true, cards: data.customers.length, digest };
}
