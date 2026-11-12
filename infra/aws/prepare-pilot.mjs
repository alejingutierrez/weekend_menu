import { createHash, randomBytes } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseEnv } from "node:util";
import { neon } from "@neondatabase/serverless";

const [privateDir, origin, namePattern] = process.argv.slice(2);
if (!privateDir || !namePattern ||
    !/^https:\/\/[a-z0-9]+\.(?:cloudfront\.net|execute-api\.us-east-1\.amazonaws\.com)$/.test(origin ?? ""))
  throw new Error("Supply the restricted configuration directory, AWS origin and pilot name pattern.");

const read = (name) => readFileSync(join(privateDir, name), "utf8");
const file = (name, data) => writeFileSync(join(privateDir, name), JSON.stringify(data), { mode: 0o600 });
const owner = neon(read("neon-owner-uri").trim());
const runtimeUrl = read("neon-runtime-uri").trim();
const runtime = neon(runtimeUrl);
const [runtimeIdentity] = await runtime`
  SELECT current_user AS role, current_setting('neon.branch_id', true) AS branch
`;
if (runtimeIdentity?.role !== "weekend_runtime" || runtimeIdentity?.branch !== "br-crimson-fire-ac3ov0rp")
  throw new Error("The pilot is not connected to the existing Weekend Menu runtime.");

const [pilot] = await owner`
  WITH matches AS (
    SELECT id, stamps, rewards_available, total_stamps, total_rewards
    FROM customers
    WHERE lower(name) LIKE ${namePattern.toLowerCase()} AND archived_at IS NULL
  ), serials AS (
    SELECT id AS serial FROM matches
    UNION
    SELECT alias_id FROM customer_aliases WHERE customer_id IN (SELECT id FROM matches)
  )
  SELECT to_jsonb(matches) AS card,
    (SELECT jsonb_agg(t) FROM loyalty_card_tokens t WHERE t.serial IN (SELECT serial FROM serials)) AS tokens,
    (SELECT jsonb_agg(jsonb_build_object('serial',r.serial,'token',r.push_token)
      ORDER BY r.updated_at DESC) FROM apple_registrations r
      WHERE r.serial IN (SELECT serial FROM serials) AND r.revoked_at IS NULL) AS registrations,
    (SELECT count(*)::int FROM matches) AS count
  FROM matches
`;
if (pilot?.count !== 1 || !pilot.tokens?.length || !pilot.registrations?.length)
  throw new Error("The original pilot card and its device registrations could not be identified.");

const env = parseEnv(read("production.env"));
const signingAndAdminKeys = [
  "APPLE_PASS_TYPE_ID", "APPLE_TEAM_ID", "APPLE_PASS_CERT", "APPLE_PASS_CERT_PASSWORD",
  "APPLE_WWDR_CERT", "ADMIN_USER", "ADMIN_PASSWORD_HASH", "ADMIN_USERS_B64",
  "ADMIN_SESSION_VERSION", "SESSION_SECRET", "BLOB_READ_WRITE_TOKEN",
];
const configuration = Object.fromEntries(signingAndAdminKeys
  .filter((key) => env[key])
  .map((key) => [key, env[key]]));
for (const key of ["APPLE_PASS_TYPE_ID", "APPLE_TEAM_ID", "APPLE_PASS_CERT", "APPLE_WWDR_CERT", "SESSION_SECRET"]) {
  if (!configuration[key]) throw new Error("Required pilot configuration is missing: " + key);
}
const move = {
  WALLET_MOVE_ORIGIN: origin,
  WALLET_MOVE_SERIAL_HASHES: pilot.tokens.map(({ serial }) =>
    createHash("sha256").update(serial).digest("hex")).join(","),
  WALLET_MOVE_AT: new Date().toISOString(),
};
file("pilot.json", pilot);
file("pilot-move.json", move);
file("pilot-runtime.json", {
  ...configuration,
  ...move,
  LOYALTY_DATABASE_URL: runtimeUrl,
  CRON_SECRET: randomBytes(32).toString("hex"),
  PUBLIC_BASE_URL: origin,
  WEEKEND_RUNTIME_ENV: "production",
  WEEKEND_CLOUDFRONT: "1",
});
console.log(JSON.stringify({
  cards: pilot.count,
  serials: pilot.tokens.length,
  registrations: pilot.registrations.length,
  stamps: pilot.card.stamps,
  rewards: pilot.card.rewards_available,
}));
