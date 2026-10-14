import { test } from "node:test";
import { strict as assert } from "node:assert";
import {
  updatedSerials,
  retryDelaySeconds,
  validAppleIdentifiers,
} from "../lib/apple-protocol.ts";
import { validateJoin, validOperationId } from "../lib/loyalty-validation.ts";
import { assertLoyaltyBranch } from "../lib/loyalty-config.ts";

test("a moved production endpoint cannot silently read another branch", () => {
  assert.doesNotThrow(() =>
    assertLoyaltyBranch("br-crimson-fire-ac3ov0rp", "production"),
  );
  for (const branch of [undefined, "br-copy"])
    assert.throws(() => assertLoyaltyBranch(branch, "production"));
});
test("Apple cursor retains changes within the same millisecond and converges to 204", () => {
  const rows = [{ serial: "pass-a", updatedAt: "2026-10-13T12:00:00.123500Z" }];
  assert.deepEqual(
    updatedSerials(rows, "2026-10-13T12:00:00.123400Z").serials,
    ["pass-a"],
  );
  assert.deepEqual(updatedSerials(rows, "2026-10-13T12:00:00.123Z").serials, [
    "pass-a",
  ]);
  assert.deepEqual(
    updatedSerials(rows, updatedSerials(rows).lastUpdated).serials,
    [],
  );
});
test("invalid or future Apple cursors trigger a full recovery sync", () => {
  const rows = [{ serial: "pass-a", updatedAt: "2026-10-13T12:00:00.000000Z" }];
  for (const cursor of [undefined, "wrong", "9999-12-31T23:59:59.999Z"])
    assert.deepEqual(updatedSerials(rows, cursor).serials, ["pass-a"]);
});
test("registration input rejects oversized contacts and requires a contact", () => {
  assert.deepEqual(
    validateJoin({ name: " Persona ", email: " USER@example.com " }),
    { name: "Persona", email: "user@example.com", phone: null },
  );
  for (const input of [
    { name: "A", phone: "3001234567" },
    { name: "Persona" },
    { name: "Persona", email: "bad" },
    { name: "Persona", phone: "12" },
    { name: "x".repeat(121), phone: "3001234567" },
  ])
    assert.throws(() => validateJoin(input));
});
test("operation keys reject missing and malformed references", () => {
  assert.equal(validOperationId("08bc905d-981e-421d-a1e4-bb08c3f3f55f"), true);
  for (const value of [
    "",
    "not-an-id",
    "08bc905d-981e-421d-a1e4-bb08c3f3f55f\n",
  ])
    assert.equal(validOperationId(value), false);
});
test("Apple endpoints accept only the configured pass type", () => {
  process.env.APPLE_PASS_TYPE_ID = "pass.fixture.weekend";
  assert.equal(
    validAppleIdentifiers("device1", "pass.fixture.weekend", "serial1"),
    true,
  );
  assert.equal(
    validAppleIdentifiers("device1", "pass.other", "serial1"),
    false,
  );
  assert.equal(
    validAppleIdentifiers("device/1", "pass.fixture.weekend", "serial1"),
    false,
  );
});
test("retry delays grow and are bounded", () => {
  assert.ok(retryDelaySeconds(2) > retryDelaySeconds(1));
  assert.equal(retryDelaySeconds(999), 3600);
});
