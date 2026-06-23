// eval-harness/src/variants.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveModel } from "./variants.ts";

const FIXTURE = {
  variants: {
    claude: {
      default: { adapterType: "claude_local", adapterConfig: { model: "claude-sonnet", timeoutSec: 600 } },
      lanes: { drafting: { timeoutSec: 900 }, review: { timeoutSec: 900 } },
    },
    ollama: {
      default: { adapterType: "opencode_local", adapterConfig: { model: "llama3.1:70b" } },
      lanes: { drafting: {} },
    },
  },
};

test("resolves adapterType + model and merges lane overrides over default config", () => {
  const r = resolveModel(FIXTURE, "claude", "drafting");
  assert.equal(r.adapterType, "claude_local");
  assert.equal(r.model, "claude-sonnet");
  assert.equal(r.params.timeoutSec, 900); // lane override wins
});

test("resolves a different adapter family", () => {
  const r = resolveModel(FIXTURE, "ollama", "drafting");
  assert.equal(r.adapterType, "opencode_local");
  assert.equal(r.model, "llama3.1:70b");
});

test("throws on unknown variant", () => {
  assert.throws(() => resolveModel(FIXTURE, "nope", "drafting"));
});
