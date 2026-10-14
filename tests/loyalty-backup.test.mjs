import { test } from "node:test";
import { strict as assert } from "node:assert";
import { randomBytes } from "node:crypto";
import {
  encryptLoyaltyBackup,
  decryptLoyaltyBackup,
  backupDigest,
  planMissingCardRecovery,
  assertCompleteCardTokens,
} from "../lib/loyalty-backup-format.ts";
const data = {
  version: 1,
  createdAt: "2026-10-13T22:00:00Z",
  customers: [
    {
      id: "one",
      code: "ABC222",
      name: "Private fixture",
      email: "fixture@example.invalid",
      stamps: 2,
    },
  ],
  aliases: [],
  registrations: [],
  events: [],
  operations: [],
  tokens: [{ serial: "one", token: "private-fixture-token" }],
};
test('a backup requires valid permanent tokens for every current and alias serial',()=>{
  const complete={...data,tokens:[{serial:'one',token:'a'.repeat(43)},{serial:'old-one',token:'b'.repeat(43)}],aliases:[{alias_id:'old-one',customer_id:'one'}]};
  assert.doesNotThrow(()=>assertCompleteCardTokens(complete));
  assert.throws(()=>assertCompleteCardTokens({...complete,tokens:complete.tokens.slice(0,1)}));
  assert.throws(()=>assertCompleteCardTokens({...complete,tokens:[]}));
});
test("backup roundtrip preserves every field and ciphertext does not contain contacts or Wallet tokens", () => {
  const key = randomBytes(32).toString("hex"),
    cipher = encryptLoyaltyBackup(data, key);
  assert.equal(cipher.includes("fixture@example.invalid"), false);
  assert.equal(cipher.includes("private-fixture-token"), false);
  assert.deepEqual(decryptLoyaltyBackup(cipher, key), data);
  assert.equal(
    backupDigest(decryptLoyaltyBackup(cipher, key)),
    backupDigest(data),
  );
});
test("corrupt backups and wrong keys fail before recovery", () => {
  const key = randomBytes(32).toString("hex"),
    cipher = encryptLoyaltyBackup(data, key),
    parts = cipher.split(".");
  parts[3] = (parts[3][0] === "A" ? "B" : "A") + parts[3].slice(1);
  assert.throws(() => decryptLoyaltyBackup(parts.join("."), key));
  assert.throws(() =>
    decryptLoyaltyBackup(cipher, randomBytes(32).toString("hex")),
  );
});
test("recovery planning retains current records and flags contact/code conflicts", () => {
  const current = {
    ...data,
    customers: [{ id: "two", code: "ABC222", stamps: 9 }],
  };
  const plan = planMissingCardRecovery(data, current);
  assert.deepEqual(plan.missing, ["one"]);
  assert.deepEqual(plan.conflicts, ["one"]);
  assert.equal(plan.existingPreserved, 1);
  assert.equal(plan.canApply, false);
  assert.equal(current.customers[0].stamps, 9);
});
