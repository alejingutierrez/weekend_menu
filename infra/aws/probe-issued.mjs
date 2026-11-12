import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const [privateDir, origin] = process.argv.slice(2);
if (!privateDir || !/^https:\/\/[a-z0-9]+\.(?:cloudfront\.net|execute-api\.us-east-1\.amazonaws\.com)$/.test(origin ?? ""))
  throw new Error("Supply the restricted cutover directory and AWS origin.");
const snapshot = JSON.parse(readFileSync(join(privateDir, "issued-wallets.json"), "utf8"));
const config = JSON.parse(readFileSync(join(privateDir, "rds-runtime-config.json"), "utf8"));
if (!snapshot.cards?.length || config.PUBLIC_BASE_URL !== origin)
  throw new Error("The cutover card inventory is missing.");

let verified = 0;
const pending = snapshot.cards.entries();
const temporary = mkdtempSync(join(tmpdir(), "weekend-issued-proof-"));
try {
  const checks = await Promise.allSettled(Array.from({ length: 4 }, async () => {
    for (const [index, card] of pending) {
      const path = `/api/wallet/apple/v1/passes/${encodeURIComponent(config.APPLE_PASS_TYPE_ID)}/${encodeURIComponent(card.serial)}`;
      const response = await fetch(origin + path, {
        headers: { Authorization: `ApplePass ${card.token}` },
        signal: AbortSignal.timeout(15000),
      });
      if (response.status !== 200 || !response.headers.get("content-type")?.includes("application/vnd.apple.pkpass"))
        throw new Error(`Issued pass ${index + 1} returned HTTP ${response.status}.`);

      const filename = join(temporary, `pass-${index}.pkpass`);
      writeFileSync(filename, new Uint8Array(await response.arrayBuffer()), { mode: 0o600 });
      const pass = JSON.parse(execFileSync("unzip", ["-p", filename, "pass.json"], { encoding: "utf8" }));
      const barcode = new URL(pass.barcodes[0].message);
      const field = (fields, key) => fields.find((entry) => entry.key === key)?.value;
      if (
        pass.passTypeIdentifier !== config.APPLE_PASS_TYPE_ID ||
        pass.teamIdentifier !== config.APPLE_TEAM_ID ||
        pass.serialNumber !== card.serial ||
        pass.authenticationToken !== card.token ||
        pass.webServiceURL !== origin + "/api/wallet/apple" ||
        Boolean(pass.voided) !== Boolean(card.archived) ||
        barcode.origin !== origin ||
        barcode.pathname !== "/admin/stamp" ||
        barcode.searchParams.get("c") !== card.serial ||
        barcode.searchParams.get("t") !== card.token ||
        String(field(pass.storeCard.auxiliaryFields, "left")) !== String(10 - card.stamps) ||
        String(field(pass.storeCard.secondaryFields, "reward")) !== String(card.rewards)
      ) throw new Error(`Issued pass ${index + 1} differs from its cutover inventory.`);
      rmSync(filename);
      verified++;
    }
  }));
  const failed = checks.find((check) => check.status === "rejected");
  if (failed) throw failed.reason;
  console.log(JSON.stringify({ verifiedSerials: verified, registeredDevices: snapshot.registrations.length }));
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
