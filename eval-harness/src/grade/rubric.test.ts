// eval-harness/src/grade/rubric.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseVerdict, runRubric } from "./rubric.ts";
import type { ModelClient } from "../model-client/types.ts";

test("parseVerdict reads PASS/FAIL case-insensitively", () => {
  assert.equal(parseVerdict("Verdict: PASS"), true);
  assert.equal(parseVerdict("fail - missing term"), false);
});

const judgeAll = (verdict: string): ModelClient => ({ run: async () => ({ ok: true, output: verdict, costUsd: 0, ms: 1 }) });
const m = { variant: "claude", adapterType: "claude_local", model: "j", params: {} };

test("all-pass: one FAIL fails the case", async () => {
  const rubric = { judge_model: "review", pass_rule: "all" as const, criteria: [{ id: "a", prompt: "?" }, { id: "b", prompt: "?" }] };
  // judge returns PASS for a, FAIL for b → emulate by a counter client:
  let n = 0;
  const client: ModelClient = { run: async () => ({ ok: true, output: n++ === 0 ? "PASS" : "FAIL", costUsd: 0, ms: 1 }) };
  const r = await runRubric("out", rubric, client, () => m, m);
  assert.equal(r.pass, false);
  assert.equal(r.verdicts.filter(v => v.pass).length, 1);
});

test("flags judge==subject", async () => {
  const rubric = { judge_model: "review", pass_rule: "all" as const, criteria: [{ id: "a", prompt: "?" }] };
  const r = await runRubric("out", rubric, judgeAll("PASS"), () => m, m);
  assert.equal(r.judgeIsSubject, true);
});
