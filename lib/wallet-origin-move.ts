import "server-only";
import { createHash } from "node:crypto";

const destination = process.env.WALLET_MOVE_ORIGIN;
const revision = process.env.WALLET_MOVE_AT;
const serialHashes = new Set(process.env.WALLET_MOVE_SERIAL_HASHES?.split(",") ?? []);

export function walletOriginMove(serial: string): { origin: string; revision: string } | undefined {
  if (!destination || !revision || !serialHashes.has(createHash("sha256").update(serial).digest("hex")))
    return;

  const origin = new URL(destination);
  const date = new Date(revision);
  if (
    origin.protocol !== "https:" ||
    !/^[a-z0-9]+\.(?:cloudfront\.net|execute-api\.us-east-1\.amazonaws\.com)$/.test(origin.hostname) ||
    origin.href !== origin.origin + "/" ||
    !Number.isFinite(date.getTime())
  ) throw new Error("Invalid Apple Wallet migration configuration.");

  return { origin: origin.origin, revision: date.toISOString() };
}

export function walletMoveUpdateTime(serial: string, updatedAt: string): string {
  const move = walletOriginMove(serial);
  return move && Date.parse(move.revision) > Date.parse(updatedAt) ? move.revision : updatedAt;
}

export function recordWalletOriginRequest(
  serial: string,
  event: "registration" | "poll" | "pass",
  headers: Headers,
  device?: { id: string; pushToken?: string },
): void {
  if (process.env.WEEKEND_CLOUDFRONT !== "1" || !walletOriginMove(serial)) return;
  const fingerprint = (value: string) => createHash("sha256").update(value).digest("hex").slice(0, 20);
  const origin = headers.get("x-weekend-legacy-proxy") === "1" ? "legacy" : "direct";
  console.info(
    "[wallet-origin]", event, origin, fingerprint(serial),
    device ? fingerprint(device.id) : "",
    device?.pushToken ? fingerprint(device.pushToken) : "",
  );
}
