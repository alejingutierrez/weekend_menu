// Run only with an explicitly isolated Neon branch. No production mutations.
import { test } from "node:test";
import { strict as assert } from "node:assert";
import fs from "node:fs";
import { randomUUID, createHmac } from "node:crypto";
import { neon } from "@neondatabase/serverless";

const env = fs.existsSync(".private/resilience-test-env.json")
  ? JSON.parse(fs.readFileSync(".private/resilience-test-env.json", "utf8"))
  : process.env;
if (
  !env.TEST_DATABASE_URL ||
  !env.TEST_BRANCH_ID ||
  env.TEST_BRANCH_ID === "br-crimson-fire-ac3ov0rp"
)
  throw new Error("An isolated test branch is required");
if (
  new URL(env.TEST_DATABASE_URL).hostname.startsWith("ep-quiet-union-acj8tg2k")
)
  throw new Error("Production endpoint is forbidden in integration tests");
process.env.DATABASE_URL = env.TEST_DATABASE_URL;
process.env.VERCEL_ENV = "preview";
process.env.PUBLIC_BASE_URL = "https://weekend-menu.vercel.app";
process.env.SESSION_SECRET = "isolated-test-signing-secret-" + randomUUID();
for (const key of [
  "APPLE_PASS_CERT",
  "APPLE_PASS_TYPE_ID",
  "APPLE_APNS_KEY",
  "GOOGLE_WALLET_SERVICE_ACCOUNT",
  "GOOGLE_WALLET_ISSUER_ID",
])
  delete process.env[key];
const db = neon(env.TEST_DATABASE_URL);
const store = await import("../lib/loyalty-store.ts");
const tokens = await import("../lib/customer-token.ts");
const { ExistingContactError } = await import("../lib/loyalty-validation.ts");

