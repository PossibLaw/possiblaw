import { test } from "node:test";
import assert from "node:assert/strict";

test("orchestration-eval package builds and runs node:test", () => {
  assert.equal(1 + 1, 2);
});
