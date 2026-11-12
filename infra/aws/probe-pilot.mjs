import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const [privateDir, servedBy, expectedOrigin, expectedStamps, expectedRewards] = process.argv.slice(2);
const aws = /^https:\/\/[a-z0-9]+\.(?:cloudfront\.net|execute-api\.us-east-1\.amazonaws\.com)$/;
if (!privateDir || !aws.test(expectedOrigin ?? "") ||
    (!aws.test(servedBy ?? "") && servedBy !== "https://weekend-menu.vercel.app"))
  throw new Error("Supply the restricted pilot directory, provider origin and expected AWS origin.");

const pilot = JSON.parse(readFileSync(join(privateDir, "pilot.json"), "utf8"));
const env = JSON.parse(readFileSync(join(privateDir, "pilot-runtime.json"), "utf8"));
const stamps = expectedStamps === undefined ? pilot.card.stamps : Number(expectedStamps);
const rewards = expectedRewards === undefined ? pilot.card.rewards_available : Number(expectedRewards);
const workspace = mkdtempSync(join(tmpdir(), "weekend-pilot-proof-"));
const requests = ["/", "/join", "/admin/login"];
if (aws.test(servedBy)) requests.push("/menu-weekend.pdf");
try {
  for (const path of requests) {
    const response = await fetch(servedBy + path, { signal: AbortSignal.timeout(15000) });
    if (response.status !== 200) throw new Error(`Smoke route ${path} returned HTTP ${response.status}.`);
    await response.body.cancel();
  }
  for (const { serial, token } of pilot.tokens) {
    const url = `${servedBy}/api/wallet/apple/v1/passes/${encodeURIComponent(env.APPLE_PASS_TYPE_ID)}/${encodeURIComponent(serial)}`;
    const authorization = `ApplePass ${token}`;
    const response = await fetch(url, { headers: { Authorization: authorization }, signal: AbortSignal.timeout(15000) });
    if (response.status !== 200 || !response.headers.get("content-type")?.includes("application/vnd.apple.pkpass"))
      throw new Error(`The existing pass endpoint returned HTTP ${response.status}.`);
    const filename = join(workspace, "pass.pkpass");
    writeFileSync(filename, new Uint8Array(await response.arrayBuffer()), { mode: 0o600 });
    const pass = JSON.parse(execFileSync("unzip", ["-p", filename, "pass.json"], { encoding: "utf8" }));
    const files = execFileSync("unzip", ["-Z1", filename], { encoding: "utf8" }).trim().split("\n");
    const barcode = new URL(pass.barcodes[0].message);
    const displayedRemaining = pass.storeCard.auxiliaryFields.find(({ key }) => key === "left")?.value;
    const displayedRewards = pass.storeCard.secondaryFields.find(({ key }) => key === "reward")?.value;
    if (
      pass.passTypeIdentifier !== env.APPLE_PASS_TYPE_ID ||
      pass.teamIdentifier !== env.APPLE_TEAM_ID ||
      pass.serialNumber !== serial ||
      pass.authenticationToken !== token ||
      pass.webServiceURL !== expectedOrigin + "/api/wallet/apple" ||
      barcode.origin !== expectedOrigin ||
      barcode.pathname !== "/admin/stamp" ||
      barcode.searchParams.get("c") !== serial ||
      barcode.searchParams.get("t") !== token ||
      String(displayedRemaining) !== String(10 - stamps) ||
      String(displayedRewards) !== String(rewards) ||
      !files.includes("manifest.json") || !files.includes("signature") ||
      !files.includes("strip.png")
    ) throw new Error("The pass identity, authentication, barcode or package changed unexpectedly.");
    const unauthed = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (unauthed.status !== 401) throw new Error("The pass endpoint did not require authentication.");
    await unauthed.body.cancel();
  }
  console.log(JSON.stringify({
    publicRoutes: requests.length, preservedSerials: pilot.tokens.length,
    stamps, rewards,
    originMatches: true,
  }));
} finally {
  rmSync(workspace, { recursive: true, force: true });
}
