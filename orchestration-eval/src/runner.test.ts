import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runArm } from "./runner.ts";

function fakeClient(record: any) {
  return {
    async createIssue(body: any) { record.created = body; return { id: "iss-1", status: "todo" }; },
    async putDocument(_id: string, key: string) { (record.docs ||= []).push(key); },
    async getIssue() { return { id: "iss-1", status: "done" }; },
    async listWorkProducts() { return [{ id: "wp", isPrimary: true, metadata: { documentKey: "memo" } }]; },
    async getDocument() { return { id: "memo", body: "FINAL DELIVERABLE TEXT" }; },
    async getIssueCostSummary() { return { totalCents: 1234 }; },
  } as any;
}

const baseCase: any = {
  slug: "contracts/redflag-memo", target: "commercial-lead", targetType: "agent",
  input_brief: "Review and produce red-flag-memo.docx.", documents: [],
  grading: { mode: "rubric", rubric: { judge_model: "claude-sonnet-4-6", pass_rule: "all", criteria: [{ id: "C-001", prompt: "x" }] } },
  source: { kind: "benchmark", name: "lab" },
  metadata: { deliverables: { "red-flag-memo.docx": "red-flag-memo.docx" }, arm_a_agent: "commercial-lead", task_path: "contracts/redflag-memo" },
};

test("Arm A assigns the single doer agent and writes the deliverable to output/", async () => {
  const record: any = {};
  const resultsDir = mkdtempSync(join(tmpdir(), "res-"));
  const r = await runArm({
    caseRec: baseCase, harveyLabDir: "/nonexistent", resultsDir, runId: "runA",
    arm: "A", chiefOfStaffAgentId: "ag-cos", client: fakeClient(record),
    runDoc: async () => ({ stdout: "", code: 0, stderr: "" }),
    awaitOpts: { intervalMs: 0, timeoutMs: 1000, sleep: async () => {} },
  });
  assert.equal(record.created.assigneeAgentId, "commercial-lead"); // Arm A → single doer
  assert.equal(r.status, "done");
  const out = join(resultsDir, "runA", "output", "red-flag-memo.docx");
  assert.equal(existsSync(out), true);
  assert.equal(readFileSync(out, "utf-8"), "FINAL DELIVERABLE TEXT");
  assert.equal(r.costCents, 1234);
});

test("Arm B assigns the chief-of-staff delegator", async () => {
  const record: any = {};
  const resultsDir = mkdtempSync(join(tmpdir(), "res-"));
  await runArm({
    caseRec: baseCase, harveyLabDir: "/nonexistent", resultsDir, runId: "runB",
    arm: "B", chiefOfStaffAgentId: "ag-cos", client: fakeClient(record),
    runDoc: async () => ({ stdout: "", code: 0, stderr: "" }),
    awaitOpts: { intervalMs: 0, timeoutMs: 1000, sleep: async () => {} },
  });
  assert.equal(record.created.assigneeAgentId, "ag-cos"); // Arm B → delegator
});
