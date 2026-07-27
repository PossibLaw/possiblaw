import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  LaneResolutionError,
  isModelLane,
  laneTraceFields,
  loadVariants,
  parseVariants,
  resolveLane,
} from "./lane-resolver.ts";

const FIXTURE = `
schema: possiblaw/variants/v1
variants:
  codex:
    label: "Codex CLI"
    dataTerms:
      tier: cloud
      zdr: false
      trains: false
    default:
      adapterType: codex_local
      adapterConfig:
        model: gpt-5.5
        modelReasoningEffort: medium
        timeoutSec: 600
    lanes:
      primary:
        modelReasoningEffort: high
      drafting:
        modelReasoningEffort: high
        timeoutSec: 900
      extractive: {}
    per_agent:
      deadline-calculator:
        model: gpt-5.5-mini
        timeoutSec: 120
  local-only:
    default:
      adapterType: opencode_local
      adapterConfig:
        model: qwen3
    lanes: {}
    per_agent: {}
`;

const cfg = parseVariants(FIXTURE);

// ---------------------------------------------------------------------------
// Merge layering
// ---------------------------------------------------------------------------

test("the default layer applies when a lane adds nothing", () => {
  const r = resolveLane(cfg, "codex", "extractive");
  assert.equal(r.adapterType, "codex_local");
  assert.equal(r.model, "gpt-5.5");
  assert.equal(r.adapterConfig["modelReasoningEffort"], "medium");
  assert.deepEqual(r.appliedLayers, ["default"], "an empty lane is not a layer");
});

test("a lane overrides the default and says so", () => {
  const r = resolveLane(cfg, "codex", "primary");
  assert.equal(r.adapterConfig["modelReasoningEffort"], "high");
  assert.equal(r.adapterConfig["timeoutSec"], 600, "untouched keys survive");
  assert.deepEqual(r.appliedLayers, ["default", "lane"]);
});

test("per-agent wins over lane, which wins over default", () => {
  const r = resolveLane(cfg, "codex", "drafting", "deadline-calculator");
  assert.equal(r.model, "gpt-5.5-mini", "per_agent replaced the model");
  assert.equal(r.adapterConfig["timeoutSec"], 120, "per_agent beat the lane's 900");
  assert.equal(r.adapterConfig["modelReasoningEffort"], "high", "lane value still applies");
  assert.deepEqual(r.appliedLayers, ["default", "lane", "per_agent"]);
});

test("an agent with no per-agent entry resolves like any other", () => {
  const named = resolveLane(cfg, "codex", "drafting", "commercial-drafting");
  const anon = resolveLane(cfg, "codex", "drafting");
  assert.equal(named.model, anon.model);
  assert.deepEqual(named.appliedLayers, ["default", "lane"]);
});

test("data terms ride along so a trace can show why a lane was permissible", () => {
  assert.equal(resolveLane(cfg, "codex", "primary").dataTerms?.tier, "cloud");
  assert.equal(resolveLane(cfg, "local-only", "primary").dataTerms, undefined);
});

// ---------------------------------------------------------------------------
// Fail-loud
// ---------------------------------------------------------------------------

test("an unknown variant throws and names the known ones", () => {
  try {
    resolveLane(cfg, "gpt-9", "primary");
    assert.fail("should have thrown");
  } catch (err) {
    assert.ok(err instanceof LaneResolutionError);
    assert.match(err.message, /unknown variant 'gpt-9'/);
    assert.match(err.message, /codex/);
  }
});

test("an unknown lane throws rather than falling back to a default model", () => {
  // Silently defaulting would put a WRONG model id into an audit record.
  assert.throws(
    () => resolveLane(cfg, "codex", "reasoning" as never),
    LaneResolutionError,
  );
});

test("prototype-named variants do not resolve to inherited members", () => {
  for (const name of ["__proto__", "constructor", "toString"]) {
    assert.throws(() => resolveLane(cfg, name, "primary"), LaneResolutionError, name);
  }
});

test("a variant without default.adapterType throws", () => {
  const bad = parseVariants("variants:\n  broken:\n    lanes: {}\n");
  assert.throws(() => resolveLane(bad, "broken", "primary"), LaneResolutionError);
});

test("malformed variants files throw on parse", () => {
  assert.throws(() => parseVariants("variants: [a, b]"), LaneResolutionError);
  assert.throws(() => parseVariants("schema: x"), LaneResolutionError);
  assert.throws(() => parseVariants("::: not yaml"), LaneResolutionError);
  assert.throws(() => loadVariants("/nonexistent/variants.yaml"), LaneResolutionError);
});

test("isModelLane accepts exactly the five lanes", () => {
  for (const l of ["primary", "routing", "drafting", "review", "extractive"]) {
    assert.equal(isModelLane(l), true, l);
  }
  for (const l of ["", "PRIMARY", "fast", null, 7]) {
    assert.equal(isModelLane(l), false, String(l));
  }
});

// ---------------------------------------------------------------------------
// Trace projection
// ---------------------------------------------------------------------------

test("trace fields carry accountability, not operational noise", () => {
  const fields = laneTraceFields(resolveLane(cfg, "codex", "drafting", "deadline-calculator"));
  assert.deepEqual(fields, {
    modelLane: "drafting",
    variant: "codex",
    adapter: "codex_local",
    model: "gpt-5.5-mini",
  });
  // timeoutSec / sandbox flags are operational settings; they do not belong in
  // an audit record and must not leak in through this projection.
  assert.ok(!("timeoutSec" in fields));
  assert.ok(!("adapterConfig" in fields));
});

// ---------------------------------------------------------------------------
// Against the real shipped file
// ---------------------------------------------------------------------------

test("resolves every lane of every shipped variant", () => {
  const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
  const file = path.join(repoRoot, "companies", "legal-operations", "variants.yaml");
  if (!fs.existsSync(file)) return; // package used standalone

  const real = loadVariants(file);
  const names = Object.keys(real.variants);
  assert.ok(names.length >= 11, `expected the full variant matrix, got ${names.length}`);

  for (const name of names) {
    for (const lane of ["primary", "routing", "drafting", "review", "extractive"] as const) {
      const r = resolveLane(real, name, lane);
      assert.ok(r.adapterType.length > 0, `${name}/${lane} has an adapter`);
      // Every shipped variant names a concrete model — that is the whole point
      // of being able to answer "which model ran" from config alone.
      assert.equal(typeof r.model, "string", `${name}/${lane} resolves a model`);
    }
  }
});
