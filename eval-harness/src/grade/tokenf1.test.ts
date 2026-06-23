// eval-harness/src/grade/tokenf1.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { tokenF1 } from "./tokenf1.ts";

test("identical strings score 1", () => { assert.equal(tokenF1("a b c", "a b c"), 1); });
test("disjoint strings score 0", () => { assert.equal(tokenF1("x", "y"), 0); });
test("partial overlap is between 0 and 1", () => { const s = tokenF1("thirty days notice", "thirty (30) days prior written notice"); assert.ok(s > 0 && s < 1); });
