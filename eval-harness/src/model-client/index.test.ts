// eval-harness/src/model-client/index.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { MockModelClient } from "./mock.ts";
import { driverFor } from "./index.ts";

test("mock returns a scripted output", async () => {
  const mc = new MockModelClient({ "claude_local": "MOCK OUTPUT" });
  const r = await mc.run("hi", { variant: "claude", adapterType: "claude_local", model: "m", params: {} });
  assert.equal(r.ok && r.output, "MOCK OUTPUT");
});

test("driverFor returns a driver for each of the 4 adapter types", () => {
  for (const t of ["claude_local", "codex_local", "gemini_local", "opencode_local"]) {
    assert.equal(typeof driverFor(t), "function");
  }
});

test("driverFor throws on unknown adapter type", () => {
  assert.throws(() => driverFor("mystery_local"));
});
