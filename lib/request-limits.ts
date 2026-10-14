import "server-only";
import { createHmac } from "node:crypto";
import { isIP } from "node:net";
import { headers } from "next/headers";
import { consumeRateLimits } from "./loyalty-store";
export class RequestLimitError extends Error {
  constructor() {
    super("Request temporarily limited");
    this.name = "RequestLimitError";
  }
}
export function trustedClientIp(h: Headers): string {
  // Vercel overwrites this header. Local/untrusted deployments share a bucket.
  if (process.env.VERCEL !== "1") return "untrusted-client";
  const value = (h.get("x-forwarded-for") ?? "").split(",")[0].trim();
  return isIP(value) ? value : "unknown-client";
}
export function privateRateBucket(scope: string, value: string): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 16)
    throw new Error("Signing configuration unavailable");
  return scope + ":" + createHmac("sha256", secret).update(value).digest("hex");
}
export async function enforceRequestLimits(
  kind: "login" | "join" | "wallet",
  subject = "",
  requestHeaders?: Headers,
) {
  const h = requestHeaders ?? (await headers()),
    ip = trustedClientIp(h);
  const rules =
    kind === "login"
      ? [
          { scope: "login-ip", value: ip, limit: 20, seconds: 900 },
          { scope: "login-user", value: subject, limit: 10, seconds: 900 },
          { scope: "login-global", value: "all", limit: 100, seconds: 900 },
        ]
      : kind === "join"
        ? [
            { scope: "join-ip", value: ip, limit: 20, seconds: 900 },
            { scope: "join-global", value: "all", limit: 300, seconds: 86400 },
          ]
        : [
            { scope: "wallet-card", value: subject, limit: 30, seconds: 900 },
            { scope: "wallet-ip", value: ip, limit: 100, seconds: 900 },
          ];
  if (
    !(await consumeRateLimits(
      rules.map((r) => ({
        bucket: privateRateBucket(r.scope, r.value),
        limit: r.limit,
        seconds: r.seconds,
      })),
    ))
  )
    throw new RequestLimitError();
}
