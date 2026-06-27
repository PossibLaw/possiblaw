import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, existsSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runArm } from "./runner.ts";

function fakeClient(record: any, childIssues: Array<{ id: string }> = []) {
  return {
    async createIssue(body: any) { record.created = body; return { id: "iss-1", status: "todo" }; },
    async putDocument(_id: string, key: string) { (record.docs ||= []).push(key); },
    async getIssue() { return { id: "iss-1", status: "done" }; },
    async listWorkProducts() { return [{ id: "wp", isPrimary: true, metadata: { documentKey: "memo" } }]; },
    async getDocument() { return { id: "memo", body: "FINAL DELIVERABLE TEXT" }; },
    async getIssueCostSummary() { return { totalCents: 1234 }; },
    async listChildIssues() { return childIssues; },
  } as any;
}

// A runConvert that writes a stub .docx at the `-o` path and records the call.
function stubConvert(record: any) {
  return async (_cmd: string, args: string[]) => {
    record.convertArgs = args;
    // args: ["-f", "markdown", "-o", <outputPath>, <inputMd>]
    const outputPath = args[3];
    if (outputPath) writeFileSync(outputPath, "STUB DOCX CONTENT");
    return { code: 0, stderr: "" };
  };
}

const baseCase: any = {
  slug: "contracts/redflag-memo", target: "commercial-lead", targetType: "agent",
  input_brief: "Review and produce red-flag-memo.docx.", documents: [],
  grading: { mode: "rubric", rubric: { judge_model: "claude-sonnet-4-6", pass_rule: "all", criteria: [{ id: "C-001", prompt: "x" }] } },
  source: { kind: "benchmark", name: "lab" },
  metadata: { deliverables: { "red-flag-memo.docx": "red-flag-memo.docx" }, arm_a_agent: "commercial-lead", task_path: "contracts/redflag-memo" },
};

const mdCase: any = {
  ...baseCase,
  metadata: { ...baseCase.metadata, deliverables: { "output.md": "output.md" } },
};

test("Arm A assigns the single doer agent and writes the deliverable to output/", async () => {
  const record: any = {};
  const resultsDir = mkdtempSync(join(tmpdir(), "res-"));
  const r = await runArm({
    caseRec: baseCase, harveyLabDir: "/nonexistent", resultsDir, runId: "runA",
    arm: "A", chiefOfStaffAgentId: "ag-cos", client: fakeClient(record),
    runDoc: async () => ({ stdout: "", code: 0, stderr: "" }),
    runConvert: stubConvert(record),
    awaitOpts: { intervalMs: 0, timeoutMs: 1000, sleep: async () => {} },
  });
  assert.equal(record.created.assigneeAgentId, "commercial-lead"); // Arm A → single doer
  assert.equal(r.status, "done");
  const out = join(resultsDir, "runA", "output", "red-flag-memo.docx");
  assert.equal(existsSync(out), true);
  assert.equal(r.costCents, 1234);
});

test("Arm B assigns the chief-of-staff delegator", async () => {
  const record: any = {};
  const resultsDir = mkdtempSync(join(tmpdir(), "res-"));
  await runArm({
    caseRec: baseCase, harveyLabDir: "/nonexistent", resultsDir, runId: "runB",
    arm: "B", chiefOfStaffAgentId: "ag-cos", client: fakeClient(record),
    runDoc: async () => ({ stdout: "", code: 0, stderr: "" }),
    runConvert: stubConvert(record),
    awaitOpts: { intervalMs: 0, timeoutMs: 1000, sleep: async () => {} },
  });
  assert.equal(record.created.assigneeAgentId, "ag-cos"); // Arm B → delegator
});