test(
  "actual backend: safe migration, concurrency, recovery, private tokens and durable retries",
  { timeout: 180000 },
  async (t) => {
    const branch =
      await db`SELECT current_setting('neon.branch_id',true) AS id`;
    assert.equal(
      branch[0].id,
      env.TEST_BRANCH_ID,
      "Endpoint must belong to the isolated branch",
    );
    const before =
      await db`SELECT count(*)::int AS n,md5(string_agg(to_jsonb(c)::text,'' ORDER BY id)) AS digest FROM customers c`;
    assert.ok(
      before[0].n >= 57,
      "The restoration must contain the complete baseline",
    );
    await store.ensureSchema();
    await store.ensureSchema();
    assert.equal((await store.loyaltyHealth()).healthy, true);
    const ids = [];
    const c = await store.createCustomer({
      name: "Isolated test person",
      email: randomUUID() + "@example.invalid",
    });
    ids.push(c.id);
    const other = await store.createCustomer({
      name: "Isolated second person",
      phone: "999" + String(Date.now()).slice(-10),
    });
    ids.push(other.id);
    await t.test(
      "existing contacts never expose or merge another card",
      async () => {
        await assert.rejects(
          store.createCustomer({ name: "Another person", email: c.email }),
          ExistingContactError,
        );
        await assert.rejects(
          store.createCustomer({
            name: "Another person",
            email: c.email,
            phone: other.phone,
          }),
          ExistingContactError,
        );
        assert.equal((await store.getCustomer(c.id)).totalStamps, 0);
      },
    );
    const alias = randomUUID(),
      aliasCode =
        "T" +
        randomUUID()
          .replace(/[^A-F2-9]/gi, "")
          .slice(0, 5)
          .toUpperCase()
          .padEnd(5, "Z");
    await db`INSERT INTO customer_aliases(alias_id,alias_code,customer_id) VALUES(${alias},${aliasCode},${c.id})`;
    await t.test(
      "legacy QR and Wallet tokens survive an admin signing-key rotation",
      async () => {
        const expected = createHmac("sha256", process.env.SESSION_SECRET)
          .update("stamp:" + c.id)
          .digest("base64url");
        assert.equal(await tokens.signCustomerId(c.id), expected);
        const oldAlias = await tokens.signCustomerId(alias);
        process.env.SESSION_SECRET =
          "rotated-isolated-admin-secret-" + randomUUID();
        assert.equal(await tokens.signCustomerId(c.id), expected);
        assert.equal(await tokens.verifyCustomerToken(alias, oldAlias), true);
        assert.equal(await tokens.verifyCustomerToken(c.id, oldAlias), false);
        assert.equal(
          (await store.findByCode(aliasCode.toLowerCase())).id,
          c.id,
        );
      },
    );
    await t.test(
      "25 identical concurrent submissions add exactly one stamp",
      async () => {
        const operation = randomUUID();
        const results = await Promise.all(
          Array.from({ length: 25 }, () =>
            store.addStamp(c.id, "isolated-test", operation),
          ),
        );
        assert.equal(results.filter(Boolean).length, 25);
        assert.equal((await store.getCustomer(c.id)).totalStamps, 1);
      },
    );
    await t.test(
      "19 distinct concurrent stamps preserve all balances and rewards",
      async () => {
        await Promise.all(
          Array.from({ length: 19 }, () =>
            store.addStamp(c.id, "isolated-test", randomUUID()),
          ),
        );
        const current = await store.getCustomer(c.id);
        assert.equal(current.totalStamps, 20);
        assert.equal(current.stamps, 0);
        assert.equal(current.rewardsAvailable, 2);
      },
    );
    await t.test(
      "concurrent redemptions cannot spend more rewards than exist",
      async () => {
        const keys = Array.from({ length: 5 }, () => randomUUID());
        const results = await Promise.all(
          keys.map((key) => store.redeemReward(c.id, "isolated-test", key)),
        );
        assert.equal(results.filter(Boolean).length, 2);
        assert.equal((await store.getCustomer(c.id)).rewardsAvailable, 0);
      },
    );
    await t.test(
      "archive and restore preserve identity and a failed retry stays failed",
      async () => {
        const operation = randomUUID(),
          before = await store.getCustomer(c.id);
        await store.archiveCustomer(c.id, "isolated-test");
        assert.equal(
          await store.addStamp(c.id, "isolated-test", operation),
          null,
        );
        await store.restoreCustomer(c.id, "isolated-test");
        assert.equal(
          await store.addStamp(c.id, "isolated-test", operation),
          null,
        );
        const after = await store.getCustomer(c.id);
        assert.equal(after.code, before.code);
        assert.equal(after.totalStamps, before.totalStamps);
      },
    );
    await t.test(
      "DB rejects deletion, history tampering, alias reassignment and invalid balances",
      async () => {
        await assert.rejects(
          db`DELETE FROM customers WHERE id=${c.id}`,
          (e) => e.code === "55000",
        );
        await assert.rejects(
          db`UPDATE customers SET stamps=11 WHERE id=${c.id}`,
          (e) => e.code === "23514",
        );
        await assert.rejects(
          db`DELETE FROM customer_aliases WHERE alias_id=${alias}`,
          (e) => e.code === "55000",
        );
        await assert.rejects(
          db`UPDATE customer_aliases SET customer_id=${other.id} WHERE alias_id=${alias}`,
          (e) => e.code === "55000",
        );
        await assert.rejects(
          db`UPDATE loyalty_events SET actor='tamper' WHERE customer_id=${c.id}`,
          (e) => e.code === "55000",
        );
        await assert.rejects(
          db`DELETE FROM loyalty_card_tokens WHERE serial=${c.id}`,
          (e) => e.code === "55000",
        );
      },
    );
    await t.test(
      "Apple registrations are idempotent and can recover a revoked device",
      async () => {
        const reg = {
          serial: alias,
          deviceLibraryId: "isolated-device",
          pushToken: "a".repeat(64),
          registeredAt: new Date().toISOString(),
        };
        assert.equal(await store.addAppleRegistration(reg), true);
        assert.equal(await store.addAppleRegistration(reg), false);
        await store.revokeApplePushToken(reg.pushToken);
        assert.equal((await store.getRegistrationsForSerial(c.id)).length, 0);
        assert.equal(await store.addAppleRegistration(reg), false);
        assert.equal((await store.getRegistrationsForSerial(c.id)).length, 1);
        const tags = await store.getSerialsForDevice("isolated-device");
        assert.deepEqual(tags.serials, [alias]);
        assert.deepEqual(
          (await store.getSerialsForDevice("isolated-device", tags.lastUpdated))
            .serials,
          [],
        );
      },
    );
    await t.test(
      "a Wallet configuration outage preserves the committed stamp and its retry job",
      async () => {
        await store.addStamp(c.id, "isolated-test", randomUUID());
        const job =
          await db`SELECT attempts,last_error FROM wallet_sync_jobs WHERE customer_id=${c.id}`;
        assert.ok(job[0].attempts > 0);
        assert.equal(job[0].last_error, "apple_unconfigured");
        assert.equal((await store.getCustomer(c.id)).totalStamps, 21);
        await db`UPDATE wallet_sync_jobs SET available_at=now() WHERE customer_id=${c.id}`;
        const [claim] = await store.claimWalletJobs(1, c.id);
        assert.ok(claim);
        assert.equal((await store.claimWalletJobs(1, c.id)).length, 0);
        await db`UPDATE customers SET name='Isolated revision test' WHERE id=${c.id}`;
        await store.finishWalletJob(claim);
        assert.equal(
          (
            await db`SELECT count(*)::int AS n FROM wallet_sync_jobs WHERE customer_id=${c.id}`
          )[0].n,
          1,
          "Newer changes cannot be erased by an older delivery",
        );
      },
    );
    await t.test(
      "all pre-existing customer records are byte-for-byte preserved",
      async () => {
        const after =
          await db`SELECT count(*)::int AS n,md5(string_agg(to_jsonb(c)::text,'' ORDER BY id)) AS digest FROM customers c WHERE id<>ALL(${ids}::text[])`;
        assert.deepEqual(after, before);
        assert.equal((await store.loyaltyHealth()).healthy, true);
      },
    );
    await t.test(
      "actual Apple routes: authentication, registration, cursor recovery, pass download and safe outage",
      async () => {
        const { configureTestWallet } = await import(
          "../scripts/test-wallet-fixture.mjs"
        );
        configureTestWallet();
        const { NextRequest } = await import("next/server");
        const registration = await import(
          "../app/api/wallet/apple/v1/devices/[deviceId]/registrations/[passTypeId]/[serial]/route.ts"
        );
        const list = await import(
          "../app/api/wallet/apple/v1/devices/[deviceId]/registrations/[passTypeId]/route.ts"
        );
        const pass = await import(
          "../app/api/wallet/apple/v1/passes/[passTypeId]/[serial]/route.ts"
        );
        const download = await import("../app/api/wallet/apple/[id]/route.ts");
        const values = {
          deviceId: "isolated-api-device",
          passTypeId: process.env.APPLE_PASS_TYPE_ID,
          serial: c.id,
        };
        const params = { params: Promise.resolve(values) },
          auth = "ApplePass " + (await tokens.signCustomerId(c.id));
        const req = () =>
          new NextRequest("https://fixture.invalid/register", {
            method: "POST",
            headers: {
              authorization: auth,
              "content-type": "application/json",
            },
            body: JSON.stringify({ pushToken: "b".repeat(64) }),
          });
        assert.equal(
          (
            await registration.POST(
              new NextRequest("https://fixture.invalid/register", {
                method: "POST",
              }),
              params,
            )
          ).status,
          401,
        );
        assert.equal(
          (
            await registration.POST(req(), {
              params: Promise.resolve({ ...values, passTypeId: "pass.wrong" }),
            })
          ).status,
          404,
        );
        assert.equal((await registration.POST(req(), params)).status, 201);
        assert.equal((await registration.POST(req(), params)).status, 200);
        const listed = await list.GET(
          new NextRequest("https://fixture.invalid/list"),
          params,
        );
        assert.equal(listed.status, 200);
        const cursor = (await listed.json()).lastUpdated;
        assert.equal(
          (
            await list.GET(
              new NextRequest(
                "https://fixture.invalid/list?passesUpdatedSince=" +
                  encodeURIComponent(cursor),
              ),
              params,
            )
          ).status,
          204,
        );
        assert.equal(
          (
            await list.GET(
              new NextRequest(
                "https://fixture.invalid/list?passesUpdatedSince=invalid",
              ),
              params,
            )
          ).status,
          200,
        );
        const latest = await pass.GET(
          new NextRequest("https://fixture.invalid/pass", {
            headers: { authorization: auth },
          }),
          params,
        );
        assert.equal(latest.status, 200);
        assert.equal(
          Buffer.from(await latest.arrayBuffer())
            .subarray(0, 2)
            .toString(),
          "PK",
        );
        const publicParams = { params: Promise.resolve({ id: c.id }) };
        process.env.VERCEL_ENV = "production";
        try {
          assert.equal(
            (
              await download.GET(
                new NextRequest("https://fixture.invalid/download"),
                publicParams,
              )
            ).status,
            503,
            "A wrong live branch is unavailable, not a missing customer",
          );
        } finally {
          process.env.VERCEL_ENV = "preview";
        }
        delete process.env.APPLE_PASS_CERT;
        const fallback = await download.GET(
          new NextRequest("https://fixture.invalid/download", {
            headers: { accept: "text/html" },
          }),
          publicParams,
        );
        assert.equal(fallback.status, 503);
        assert.ok((await fallback.text()).includes("Abrir mi tarjeta"));
      },
    );
  },
);
