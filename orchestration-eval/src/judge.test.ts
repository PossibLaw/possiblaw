import { test } from "node:test";
import assert from "node:assert/strict";
import { judgeArgvFor, scoreRun } from "./judge.ts";

test("judgeArgvFor builds the run_eval invocation with the default model", () => {
  const { cmd, args } = judgeArgvFor("run-1", "contracts/redflag-memo", "claude-sonnet-4-6");
  assert.equal(cmd, "uv");
  assert.deepEqual(args, ["run", "python", "-m", "evaluation.run_eval", "--run-id", "run-1", "--task", "contracts/redflag-memo", "--judge-model", "claude-sonnet-4-6"]);
});

test("scoreRun runs the judge then parses results/<run-id>/scores.json", async () => {
  const scores = { score: 1.0, all_pass: true, n_criteria: 2, n_passed: 2,
    criteria_results: [{ id: "C-001", title: "x", verdict: "pass", reasoning: "ok" }],
    run_id: "run-1", task: "contracts/redflag-memo", judge_model: "claude-sonnet-4-6" };
  const r = await scoreRun("/repo/harvey-lab", "run-1", "contracts/redflag-memo", {
    run: async () => ({ code: 0, stderr: "" }),
    readScores: () => JSON.stringify(scores),
  });
  assert.equal(r.all_pass, true);
  assert.equal(r.n_passed, 2);
  assert.equal(r.criteria_results[0].verdict, "pass");
});

test("scoreRun throws a clear error when the judge process fails", async () => {
  await assert.rejects(
    scoreRun("/repo/harvey-lab", "run-1", "t", { run: async () => ({ code: 1, stderr: "ANTHROPIC_API_KEY missing" }) }),
    /run_eval failed.*ANTHROPIC_API_KEY/s,
  );
});
