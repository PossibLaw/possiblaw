// eval-harness/src/grade/deterministic.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { runDeterministic } from "./deterministic.ts";

test("regex + contains both pass", () => {
  const r = runDeterministic("laws of the State of Delaware, two (2) year term", [
    { id: "g", type: "regex", pattern: "(?i)State of Delaware" },
    { id: "t", type: "contains", value: "two (2) year" },
  ]);
  assert.equal(r.pass, true); assert.equal(r.score, 1);
});
test("a failing check makes the case fail", () => {
  const r = runDeterministic("nothing here", [{ id: "g", type: "regex", pattern: "Delaware" }]);
  assert.equal(r.pass, false);
});
test("golden uses tokenF1 with a threshold", () => {
  const r = runDeterministic("the laws of the State of Delaware", [
    { id: "gold", type: "golden", value: "laws of the State of Delaware", threshold: 0.6 },
  ]);
  assert.equal(r.results[0].pass, true);
});
