import { test } from "node:test";
import assert from "node:assert/strict";
import { parseArgs } from "./index.ts";

test("parseArgs reads run flags with defaults", () => {
  const a = parseArgs(["run", "--benchmark", "lab", "--limit", "3", "--runs", "2", "--config", "openrouter-cost", "--arms", "A,B", "--budget", "500"]);
  assert.equal(a.command, "run");
  assert.equal(a.benchmark, "lab");
  assert.equal(a.limit, 3);
  assert.equal(a.runs, 2);
  assert.equal(a.config, "openrouter-cost");
  assert.deepEqual(a.arms, ["A", "B"]);
  assert.equal(a.budgetCents, 500);
});

test("parseArgs defaults runs=3 and arms=A,B", () => {
  const a = parseArgs(["run", "--benchmark", "lab"]);
  assert.equal(a.runs, 3);
  assert.deepEqual(a.arms, ["A", "B"]);
});

test("parseArgs recognizes list", () => {
  assert.equal(parseArgs(["list"]).command, "list");
});
