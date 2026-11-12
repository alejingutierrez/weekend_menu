import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";

const [secretArn, origin] = process.argv.slice(2);
if (!secretArn?.startsWith("arn:aws:secretsmanager:us-east-1:907264907058:secret:") ||
    !/^https:\/\/[a-z0-9]+\.execute-api\.us-east-1\.amazonaws\.com$/.test(origin ?? ""))
  throw new Error("Invalid Wallet verification target.");
const config = JSON.parse(JSON.parse(execFileSync("aws", [
  "secretsmanager", "get-secret-value", "--secret-id", secretArn,
  "--region", "us-east-1", "--query", "SecretString", "--output", "json",
], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })));
if (
  !config.LOYALTY_RDS_URL || !config.WEEKEND_STORAGE_BUCKET ||
  config.WEEKEND_RUNTIME_ENV !== "production" ||
  config.PUBLIC_BASE_URL !== origin || config.WALLET_MOVE_ORIGIN !== origin
) throw new Error("Wallet verification requires the live AWS runtime.");

for (const [key, value] of Object.entries(config))
  if (typeof value === "string" && /^[A-Z][A-Z0-9_]*$/.test(key)) process.env[key] = value;
const allowlist = new Set(config.WALLET_MOVE_SERIAL_HASHES.split(","));
const fingerprint = (value) => createHash("sha256").update(value).digest("hex");
const { loyaltySql } = await import("../../lib/loyalty-database.ts");
const db = await loyaltySql();
const rows = await db`
  SELECT serial, device_library_id, push_token
  FROM apple_registrations WHERE revoked_at IS NULL ORDER BY serial, device_library_id
`;
const selected = rows.filter((row) => allowlist.has(fingerprint(row.serial)));
if (!selected.length) throw new Error("There are no devices in the issued-pass scope.");

const { appleCertificateStatus } = await import("../../lib/apple-wallet.ts");
if (!appleCertificateStatus().valid) throw new Error("Apple signing certificate is not valid.");
const { sendPassUpdates } = await import("../../lib/apns.ts");
const startedAt = new Date().toISOString();
const targets = [...new Set(selected.map((row) => row.push_token))];
const results = [];
for (let index = 0; index < targets.length; index += 16) {
  const batch = await sendPassUpdates(targets.slice(index, index + 16));
  results.push(...batch.map(({ pushToken, status, reason }) =>
    ({ token: fingerprint(pushToken).slice(0, 20), status, reason })));
}
writeFileSync("/var/lib/weekend/wallet-direct-push.json", JSON.stringify({
  startedAt,
  results,
  registrations: selected.map((row) => ({
    serial: fingerprint(row.serial).slice(0, 20),
    device: fingerprint(row.device_library_id).slice(0, 20),
    token: fingerprint(row.push_token).slice(0, 20),
  })),
}), { mode: 0o600 });
const statuses = {};
for (const { status } of results) statuses[status] = (statuses[status] ?? 0) + 1;
console.log(JSON.stringify({ startedAt, registrations: selected.length, targets: targets.length, appleResponses: statuses }));
process.exit(0);
