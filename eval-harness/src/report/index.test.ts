// eval-harness/src/report/index.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { summarize, renderMarkdown } from "./index.ts";

const cases = [
  { slug: "a", target: "nda-drafter", mode: "deterministic" as const, pass: true, score: 1, costUsd: 0.01, ms: 100, skipped: false, detail: "" },
  { slug: "b", target: "nda-drafter", mode: "rubric" as const, pass: false, score: 0.5, costUsd: 0.02, ms: 200, skipped: false, detail: "missing term" },
];

test("summarize computes mean and total cost", () => {
  const r = summarize("nda-drafter", "claude", "drafting", "claude_local/claude-sonnet", cases, null, false, "2026-06-22T00:00:00Z");
  assert.equal(r.meanScore, 0.75);
  assert.equal(Number(r.totalCost.toFixed(2)), 0.03);
});

test("markdown shows header table and a failure row", () => {
  const r = summarize("nda-drafter", "claude", "drafting", "claude_local/claude-sonnet", cases, null, false, "2026-06-22T00:00:00Z");
  const md = renderMarkdown(r);
  assert.match(md, /# PossibLaw Eval Report/);
  assert.match(md, /nda-drafter/);
  assert.match(md, /missing term/);
});
