import { strict as assert } from "node:assert";
import { test } from "node:test";
import { normalizeCode } from "../lib/loyalty-code.ts";

test("a printed code can be entered with spaces, hyphens and lowercase", () => {
  assert.equal(normalizeCode(" h4-dg xu \n"), "H4DGXU");
  assert.equal(normalizeCode("\tkk qm lh\t"), "KKQMLH");
  assert.equal(normalizeCode(" -- "), "");
  assert.equal(normalizeCode("H4DGXU"), "H4DGXU");
});
