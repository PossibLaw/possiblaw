// orchestration-eval/src/runner.ts
import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join, extname } from "node:path";
import { tmpdir } from "node:os";
import { spawn } from "node:child_process";
import type { Case } from "../../eval-harness/src/types.ts";
import type { PaperclipEvalClient } from "./paperclip-client.ts";
import { extractTaskDocuments } from "./extract.ts";
import { awaitIssueClosed, extractDeliverable, failureReasonFor } from "./await-completion.ts";
import { AgentResolutionError, strictUuidOnlyDirectory, type AgentDirectory } from "./agent-resolver.ts";

export type Arm = "A" | "B";

export type ConvertRunner = (cmd: string, args: string[]) => Promise<{ code: number; stderr: string }>;

export interface RunArmInput {
  caseRec: Case; harveyLabDir: string; resultsDir: string; runId: string; arm: Arm;
  chiefOfStaffAgentId: string; client: PaperclipEvalClient;
  /** Slug→UUID agent directory, built ONCE per run (index.ts) from client.listAgents().
   * Default is fail-closed: UUIDs pass through, slugs are refused. */
  agents?: AgentDirectory;
  /** Injectable wall clock (ms) for the per-run elapsed-time measurement. */
  now?: () => number;
  runDoc?: (cmd: string, args: string[]) => Promise<{ stdout: string; code: number; stderr: string }>;
  runConvert?: ConvertRunner;
  awaitOpts?: { intervalMs?: number; timeoutMs?: number; now?: () => number; sleep?: (ms: number) => Promise<void> };
}

export interface RunDecompositionChild {
  id: string;
  /** Slug-form label of the child's assignee (via the agent directory), or null if unassigned. */
  assignee: string | null;
  /** Child subtree cost via the EXISTING per-issue endpoint GET /api/issues/:id/cost-summary
   * (a recursive rollup — paperclip/server/src/services/costs.ts issueTreeSummary). No new plumbing. */
  costCents: number | null;
}

export interface RunDecomposition {
  childIssueCount: number;
  /** 0 = no children, 1 = direct children only, 2 = grandchildren exist.
   * Only ONE level below the direct children is walked; deeper nesting is not measured. */
  maxDepth: number;
  children: RunDecompositionChild[];
}

export interface RunArmResult {
  runId: string; arm: Arm; deliverablePath: string; status: string; timedOut: boolean;
  /** "cancelled" | "timed_out" when the run must be scored FAILED without judging; null when judgeable. */
  failureReason: "timed_out" | "cancelled" | null;
  issueId: string; costCents?: number;
  /** Real elapsed seconds for the arm run (createIssue → deliverable written). */
  wallClockSeconds: number;
  childIssueCount: number;
  /** Decomposition shape, recorded for BOTH arms (Arm A: monolithic-assumption check; Arm B: orchestration shape). */
  decomposition: RunDecomposition;
}

function firstDeliverableName(caseRec: Case): string {
  const map = (caseRec.metadata?.["deliverables"] ?? {}) as Record<string, string>;
  const keys = Object.keys(map);
  return keys[0] ?? "output.txt";
}

const defaultConvert: ConvertRunner = (cmd, args) =>
  new Promise<{ code: number; stderr: string }>((resolve) => {
    const p = spawn(cmd, args);
    let stderr = "";
    p.stderr?.on("data", (d: Buffer) => (stderr += String(d)));
    p.on("close", (code: number | null) => resolve({ code: code ?? 1, stderr }));
    p.on("error", (err: Error) => resolve({ code: 1, stderr: String(err) }));
  });

/** Write `text` to `deliverablePath`.
 * For .docx targets: converts via pandoc (markdown → docx). Falls back to
 * plain-text write if pandoc is unavailable or fails (fail-soft).
 * For all other extensions: writes UTF-8 directly (Harvey reads those natively). */
async function writeDeliverable(text: string, deliverablePath: string, runConvert?: ConvertRunner): Promise<void> {
  const ext = extname(deliverablePath).toLowerCase();
  if (ext === ".docx") {
    const runner = runConvert ?? defaultConvert;
    let tmpDir: string | undefined;
    try {
      tmpDir = mkdtempSync(join(tmpdir(), "eval-deliverable-"));
      const tmpMd = join(tmpDir, "deliverable.md");
      writeFileSync(tmpMd, text, "utf-8");
      const { code } = await runner("pandoc", ["-f", "markdown", "-o", deliverablePath, tmpMd]);
      if (code === 0) return; // pandoc produced a real .docx — done
    } catch { /* fall through to plain-text fallback */ }
    finally {
      if (tmpDir) { try { rmSync(tmpDir, { recursive: true }); } catch { /* cleanup optional */ } }
    }
    // Fail-soft: pandoc unavailable or failed — write text directly so the run still completes.
  }
  writeFileSync(deliverablePath, text, "utf-8");
}

