/**
 * APNs sender for Apple Wallet pass updates (token-based auth, HTTP/2).
 *
 * When a customer's stamp count changes we send an empty push to every
 * device that registered the pass; the device then calls our web service
 * to fetch the updated .pkpass.
 *
 * Requires APPLE_APNS_KEY (.p8, base64), APPLE_APNS_KEY_ID, APPLE_TEAM_ID,
 * APPLE_PASS_TYPE_ID. See SETUP-WALLET.md.
 */

import "server-only";
import http2 from "node:http2";
import { createSign } from "node:crypto";

const APNS_HOST = "https://api.push.apple.com";

let cachedJwt: { token: string; iat: number } | null = null;

function apnsJwt(): string {
  const keyId = process.env.APPLE_APNS_KEY_ID;
  const teamId = process.env.APPLE_TEAM_ID;
  const keyB64 = process.env.APPLE_APNS_KEY;
  if (!keyId || !teamId || !keyB64) throw new Error("APNs not configured");

  const now = Math.floor(Date.now() / 1000);
  // Reuse tokens up to ~50 min (APNs allows up to 60).
  if (cachedJwt && now - cachedJwt.iat < 50 * 60) return cachedJwt.token;

  const p8 = Buffer.from(keyB64, "base64").toString("utf8");
  const header = { alg: "ES256", kid: keyId };
  const payload = { iss: teamId, iat: now };
  const signingInput = `${Buffer.from(JSON.stringify(header)).toString(
    "base64url",
  )}.${Buffer.from(JSON.stringify(payload)).toString("base64url")}`;
  // ieee-p1363 → raw r||s signature, as JOSE/ES256 requires.
  const signature = createSign("SHA256")
    .update(signingInput)
    .sign({ key: p8, dsaEncoding: "ieee-p1363" })
    .toString("base64url");
  const token = `${signingInput}.${signature}`;
  cachedJwt = { token, iat: now };
  return token;
}

export type ApnsResult = { pushToken: string; status: number; reason?: string };

/**
 * Sends an empty pass-update push to each token over a single HTTP/2
 * connection. Returns per-token results; callers treat this as
 * best-effort (a failed push just means the device syncs on next open).
 */
export async function sendPassUpdates(pushTokens: string[]): Promise<ApnsResult[]> {
  const topic = process.env.APPLE_PASS_TYPE_ID;
  if (!topic) throw new Error("APPLE_PASS_TYPE_ID not set");
  if (pushTokens.length === 0) return [];

  const jwt = apnsJwt();
  const client = http2.connect(APNS_HOST);

  const results = await Promise.all(
    pushTokens.map(
      (pushToken) =>
        new Promise<ApnsResult>((resolve) => {
          const req = client.request({
            ":method": "POST",
            ":path": `/3/device/${pushToken}`,
            authorization: `bearer ${jwt}`,
            "apns-topic": topic,
            "apns-push-type": "background",
            "apns-priority": "5",
          });
          let body = "";
          let status = 0;
          req.on("response", (h) => {
            status = Number(h[":status"]) || 0;
          });
          req.setEncoding("utf8");
          req.on("data", (d) => (body += d));
          req.on("end", () => {
            let reason: string | undefined;
            if (body) {
              try {
                reason = JSON.parse(body).reason;
              } catch {
                reason = body;
              }
            }
            resolve({ pushToken, status, reason });
          });
          req.on("error", (err) => resolve({ pushToken, status: 0, reason: String(err) }));
          req.end("{}");
        }),
    ),
  );

  client.close();
  return results;
}
