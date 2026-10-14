// Exercise the compiled Next server, never a production database.
import fs from "node:fs/promises";
import { spawn } from "node:child_process";
import { randomUUID, createHmac, createHash } from "node:crypto";
import { strict as assert } from "node:assert";
import { neon } from "@neondatabase/serverless";
import { configureTestWallet } from "./test-wallet-fixture.mjs";
const config = JSON.parse(
  await fs.readFile(".private/resilience-test-env.json", "utf8"),
);
if (
  config.TEST_BRANCH_ID === "br-crimson-fire-ac3ov0rp" ||
  new URL(config.TEST_DATABASE_URL).hostname.startsWith(
    "ep-quiet-union-acj8tg2k",
  )
)
  throw new Error("Production is forbidden");
const db = neon(config.TEST_DATABASE_URL);
const branch = await db`SELECT current_setting('neon.branch_id',true) AS id`;
assert.equal(branch[0].id, config.TEST_BRANCH_ID);
const [fixture] =
  await db`SELECT id,code FROM customers WHERE name LIKE 'Isolated%' ORDER BY created_at DESC LIMIT 1`;
assert.ok(fixture, "Run the isolated integration suite first");
configureTestWallet();
const secret = "compiled-smoke-" + randomUUID(),
  port = 3087,
  origin = "http://127.0.0.1:" + port;
const env = {
  ...process.env,
  DATABASE_URL: config.TEST_DATABASE_URL,
  LOYALTY_DATABASE_URL: config.TEST_RUNTIME_URL ?? config.TEST_DATABASE_URL,
  VERCEL_ENV: "preview",
  SESSION_SECRET: secret,
  ADMIN_USER: "isolated-smoke",
  ADMIN_PASSWORD_HASH: "compiled-fixture-credential-version",
  PUBLIC_BASE_URL: "https://weekend-menu.vercel.app",
};
delete env.BLOB_READ_WRITE_TOKEN;
delete env.CRON_SECRET;
delete env.LOYALTY_BACKUP_KEY;
const server = spawn(
  process.execPath,
  [
    "node_modules/next/dist/bin/next",
    "start",
    "--hostname",
    "127.0.0.1",
    "--port",
    String(port),
  ],
  { env, stdio: ["ignore", "pipe", "pipe"] },
);
let logs = "";
for (const stream of [server.stdout, server.stderr])
  stream.on("data", (d) => (logs = (logs + d).slice(-2000)));
try {
  let ready = false;
  for (let attempt = 0; attempt < 40; attempt++) {
    try {
      await fetch(origin + "/join");
      ready = true;
      break;
    } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  assert.ok(ready, "Compiled server must start");
  const card = await fetch(origin + "/card/" + fixture.id);
  assert.equal(card.status, 200);
  assert.ok(
    (await card.text()).includes(fixture.code),
    "Compiled card must retrieve real isolated data",
  );
  const wallet = await fetch(origin + "/api/wallet/apple/" + fixture.id);
  assert.equal(wallet.status, 200);
  assert.equal(
    Buffer.from(await wallet.arrayBuffer())
      .subarray(0, 2)
      .toString(),
    "PK",
  );
  const now = Math.floor(Date.now() / 1000);
  const version = createHmac("sha256", secret)
    .update("credential:isolated-smoke:compiled-fixture-credential-version:1")
    .digest("base64url");
  const message =
    "v2." +
    Buffer.from(
      JSON.stringify({
        u: "isolated-smoke",
        iat: now,
        exp: now + 300,
        v: version,
      }),
    ).toString("base64url");
  const cookie =
    "weekend_session=" +
    message +
    "." +
    createHmac("sha256", secret).update(message).digest("base64url");
  const health = await fetch(origin + "/api/admin/loyalty/health", {
    headers: { cookie },
  });
  assert.equal(health.status, 200);
  const metadata = await health.json();
  assert.equal(metadata.healthy, true);
  const page = await fetch(origin + "/admin/loyalty/status", {
    headers: { cookie },
  });
  assert.equal(page.status, 200);
  assert.ok((await page.text()).includes("Datos y protecciones verificados"));
  const directory = await fetch(
    origin + "/admin/loyalty?q=" + encodeURIComponent(fixture.code),
    { headers: { cookie } },
  );
  assert.equal(directory.status, 200);
  assert.ok((await directory.text()).includes(fixture.code));
  const manifest = JSON.parse(
    await fs.readFile(".next/server/server-reference-manifest.json", "utf8"),
  );
  const action = Object.entries(manifest.node).find(
    ([, value]) => value.exportedName === "saveMenu",
  );
  assert.ok(action);
  const beforeMenu = await fs.readFile("data/menu.json");
  const attemptedMenu = {
    ...JSON.parse(beforeMenu),
    tagline: "Synthetic unauthorized change",
  };
  const anonymousAction = await fetch(origin + "/", {
    method: "POST",
    redirect: "manual",
    headers: {
      "next-action": action[0],
      origin,
      "content-type": "text/plain;charset=UTF-8",
    },
    body: JSON.stringify([attemptedMenu]),
  });
  const anonymousBody = await anonymousAction.text();
  const loginScreen =
    anonymousBody.includes('name="username"') &&
    anonymousBody.includes('name="password"');
  const flightError = /:E\{/.test(anonymousBody);
  // Next returns {} when the internal /admin action worker redirects to login
  // instead of returning a Flight response. HTTP 200 alone is not action success.
  assert.ok(
    anonymousAction.status >= 300 ||
      anonymousAction.headers.has("x-action-redirect") ||
      loginScreen ||
      flightError ||
      anonymousBody.trim() === "{}",
    "Anonymous menu write must be rejected",
  );
  assert.equal(
    createHash("sha256")
      .update(await fs.readFile("data/menu.json"))
      .digest("hex"),
    createHash("sha256").update(beforeMenu).digest("hex"),
  );
  const denied = await fetch(origin + "/api/admin/loyalty/health");
  assert.equal(denied.status, 401);
  const proof = {
    verifiedAt: new Date().toISOString(),
    compiledCard: 200,
    compiledWallet: 200,
    compiledHealth: 200,
    compiledStatusPage: 200,
    compiledDirectorySearch: 200,
    withoutAuthentication: 401,
    anonymousMenuActionRejected: true,
    menuUnchanged: true,
  };
  await fs.writeFile(
    ".private/compiled-smoke-proof.json",
    JSON.stringify(proof, null, 2),
    { mode: 0o600 },
  );
  console.log(proof);
} finally {
  server.kill("SIGTERM");
}
