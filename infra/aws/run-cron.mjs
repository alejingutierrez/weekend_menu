import { execFileSync } from "node:child_process";

const routes = new Set(["wallets", "loyalty-backup"]);
const action = process.argv[2];
if (!routes.has(action)) throw new Error("Unknown Weekend Menu scheduled task.");
const { CRON_SECRET: token } = JSON.parse(JSON.parse(execFileSync("aws", [
  "secretsmanager", "get-secret-value",
  "--secret-id", process.env.WEEKEND_SECRET_ARN,
  "--query", "SecretString",
  "--output", "json",
], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })));
if (!token) throw new Error("The Weekend Menu scheduler is missing its credentials.");
const response = await fetch("http://127.0.0.1:3000/api/cron/" + action, {
  headers: { Authorization: "Bearer " + token },
  signal: AbortSignal.timeout(120_000),
});
if (!response.ok) throw new Error(`Scheduled task ${action} returned HTTP ${response.status}.`);
await response.body.cancel();
