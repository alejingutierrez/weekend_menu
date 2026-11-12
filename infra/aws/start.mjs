import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";

const secretArn = process.env.WEEKEND_SECRET_ARN;
if (!secretArn || !process.env.AWS_REGION) {
  throw new Error("AWS runtime configuration reference is missing.");
}
const secret = JSON.parse(JSON.parse(execFileSync("aws", [
  "secretsmanager", "get-secret-value",
  "--secret-id", secretArn,
  "--query", "SecretString",
  "--output", "json",
], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })));
if (!secret.LOYALTY_RDS_URL && !secret.LOYALTY_DATABASE_URL) {
  throw new Error("AWS runtime has no configured database.");
}
for (const [key, value] of Object.entries(secret)) {
  if (typeof value === "string" && /^[A-Z][A-Z0-9_]*$/.test(key)) process.env[key] = value;
}
process.env.NODE_ENV = "production";
process.env.PORT = "3000";
process.env.HOSTNAME = "127.0.0.1";
if (!existsSync("server.js")) throw new Error("Compiled Next.js server is missing.");
await import("../../server.js");