export async function runArm(input: RunArmInput): Promise<RunArmResult> {
  const { caseRec, harveyLabDir, resultsDir, runId, arm, chiefOfStaffAgentId, client } = input;
  const now = input.now ?? (() => Date.now());
  const taskPath = (caseRec.metadata?.["task_path"] as string) ?? caseRec.slug;

  // Arm A = single capable doer (manifest arm_a_agent / case.target); Arm B = chief-of-staff delegator.
  // Manifest values are package slugs (e.g. `immigration-lead`), but paperclip validates
  // assigneeAgentId as a UUID — resolve BEFORE creating anything, and fail loudly so the
  // task is SKIPPED with a structured reason instead of 400ing per issue.
  const rawAssignee = arm === "B" ? chiefOfStaffAgentId : ((caseRec.metadata?.["arm_a_agent"] as string) ?? caseRec.target);
  const directory = input.agents ?? strictUuidOnlyDirectory();
  let assigneeAgentId: string;
  try {
    assigneeAgentId = directory.resolveId(rawAssignee);
  } catch (e) {
    if (e instanceof AgentResolutionError) {
      throw new AgentResolutionError(e.slug, e.detail, arm === "A" ? "arm_a_agent_unresolved" : "arm_b_agent_unresolved");
    }
    throw e;
  }

  const startedAtMs = now(); // wall clock covers createIssue → deliverable written
  const issue = await client.createIssue({ title: `LAB ${taskPath} [${arm}/${runId}]`, description: caseRec.input_brief, assigneeAgentId });

  // Attach extracted documents into the issue bank.
  const docs = await extractTaskDocuments(harveyLabDir, taskPath, input.runDoc);
  for (const d of docs) {
    if (!d.skipped && d.text) await client.putDocument(issue.id, d.name.replace(/[^a-zA-Z0-9_.-]/g, "_"), d.text);
  }

  const closed = await awaitIssueClosed(client, issue.id, input.awaitOpts);
  const deliverable = await extractDeliverable(client, issue.id);

  // Write to Harvey's expected layout: <resultsDir>/<runId>/output/<deliverable>
  const outDir = join(resultsDir, runId, "output");
  mkdirSync(outDir, { recursive: true });
  const deliverableName = firstDeliverableName(caseRec);
  const deliverablePath = join(outDir, deliverableName);
  await writeDeliverable(deliverable.text, deliverablePath, input.runConvert);

  // Real elapsed seconds for this arm run (rounded to ms precision).
  const wallClockSeconds = Math.round(Math.max(0, now() - startedAtMs)) / 1000;

  let costCents: number | undefined;
  // The cost-summary route returns `costCents` (a subtree rollup — see
  // paperclip/server/src/services/costs.ts issueTreeSummary); `totalCents` kept as fallback.
  try {
    const summary = await client.getIssueCostSummary(issue.id);
    costCents = (summary.costCents ?? summary.totalCents) as number | undefined;
  } catch { /* spend optional */ }
  // metrics.json drives the judge's optional cost field.
  writeFileSync(join(resultsDir, runId, "metrics.json"), JSON.stringify({ wall_clock_seconds: wallClockSeconds, cost_cents: costCents ?? null }, null, 2));

  // Measure decomposition on BOTH arms (best-effort):
  // - Arm A: childIssueCount > 0 means the assignee delegated — the monolithic assumption is violated.
  // - Arm B: how the chief-of-staff split the matter (count, assignees, depth, per-child cost).
  // Depth is walked ONE level below the direct children only (grandchildren ⇒ maxDepth 2);
  // deeper nesting is not walked.
  let decomposition: RunDecomposition = { childIssueCount: 0, maxDepth: 0, children: [] };
  try {
    const children = await client.listChildIssues(issue.id);
    let maxDepth = children.length > 0 ? 1 : 0;
    const childRecords: RunDecompositionChild[] = [];
    for (const child of children) {
      let childCost: number | null = null;
      // Per-child cost reuses the existing per-issue cost endpoint — no new cost plumbing.
      try {
        const s = await client.getIssueCostSummary(child.id);
        childCost = (s.costCents ?? s.totalCents ?? null) as number | null;
      } catch { /* best-effort */ }
      if (maxDepth < 2) {
        try { if ((await client.listChildIssues(child.id)).length > 0) maxDepth = 2; } catch { /* best-effort */ }
      }
      childRecords.push({ id: child.id, assignee: directory.labelFor(child.assigneeAgentId ?? null), costCents: childCost });
    }
    decomposition = { childIssueCount: children.length, maxDepth, children: childRecords };
  } catch { /* best-effort */ }

  return {
    runId, arm, deliverablePath, status: closed.status, timedOut: closed.timedOut,
    failureReason: failureReasonFor(closed),
    issueId: issue.id, costCents, wallClockSeconds,
    childIssueCount: decomposition.childIssueCount, decomposition,
  };
}
