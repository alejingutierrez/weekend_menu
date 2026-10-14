import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import { gzipSync, gunzipSync } from "node:zlib";
export type BackupRow = Record<string, unknown>;
export type LoyaltyBackup = {
  version: 1;
  createdAt: string;
  customers: BackupRow[];
  aliases: BackupRow[];
  registrations: BackupRow[];
  events: BackupRow[];
  operations: BackupRow[];
  tokens: BackupRow[];
};
function key(value: string) {
  if (!/^[0-9a-f]{64}$/i.test(value))
    throw new Error("A dedicated 256-bit backup key is required");
  return Buffer.from(value, "hex");
}
export function encryptLoyaltyBackup(
  data: LoyaltyBackup,
  secret: string,
): string {
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", key(secret), iv);
  const bytes = gzipSync(Buffer.from(JSON.stringify(data)));
  const encrypted = Buffer.concat([cipher.update(bytes), cipher.final()]);
  return [
    "weekend-backup-v1",
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    encrypted.toString("base64url"),
  ].join(".");
}
export function decryptLoyaltyBackup(
  data: string,
  secret: string,
): LoyaltyBackup {
  const parts = data.split(".");
  if (parts.length !== 4 || parts[0] !== "weekend-backup-v1")
    throw new Error("Unsupported backup format");
  const [_, iv, tag, bytes] = parts,
    decipher = createDecipheriv(
      "aes-256-gcm",
      key(secret),
      Buffer.from(iv, "base64url"),
    );
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  const plain = gunzipSync(
    Buffer.concat([
      decipher.update(Buffer.from(bytes, "base64url")),
      decipher.final(),
    ]),
    { maxOutputLength: 100 * 1024 * 1024 },
  );
  const parsed = JSON.parse(plain.toString("utf8")) as LoyaltyBackup;
  if (
    parsed.version !== 1 ||
    ![
      "customers",
      "aliases",
      "registrations",
      "events",
      "operations",
      "tokens",
    ].every((k) => Array.isArray(parsed[k as keyof LoyaltyBackup]))
  )
    throw new Error("Invalid backup content");
  return parsed;
}
export function backupDigest(data: LoyaltyBackup) {
  return createHash("sha256").update(JSON.stringify(data)).digest("hex");
}
/** A plan never rolls back existing balances or substitutes conflicting identities. */
export function planMissingCardRecovery(
  backup: LoyaltyBackup,
  current: LoyaltyBackup,
) {
  const existing = new Set([
    ...current.customers.map((c) => c.id),
    ...current.aliases.map((a) => a.alias_id),
  ]);
  const missing = backup.customers.filter((c) => !existing.has(c.id));
  const conflicts = missing.filter(
    (c) =>
      current.aliases.some((a) => a.alias_code === c.code) ||
      current.customers.some(
        (live) =>
          live.code === c.code ||
          (c.email &&
            String(live.email).toLowerCase() ===
              String(c.email).toLowerCase()) ||
          (c.phone && live.phone === c.phone),
      ),
  );
  return {
    missing: missing.map((c) => String(c.id)),
    conflicts: conflicts.map((c) => String(c.id)),
    existingPreserved: current.customers.length,
    canApply: conflicts.length === 0,
  };
}
