/** Wallet APNs uses the same certificate/key as pass signing, and an empty payload. */
import "server-only";
import http2 from "node:http2";
import { appleSigningMaterial } from "./apple-wallet";
export type ApnsResult = { pushToken: string; status: number; reason?: string };
export async function sendPassUpdates(
  pushTokens: string[],
): Promise<ApnsResult[]> {
  if (!pushTokens.length) return [];
  const { cert, key } = appleSigningMaterial();
  const chain =
    cert +
    "\n" +
    Buffer.from(process.env.APPLE_WWDR_CERT as string, "base64").toString(
      "utf8",
    );
  const client = http2.connect("https://api.push.apple.com", {
    cert: chain,
    key,
  });
  client.on("error", () => {});
  client.setTimeout(8000, () => client.destroy());
  try {
    return await Promise.all(
      [...new Set(pushTokens)].map(
        (pushToken) =>
          new Promise<ApnsResult>((resolve) => {
            let done = false,
              status = 0,
              body = "";
            const finish = (reason?: string) => {
              if (done) return;
              done = true;
              resolve({ pushToken, status, reason });
            };
            const req = client.request({
              ":method": "POST",
              ":path": `/3/device/${pushToken}`,
              "apns-topic": process.env.APPLE_PASS_TYPE_ID,
              "apns-priority": "5",
            });
            req.setTimeout(7000, () => {
              finish("timeout");
              req.close();
            });
            req.on(
              "response",
              (headers) => (status = Number(headers[":status"]) || 0),
            );
            req.setEncoding("utf8");
            req.on("data", (d) => {
              if (body.length < 1024) body += d;
            });
            req.on("end", () => {
              let reason: string | undefined;
              try {
                const r = JSON.parse(body).reason;
                if (typeof r === "string" && /^[A-Za-z]+$/.test(r)) reason = r;
              } catch {}
              finish(reason);
            });
            req.on("error", () => finish("network_error"));
            req.on("close", () =>
              finish(status === 200 ? undefined : "connection_closed"),
            );
            req.end("{}");
          }),
      ),
    );
  } finally {
    client.destroy();
  }
}
