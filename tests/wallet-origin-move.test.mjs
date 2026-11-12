import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import test from "node:test";

const oldVersion = "2026-11-12T14:00:00.000Z";
const newVersion = "2026-11-12T15:00:00.000Z";

test("only the selected serial receives the new origin and a new update tag", async () => {
  process.env.WALLET_MOVE_ORIGIN = "https://dexample.cloudfront.net";
  process.env.WALLET_MOVE_AT = newVersion;
  process.env.WALLET_MOVE_SERIAL_HASHES = createHash("sha256").update("pilot").digest("hex");
  const { walletOriginMove, walletMoveUpdateTime } = await import("../lib/wallet-origin-move.ts");
  const { updatedSerials } = await import("../lib/apple-protocol.ts");

  assert.deepEqual(walletOriginMove("pilot"), {
    origin: "https://dexample.cloudfront.net",
    revision: newVersion,
  });
  assert.equal(walletOriginMove("another-card"), undefined);
  assert.equal(walletMoveUpdateTime("another-card", oldVersion), oldVersion);
  assert.equal(walletMoveUpdateTime("pilot", "2026-11-12T16:00:00.000Z"), "2026-11-12T16:00:00.000Z");
  const devicePasses = ["pilot", "another-card"].map((serial) => ({
    serial,
    updatedAt: walletMoveUpdateTime(serial, oldVersion),
  }));
  assert.deepEqual(updatedSerials(devicePasses, oldVersion).serials, ["pilot"]);
});
