import { test, mock } from "node:test";
import { strict as assert } from "node:assert";
import { createHmac } from "node:crypto";
import { createSessionCookie, verifySessionToken } from "../lib/auth.ts";
import { readLimitedJson } from "../lib/limited-json.ts";
import { trustedClientIp, privateRateBucket } from "../lib/request-limits.ts";

test("sessions revoke removed staff, changed passwords and explicit versions without changing Wallet signing keys", async () => {
  process.env.SESSION_SECRET = "synthetic-session-secret-for-offline-tests";
  process.env.ADMIN_USER = "fixture.admin";
  process.env.ADMIN_PASSWORD_HASH = "synthetic-credential-version-one";
  delete process.env.ADMIN_SESSION_VERSION;
  delete process.env.ADMIN_USERS_B64;
  const cookie = await createSessionCookie("fixture.admin");
  assert.deepEqual(await verifySessionToken(cookie.value), {
    userId: "fixture.admin",
  });
  assert.equal(cookie.maxAge, 86400);
  assert.equal(cookie.httpOnly, true);
  process.env.ADMIN_PASSWORD_HASH = "synthetic-credential-version-two";
  assert.equal(await verifySessionToken(cookie.value), null);
  const next = await createSessionCookie("fixture.admin");
  process.env.ADMIN_SESSION_VERSION = "force-revoke";
  assert.equal(await verifySessionToken(next.value), null);
  delete process.env.ADMIN_SESSION_VERSION;
  process.env.ADMIN_USERS_B64 = Buffer.from(
    JSON.stringify([{ u: "fixture.staff", h: "synthetic-staff-version" }]),
  ).toString("base64");
  const staff = await createSessionCookie("fixture.staff");
  assert.deepEqual(await verifySessionToken(staff.value), {
    userId: "fixture.staff",
  });
  process.env.ADMIN_USERS_B64 = Buffer.from("[]").toString("base64");
  assert.equal(await verifySessionToken(staff.value), null);
  assert.equal(
    process.env.SESSION_SECRET,
    "synthetic-session-secret-for-offline-tests",
  );
});
test("sessions reject legacy, modified, expired and oversized cookies and have no sliding renewal", async () => {
  process.env.SESSION_SECRET = "synthetic-session-secret-for-offline-tests";
  process.env.ADMIN_USER = "fixture.admin";
  process.env.ADMIN_PASSWORD_HASH = "synthetic-credential-version-one";
  const now = Date.now(),
    cookie = await createSessionCookie("fixture.admin");
  assert.equal(await verifySessionToken(cookie.value.slice(0, -1) + "!"), null);
  assert.equal(await verifySessionToken("a".repeat(3000)), null);
  const legacy = "fixture.admin." + (Math.floor(now / 1000) + 180 * 86400);
  assert.equal(
    await verifySessionToken(
      legacy +
        "." +
        createHmac("sha256", process.env.SESSION_SECRET)
          .update(legacy)
          .digest("base64url"),
    ),
    null,
  );
  const clock = mock.method(Date, "now", () => now + 86400 * 1000 + 1000);
  try {
    assert.equal(await verifySessionToken(cookie.value), null);
  } finally {
    clock.mock.restore();
  }
});
test("JSON byte bounds hold with absent or false length headers and multibyte input", async () => {
  const body = JSON.stringify({ logs: ["á".repeat(9000)] });
  for (const h of [{}, { "content-length": "1" }])
    await assert.rejects(
      readLimitedJson(
        new Request("https://fixture.invalid", {
          method: "POST",
          headers: h,
          body,
        }),
        16384,
      ),
    );
  assert.deepEqual(
    await readLimitedJson(
      new Request("https://fixture.invalid", {
        method: "POST",
        body: '{"logs":[]}',
      }),
      16384,
    ),
    { logs: [] },
  );
});
test("request buckets do not retain raw contacts or addresses and untrusted headers cannot select a client identity", () => {
  process.env.SESSION_SECRET = "synthetic-session-secret-for-offline-tests";
  const raw = "fixture@example.invalid",
    bucket = privateRateBucket("fixture", raw);
  assert.match(bucket, /^fixture:[a-f0-9]{64}$/);
  assert.equal(bucket.includes(raw), false);
  delete process.env.VERCEL;
  assert.equal(
    trustedClientIp(new Headers({ "x-forwarded-for": "192.0.2.1" })),
    "untrusted-client",
  );
  process.env.VERCEL = "1";
  assert.equal(
    trustedClientIp(new Headers({ "x-forwarded-for": "192.0.2.1" })),
    "192.0.2.1",
  );
  assert.equal(
    trustedClientIp(new Headers({ "x-forwarded-for": "invented" })),
    "unknown-client",
  );
  delete process.env.VERCEL;
});