test("C1: .docx deliverable invokes pandoc with -f markdown -o <path> and file exists at .docx path", async () => {
  const record: any = {};
  const resultsDir = mkdtempSync(join(tmpdir(), "res-"));
  const r = await runArm({
    caseRec: baseCase, harveyLabDir: "/nonexistent", resultsDir, runId: "docxRun",
    arm: "A", chiefOfStaffAgentId: "ag-cos", client: fakeClient(record),
    runDoc: async () => ({ stdout: "", code: 0, stderr: "" }),
    runConvert: stubConvert(record),
    awaitOpts: { intervalMs: 0, timeoutMs: 1000, sleep: async () => {} },
  });
  // Verify pandoc was called with the right flags.
  assert.ok(Array.isArray(record.convertArgs), "pandoc should have been called for .docx deliverable");
  assert.equal(record.convertArgs[0], "-f");
  assert.equal(record.convertArgs[1], "markdown");
  assert.equal(record.convertArgs[2], "-o");
  assert.ok(record.convertArgs[3].endsWith("red-flag-memo.docx"), "pandoc -o path should end with red-flag-memo.docx");
  // Verify the file exists at the .docx path.
  const out = join(resultsDir, "docxRun", "output", "red-flag-memo.docx");
  assert.equal(existsSync(out), true);
  assert.equal(readFileSync(out, "utf-8"), "STUB DOCX CONTENT");
  assert.ok(r.deliverablePath.endsWith("red-flag-memo.docx"), "deliverablePath must keep the .docx basename");
});

test("C1: .md deliverable writes text directly — pandoc NOT called", async () => {
  const record: any = {};
  const convertRecord: any = {};
  const noCallConvert = async (_cmd: string, _args: string[]) => {
    convertRecord.called = true;
    return { code: 0, stderr: "" };
  };
  const resultsDir = mkdtempSync(join(tmpdir(), "res-"));
  await runArm({
    caseRec: mdCase, harveyLabDir: "/nonexistent", resultsDir, runId: "mdRun",
    arm: "A", chiefOfStaffAgentId: "ag-cos", client: fakeClient(record),
    runDoc: async () => ({ stdout: "", code: 0, stderr: "" }),
    runConvert: noCallConvert,
    awaitOpts: { intervalMs: 0, timeoutMs: 1000, sleep: async () => {} },
  });
  assert.equal(convertRecord.called, undefined, "pandoc should NOT be called for .md deliverable");
  const out = join(resultsDir, "mdRun", "output", "output.md");
  assert.equal(existsSync(out), true);
  assert.equal(readFileSync(out, "utf-8"), "FINAL DELIVERABLE TEXT");
});

test("I3: childIssueCount is captured from listChildIssues and returned in RunArmResult", async () => {
  const record: any = {};
  const resultsDir = mkdtempSync(join(tmpdir(), "res-"));
  const r = await runArm({
    caseRec: baseCase, harveyLabDir: "/nonexistent", resultsDir, runId: "childRun",
    arm: "A", chiefOfStaffAgentId: "ag-cos", client: fakeClient(record, [{ id: "child-1" }, { id: "child-2" }]),
    runDoc: async () => ({ stdout: "", code: 0, stderr: "" }),
    runConvert: stubConvert(record),
    awaitOpts: { intervalMs: 0, timeoutMs: 1000, sleep: async () => {} },
  });
  assert.equal(r.childIssueCount, 2, "childIssueCount should reflect the number of child issues");
});

test("I3: childIssueCount is 0 when no children exist", async () => {
  const record: any = {};
  const resultsDir = mkdtempSync(join(tmpdir(), "res-"));
  const r = await runArm({
    caseRec: baseCase, harveyLabDir: "/nonexistent", resultsDir, runId: "noChildRun",
    arm: "A", chiefOfStaffAgentId: "ag-cos", client: fakeClient(record, []),
    runDoc: async () => ({ stdout: "", code: 0, stderr: "" }),
    runConvert: stubConvert(record),
    awaitOpts: { intervalMs: 0, timeoutMs: 1000, sleep: async () => {} },
  });
  assert.equal(r.childIssueCount, 0);
});
