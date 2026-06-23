// eval-harness/src/runner.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { runCase } from "./runner.ts";
import { MockModelClient } from "./model-client/mock.ts";
import type { Case } from "./types.ts";

const c: Case = {
  slug: "nda-gov", target: "nda-drafter", targetType: "agent", lane: "drafting",
  input_brief: "Draft NDA, Delaware.", documents: [],
  grading: { mode: "deterministic", checks: [{ id: "g", type: "regex", pattern: "(?i)Delaware" }] },
  source: { kind: "local" },
};

test("runCase asks the model then grades deterministically", async () => {
  const client = new MockModelClient({ claude_local: "Governed by the laws of Delaware." });
  const rec = await runCase(c, { variant: "claude", budget: null, client,
    variantsPath: "fixtures/variants.yaml", paperclipYamlPath: "fixtures/.paperclip.yaml", casesDir: "x" });
  assert.equal(rec.pass, true);
});

test("a skipped model call yields a skipped record, not a throw", async () => {
  const client = { run: async () => ({ ok: false as const, skipped: true as const, reason: "claude not installed" }) };
  const rec = await runCase(c, { variant: "claude", budget: null, client,
    variantsPath: "fixtures/variants.yaml", paperclipYamlPath: "fixtures/.paperclip.yaml", casesDir: "x" });
  assert.equal(rec.skipped, true);
  assert.equal(rec.pass, false);
});
