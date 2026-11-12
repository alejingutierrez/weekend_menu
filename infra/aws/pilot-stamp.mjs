import { execFileSync } from "node:child_process";

const [secretArn, origin, operationId, stampsBefore, rewardsBefore] = process.argv.slice(2);
if (!secretArn?.startsWith("arn:aws:secretsmanager:us-east-1:907264907058:secret:") ||
    !/^https:\/\/[a-z0-9]+\.(?:cloudfront\.net|execute-api\.us-east-1\.amazonaws\.com)$/.test(origin ?? "") ||
    !/^[a-f0-9-]{36}$/.test(operationId ?? "") ||
    !/^\d+$/.test(stampsBefore ?? "") || !/^\d+$/.test(rewardsBefore ?? ""))
  throw new Error("Invalid Weekend Wallet pilot configuration.");

const config = JSON.parse(JSON.parse(execFileSync("aws", [
  "secretsmanager", "get-secret-value", "--secret-id", secretArn,
  "--region", "us-east-1", "--query", "SecretString", "--output", "json",
], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })));
if (config.WEEKEND_RUNTIME_ENV !== "production" ||
    config.PUBLIC_BASE_URL !== origin || config.WALLET_MOVE_ORIGIN !== origin)
  throw new Error("The pilot stamp must run against the verified AWS pilot.");

for (const [key, value] of Object.entries(config))
  if (typeof value === "string" && /^[A-Z][A-Z0-9_]*$/.test(key)) process.env[key] = value;
const hashes = config.WALLET_MOVE_SERIAL_HASHES?.split(",") ?? [];
if (!hashes.length || hashes.some((hash) => !/^[a-f0-9]{64}$/.test(hash)))
  throw new Error("The pilot has no selected serials.");

const { loyaltySql } = await import("../../lib/loyalty-database.ts");
const { addStamp } = await import("../../lib/loyalty-store.ts");
const db = await loyaltySql();
const matches = await db`
  SELECT id, stamps, rewards_available, total_stamps
  FROM customers
  WHERE encode(sha256(convert_to(id, 'UTF8')), 'hex') = ANY(${hashes}::text[])
    AND archived_at IS NULL
`;
if (matches.length !== 1) throw new Error("The pilot must select exactly one active card.");
const card = matches[0];
if (card.stamps !== Number(stampsBefore) || card.rewards_available !== Number(rewardsBefore))
  throw new Error("The pilot balance changed since the previous check.");

const result = await addStamp(card.id, "aws-migration-pilot", operationId);
if (result?.customer.id !== card.id || result.customer.totalStamps !== card.total_stamps + 1)
  throw new Error("The pilot stamp outcome could not be confirmed.");
console.log(JSON.stringify({
  sameCard: true,
  before: { stamps: card.stamps, rewards: card.rewards_available },
  after: { stamps: result.customer.stamps, rewards: result.customer.rewardsAvailable },
}));
