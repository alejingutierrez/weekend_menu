/**
 * Encryption for customer records at rest. Unlike the menu, customer
 * data is PII (name, email, phone), and Vercel Blob serves objects from
 * public URLs — so we never store it in the clear there.
 *
 * AES-256-GCM. The key is derived from SESSION_SECRET (already required
 * for admin sessions), so there is no extra secret to manage. GCM's auth
 * tag also detects tampering on read.
 *
 * Format: `v1.<iv>.<tag>.<ciphertext>` (each part base64url).
 */

import "server-only";
import {
  createHash,
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";

function key(): Buffer {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error("SESSION_SECRET must be set to a string of at least 16 chars");
  }
  return createHash("sha256").update(secret).digest(); // 32 bytes → AES-256
}

export function encryptJson(value: unknown): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const plaintext = Buffer.from(JSON.stringify(value), "utf8");
  const enc = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    "v1",
    iv.toString("base64url"),
    tag.toString("base64url"),
    enc.toString("base64url"),
  ].join(".");
}

export function decryptJson<T>(payload: string): T {
  const [version, ivB, tagB, dataB] = payload.split(".");
  if (version !== "v1" || !ivB || !tagB || !dataB) {
    throw new Error("Unrecognized ciphertext format");
  }
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(ivB, "base64url"));
  decipher.setAuthTag(Buffer.from(tagB, "base64url"));
  const dec = Buffer.concat([
    decipher.update(Buffer.from(dataB, "base64url")),
    decipher.final(),
  ]);
  return JSON.parse(dec.toString("utf8")) as T;
}
