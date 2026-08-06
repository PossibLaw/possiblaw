import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, existsSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runArm } from "./runner.ts";
import { AgentResolutionError, buildAgentDirectory } from "./agent-resolver.ts";

const UUID_LEAD = "11111111-1111-4111-8111-111111111111";
const UUID_COS = "22222222-2222-4222-8222-222222222222";
const UUID_DUP = "33333333-3333-4333-8333-333333333333";

// Directory as built once per run in index.ts from client.listAgents().
const dir = buildAgentDirectory([
  { id: UUID_LEAD, name: "Commercial Lead", urlKey: "commercial-lead" },
  { id: UUID_COS, name: "Chief of Staff", urlKey: "chief-of-staff" },
]);

function fakeClient(record: any, childIssues: Array<{ id: string; assigneeAgentId?: string | null }> = []) {
  return {
    async createIssue(body: any) { record.created = body; (record.order ||= []).push("create"); return { id: "iss-1", status: "todo" }; },
    async putDocument(_id: string, key: string) { (record.docs ||= []).push(key); (record.order ||= []).push("doc"); },
    async patchIssueAssignee(_id: string, agentId: string) { record.assigned = agentId; (record.order ||= []).push("assign"); },
    async cancelIssue(id: string) { record.cancelled = id; },
    async getIssue() { return { id: "iss-1", status: "done" }; },
    async listWorkProducts() { return [{ id: "wp", isPrimary: true, metadata: { documentKey: "memo" } }]; },
    async getDocument() { return { id: "memo", body: "FINAL DELIVERABLE TEXT" }; },
    async getIssueCostSummary() { return { totalCents: 1234 }; },
    async listChildIssues(parentId: string) { return parentId === "iss-1" ? childIssues : []; },
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

test("1.1 happy: Arm A resolves the manifest slug to the agent's UUID before createIssue", async () => {
  const record: any = {};
  const resultsDir = mkdtempSync(join(tmpdir(), "res-"));
  const r = await runArm({
    caseRec: baseCase, harveyLabDir: "/nonexistent", resultsDir, runId: "runA",
    arm: "A", chiefOfStaffAgentId: UUID_COS, client: fakeClient(record), agents: dir,
    runDoc: async () => ({ stdout: "", code: 0, stderr: "" }),
    runConvert: stubConvert(record),
    awaitOpts: { intervalMs: 0, timeoutMs: 1000, sleep: async () => {} },
  });
  // Furnish-then-assign: the 24aa2f51 pin scopes issues to an authorization
  // boundary once assigned (observed 403/401 on every smoke PUT 2026-08-02),
  // so the issue is created unassigned, documents land first, and assignment
  // fires the wake on a fully-furnished matter.
  assert.equal(record.created.assigneeAgentId, undefined);
  assert.equal(record.assigned, UUID_LEAD); // Arm A → single doer, as UUID
  // Arm A is the monolithic baseline: the matter carries an explicit
  // no-delegate instruction (leads delegated in 7 of 12 A-runs across the
  // 2026-08-02/03 probes, gutting the baseline sample under record-and-exclude).
  assert.ok(record.created.description.includes("Do NOT create child issues"));
  assert.ok(record.order.indexOf("assign") > record.order.lastIndexOf("doc"),
    "assignment must follow the last document upload");
  assert.equal(r.status, "done");
  const out = join(resultsDir, "runA", "output", "red-flag-memo.docx");
  assert.equal(existsSync(out), true);
  assert.equal(r.costCents, 1234);
});

test("1.1: Arm B resolves the chief-of-staff slug identically", async () => {
  const record: any = {};
  const resultsDir = mkdtempSync(join(tmpdir(), "res-"));
  await runArm({
    caseRec: baseCase, harveyLabDir: "/nonexistent", resultsDir, runId: "runB",
    arm: "B", chiefOfStaffAgentId: "chief-of-staff", client: fakeClient(record), agents: dir,
    runDoc: async () => ({ stdout: "", code: 0, stderr: "" }),
    runConvert: stubConvert(record),
    awaitOpts: { intervalMs: 0, timeoutMs: 1000, sleep: async () => {} },
  });
  assert.equal(record.created.assigneeAgentId, undefined);
  assert.equal(record.assigned, UUID_COS); // Arm B → delegator, as UUID
  // Arm B must stay free to decompose — no suppression text.
  assert.equal(record.created.description.includes("Do NOT create child issues"), false);
});

test("1.1 failure: unresolvable arm_a_agent slug -> arm_a_agent_unresolved error, createIssue NEVER called", async () => {
  const record: any = {};
  const resultsDir = mkdtempSync(join(tmpdir(), "res-"));
  const unknownCase = { ...baseCase, metadata: { ...baseCase.metadata, arm_a_agent: "immigration-lead" } };
  await assert.rejects(
    runArm({
      caseRec: unknownCase, harveyLabDir: "/nonexistent", resultsDir, runId: "runMissing",
      arm: "A", chiefOfStaffAgentId: UUID_COS, client: fakeClient(record), agents: dir,
      runDoc: async () => ({ stdout: "", code: 0, stderr: "" }),
      runConvert: stubConvert(record),
      awaitOpts: { intervalMs: 0, timeoutMs: 1000, sleep: async () => {} },
    }),
    (e: unknown) =>
      e instanceof AgentResolutionError &&
      e.message.startsWith("arm_a_agent_unresolved: immigration-lead"),
  );
  assert.equal(record.created, undefined, "createIssue must never be called with an unresolved slug");
});

test("1.1 edge: ambiguous duplicate display names -> error names the slug, createIssue NEVER called", async () => {
  const record: any = {};
  const resultsDir = mkdtempSync(join(tmpdir(), "res-"));
  const dupDir = buildAgentDirectory([
    { id: UUID_LEAD, name: "Commercial Lead" },
    { id: UUID_DUP, name: "Commercial  Lead" }, // normalizes to the same slug
  ]);
  await assert.rejects(
    runArm({
      caseRec: baseCase, harveyLabDir: "/nonexistent", resultsDir, runId: "runDup",
      arm: "A", chiefOfStaffAgentId: UUID_COS, client: fakeClient(record), agents: dupDir,
      runDoc: async () => ({ stdout: "", code: 0, stderr: "" }),
      runConvert: stubConvert(record),
      awaitOpts: { intervalMs: 0, timeoutMs: 1000, sleep: async () => {} },
    }),
    (e: unknown) =>
      e instanceof AgentResolutionError &&
      e.message.includes("arm_a_agent_unresolved: commercial-lead") &&
      /ambiguous/.test(e.message),
  );
  assert.equal(record.created, undefined);
});

test("1.1 security: with no directory provided, a slug assignee is refused (never passed through)", async () => {
  const record: any = {};
  const resultsDir = mkdtempSync(join(tmpdir(), "res-"));
  await assert.rejects(
    runArm({
      caseRec: baseCase, harveyLabDir: "/nonexistent", resultsDir, runId: "runStrict",
      arm: "A", chiefOfStaffAgentId: UUID_COS, client: fakeClient(record),
      runDoc: async () => ({ stdout: "", code: 0, stderr: "" }),
      runConvert: stubConvert(record),
      awaitOpts: { intervalMs: 0, timeoutMs: 1000, sleep: async () => {} },
    }),
    AgentResolutionError,
  );
  assert.equal(record.created, undefined);
});

test("C1: .docx deliverable invokes pandoc with -f markdown -o <path> and file exists at .docx path", async () => {
  const record: any = {};
  const resultsDir = mkdtempSync(join(tmpdir(), "res-"));
  const r = await runArm({
    caseRec: baseCase, harveyLabDir: "/nonexistent", resultsDir, runId: "docxRun",
    arm: "A", chiefOfStaffAgentId: "ag-cos", client: fakeClient(record), agents: dir,
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
    arm: "A", chiefOfStaffAgentId: "ag-cos", client: fakeClient(record), agents: dir,
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
    arm: "A", chiefOfStaffAgentId: "ag-cos", client: fakeClient(record, [{ id: "child-1" }, { id: "child-2" }]), agents: dir,
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
    arm: "A", chiefOfStaffAgentId: "ag-cos", client: fakeClient(record, []), agents: dir,
    runDoc: async () => ({ stdout: "", code: 0, stderr: "" }),
    runConvert: stubConvert(record),
    awaitOpts: { intervalMs: 0, timeoutMs: 1000, sleep: async () => {} },
  });
  assert.equal(r.childIssueCount, 0);
});

// ---- Task 1.2: thesis-variable instrumentation ----

test("1.2 happy: completed run records wallClockSeconds > 0 in result and metrics.json", async () => {
  const record: any = {};
  const resultsDir = mkdtempSync(join(tmpdir(), "res-"));
  let t = 0;
  const r = await runArm({
    caseRec: baseCase, harveyLabDir: "/nonexistent", resultsDir, runId: "clockRun",
    arm: "A", chiefOfStaffAgentId: UUID_COS, client: fakeClient(record), agents: dir,
    now: () => (t += 4000), // each clock read advances 4s
    runDoc: async () => ({ stdout: "", code: 0, stderr: "" }),
    runConvert: stubConvert(record),
    awaitOpts: { intervalMs: 0, timeoutMs: 1000, sleep: async () => {} },
  });
  assert.ok(r.wallClockSeconds > 0, `wallClockSeconds should be > 0, got ${r.wallClockSeconds}`);
  const metrics = JSON.parse(readFileSync(join(resultsDir, "clockRun", "metrics.json"), "utf-8"));
  assert.ok(metrics.wall_clock_seconds > 0, "metrics.json wall_clock_seconds must be the real elapsed time");
  assert.equal(metrics.wall_clock_seconds, r.wallClockSeconds);
});

test("1.2: decomposition records child count, assignee labels, per-child cost, and depth (both arms)", async () => {
  const record: any = {};
  const resultsDir = mkdtempSync(join(tmpdir(), "res-"));
  const client = {
    async createIssue(body: any) { record.created = body; return { id: "iss-1", status: "todo" }; },
    async putDocument() {},
    async patchIssueAssignee(_id: string, agentId: string) { record.assigned = agentId; },
    async getIssue() { return { id: "iss-1", status: "done" }; },
    async listWorkProducts() { return [{ id: "wp", isPrimary: true, metadata: { documentKey: "memo" } }]; },
    async getDocument() { return { id: "memo", body: "TEXT" }; },
    async getIssueCostSummary(id: string) {
      return { "iss-1": { costCents: 900 }, "child-1": { costCents: 300 }, "child-2": { costCents: 200 } }[id] ?? {};
    },
    async listChildIssues(parentId: string) {
      if (parentId === "iss-1") return [{ id: "child-1", assigneeAgentId: UUID_LEAD }, { id: "child-2", assigneeAgentId: null }];
      if (parentId === "child-1") return [{ id: "grandchild-1" }]; // nested one level deeper
      return [];
    },
  } as any;
  const r = await runArm({
    caseRec: baseCase, harveyLabDir: "/nonexistent", resultsDir, runId: "decompRun",
    arm: "B", chiefOfStaffAgentId: UUID_COS, client, agents: dir,
    runDoc: async () => ({ stdout: "", code: 0, stderr: "" }),
    runConvert: stubConvert(record),
    awaitOpts: { intervalMs: 0, timeoutMs: 1000, sleep: async () => {} },
  });
  assert.equal(r.childIssueCount, 2);
  assert.equal(r.decomposition.childIssueCount, 2);
  assert.equal(r.decomposition.maxDepth, 2, "grandchild present -> depth 2 (deeper nesting not walked)");
  assert.deepEqual(r.decomposition.children.map(c => c.assignee), ["commercial-lead", null]);
  assert.deepEqual(r.decomposition.children.map(c => c.costCents), [300, 200]);
  assert.equal(r.costCents, 900, "root cost must read the costCents field the API actually returns");
});

test("1.2: decomposition depth is 1 when children have no grandchildren; 0 when childless", async () => {
  const record: any = {};
  const resultsDir = mkdtempSync(join(tmpdir(), "res-"));
  const withKids = await runArm({
    caseRec: baseCase, harveyLabDir: "/nonexistent", resultsDir, runId: "depth1Run",
    arm: "B", chiefOfStaffAgentId: UUID_COS, client: fakeClient(record, [{ id: "child-1" }]), agents: dir,
    runDoc: async () => ({ stdout: "", code: 0, stderr: "" }),
    runConvert: stubConvert(record),
    awaitOpts: { intervalMs: 0, timeoutMs: 1000, sleep: async () => {} },
  });
  assert.equal(withKids.decomposition.maxDepth, 1);
  const childless = await runArm({
    caseRec: baseCase, harveyLabDir: "/nonexistent", resultsDir, runId: "depth0Run",
    arm: "B", chiefOfStaffAgentId: UUID_COS, client: fakeClient(record, []), agents: dir,
    runDoc: async () => ({ stdout: "", code: 0, stderr: "" }),
    runConvert: stubConvert(record),
    awaitOpts: { intervalMs: 0, timeoutMs: 1000, sleep: async () => {} },
  });
  assert.equal(childless.decomposition.maxDepth, 0);
  assert.equal(childless.decomposition.children.length, 0);
});

test("1.3: cancelled root surfaces failureReason 'cancelled'; timed-out run surfaces 'timed_out'", async () => {
  const record: any = {};
  const resultsDir = mkdtempSync(join(tmpdir(), "res-"));
  const cancelledClient = { ...fakeClient(record), async getIssue() { return { id: "iss-1", status: "cancelled" }; } } as any;
  const cancelled = await runArm({
    caseRec: baseCase, harveyLabDir: "/nonexistent", resultsDir, runId: "cancelledRun",
    arm: "A", chiefOfStaffAgentId: UUID_COS, client: cancelledClient, agents: dir,
    runDoc: async () => ({ stdout: "", code: 0, stderr: "" }),
    runConvert: stubConvert(record),
    awaitOpts: { intervalMs: 0, timeoutMs: 1000, sleep: async () => {} },
  });
  assert.equal(cancelled.failureReason, "cancelled");
  assert.equal(cancelled.timedOut, false);

  const record2: any = {};
  const stuckClient = { ...fakeClient(record2), async getIssue() { return { id: "iss-1", status: "in_progress" }; } } as any;
  let t = 0;
  const timedOut = await runArm({
    caseRec: baseCase, harveyLabDir: "/nonexistent", resultsDir, runId: "timeoutRun",
    arm: "A", chiefOfStaffAgentId: UUID_COS, client: stuckClient, agents: dir,
    runDoc: async () => ({ stdout: "", code: 0, stderr: "" }),
    runConvert: stubConvert(record2),
    awaitOpts: { intervalMs: 10, timeoutMs: 25, now: () => (t += 10), sleep: async () => {} },
  });
  assert.equal(timedOut.timedOut, true);
  assert.equal(timedOut.failureReason, "timed_out");
  // Cancel-on-timeout: an abandoned matter must not stay alive burning the
  // subscription and starving later sequential runs (the 2026-08-03 probe's
  // 16/18 timeouts were largely self-inflicted background load).
  assert.equal(record2.cancelled, "iss-1");
});
