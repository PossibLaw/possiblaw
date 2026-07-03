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

// ---- Task 1.3: cancelled/timed-out roots are FAILED, never judged ----

const baseResult = {
  runId: "r1", arm: "A" as const, deliverablePath: "/tmp/x", issueId: "iss-1",
  costCents: 42, wallClockSeconds: 12.5, childIssueCount: 0,
  decomposition: { childIssueCount: 0, maxDepth: 0, children: [] },
};
const ctx = { task: "t1", arm: "A" as const, config: "sota" };

test("1.3 happy: done root -> judge invoked, allPass from judge", async () => {
  const { completeRun } = await import("./index.ts");
  let judged = 0;
  const rec = await completeRun(
    { ...baseResult, status: "done", timedOut: false, failureReason: null },
    ctx,
    async () => { judged++; return { all_pass: true }; },
  );
  assert.equal(judged, 1);
  assert.equal(rec.allPass, true);
  assert.equal(rec.failReason, null);
  assert.equal(rec.wallClockSeconds, 12.5);
  assert.equal(rec.costCents, 42);
});

test("1.3 edge: cancelled root -> failed with reason cancelled, judge NOT invoked", async () => {
  const { completeRun } = await import("./index.ts");
  let judged = 0;
  const rec = await completeRun(
    { ...baseResult, status: "cancelled", timedOut: false, failureReason: "cancelled" },
    ctx,
    async () => { judged++; return { all_pass: true }; },
  );
  assert.equal(judged, 0, "judge must NOT be invoked for a cancelled root");
  assert.equal(rec.allPass, false, "counts against the arm's all-pass rate");
  assert.equal(rec.failReason, "cancelled");
});

test("1.3 failure: timed-out run with partial deliverable -> failed with reason timed_out, judge NOT invoked", async () => {
  const { completeRun } = await import("./index.ts");
  let judged = 0;
  const rec = await completeRun(
    { ...baseResult, status: "in_progress", timedOut: true, failureReason: "timed_out" },
    ctx,
    async () => { judged++; return { all_pass: true }; },
  );
  assert.equal(judged, 0, "judge must NOT be invoked for a timed-out run");
  assert.equal(rec.allPass, false);
  assert.equal(rec.failReason, "timed_out");
  assert.equal(rec.timedOut, true);
});

test("1.1: skipReasonFor surfaces the structured arm_a_agent_unresolved reason", async () => {
  const { skipReasonFor } = await import("./index.ts");
  const { AgentResolutionError } = await import("./agent-resolver.ts");
  const e = new AgentResolutionError("immigration-lead", "no matching agent", "arm_a_agent_unresolved");
  assert.equal(skipReasonFor(e), "arm_a_agent_unresolved: immigration-lead (no matching agent)");
  assert.match(skipReasonFor(new Error("boom")), /boom/);
});
