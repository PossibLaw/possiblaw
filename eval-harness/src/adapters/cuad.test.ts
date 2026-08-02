// eval-harness/src/adapters/cuad.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadCuadCases } from "./cuad.ts";

// CUAD fixtures.jsonl schema: id, text, question, gold_label, gold_spans
// Maps: id → slug, question → input_brief, gold_label → golden check value

test("maps CUAD fixtures.jsonl into deterministic golden cases", () => {
  const cases = loadCuadCases("../layer/evals/datasets/cuad/fixtures.jsonl");
  assert.ok(cases.length > 0, "should load at least one case");
  assert.equal(cases[0].grading.mode, "deterministic");
  assert.equal(cases[0].grading.checks?.[0].type, "golden");
  assert.equal(cases[0].source.kind, "benchmark");
  assert.equal(cases[0].source.name, "cuad");
});

test("cases have correct structure from CUAD fields", () => {
  const cases = loadCuadCases("../layer/evals/datasets/cuad/fixtures.jsonl");
  const first = cases[0];
  // id → slug
  assert.equal(first.slug, "cuad-fixture-001");
  // question → input_brief: a real extraction instruction carrying the CUAD
  // category, not the bare category name (a bare "Governing Law" gives the
  // model no task framing and collapses tokenF1 — observed 0.07 mean on the
  // 2026-08-02 run vs 0.58 historical)
  assert.ok(first.input_brief.includes("Governing Law"));
  assert.ok(
    /exact/i.test(first.input_brief) && /only/i.test(first.input_brief),
    "input_brief must instruct verbatim span-only extraction",
  );
  // gold_label → golden check value
  assert.ok(first.grading.checks?.[0].value !== undefined);
  assert.equal(first.grading.checks?.[0].threshold, 0.7);
  // target is clause-extractor, targetType is agent (verified above)
  assert.equal(first.target, "clause-extractor");
  assert.equal(first.targetType, "agent");
  assert.equal(first.lane, "extractive");
});
