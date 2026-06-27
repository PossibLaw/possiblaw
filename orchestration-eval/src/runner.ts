// orchestration-eval/src/runner.ts
import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join, extname } from "node:path";
import { tmpdir } from "node:os";
import { spawn } from "node:child_process";
import type { Case } from "../../eval-harness/src/types.ts";
import type { PaperclipEvalClient } from "./paperclip-client.ts";
import { extractTaskDocuments } from "./extract.ts";
import { awaitIssueClosed, extractDeliverable } from "./await-completion.ts";

export type Arm = "A" | "B";

export type ConvertRunner = (cmd: string, args: string[]) => Promise<{ code: number; stderr: string }>;

export interface RunArmInput {
  caseRec: Case; harveyLabDir: string; resultsDir: string; runId: string; arm: Arm;
  chiefOfStaffAgentId: string; client: PaperclipEvalClient;
  runDoc?: (cmd: string, args: string[]) => Promise<{ stdout: string; code: number; stderr: string }>;
  runConvert?: ConvertRunner;
  awaitOpts?: { intervalMs?: number; timeoutMs?: number; now?: () => number; sleep?: (ms: number) => Promise<void> };
}

export interface RunArmResult {
  runId: string; arm: Arm; deliverablePath: string; status: string; timedOut: boolean; issueId: string; costCents?: number; childIssueCount: number;
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
  const taskPath = (caseRec.metadata?.["task_path"] as string) ?? caseRec.slug;

  // Arm A = single capable doer (manifest arm_a_agent / case.target); Arm B = chief-of-staff delegator.
  const assigneeAgentId = arm === "B" ? chiefOfStaffAgentId : ((caseRec.metadata?.["arm_a_agent"] as string) ?? caseRec.target);

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

  let costCents: number | undefined;
  try { costCents = (await client.getIssueCostSummary(issue.id)).totalCents; } catch { /* spend optional */ }
  // metrics.json drives the judge's optional cost field.
  writeFileSync(join(resultsDir, runId, "metrics.json"), JSON.stringify({ wall_clock_seconds: 0, cost_cents: costCents ?? null }, null, 2));

  // Measure Arm A decomposition: record child-issue count (best-effort).
  // childIssueCount > 0 on Arm A means the assignee delegated — the monolithic assumption is violated.
  let childIssueCount = 0;
  try { childIssueCount = (await client.listChildIssues(issue.id)).length; } catch { /* best-effort */ }

  return { runId, arm, deliverablePath, status: closed.status, timedOut: closed.timedOut, issueId: issue.id, costCents, childIssueCount };
}
