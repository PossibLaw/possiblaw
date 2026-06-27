// orchestration-eval/src/runner.ts
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Case } from "../../eval-harness/src/types.ts";
import type { PaperclipEvalClient } from "./paperclip-client.ts";
import { extractTaskDocuments } from "./extract.ts";
import { awaitIssueClosed, extractDeliverable } from "./await-completion.ts";

export type Arm = "A" | "B";

export interface RunArmInput {
  caseRec: Case; harveyLabDir: string; resultsDir: string; runId: string; arm: Arm;
  chiefOfStaffAgentId: string; client: PaperclipEvalClient;
  runDoc?: (cmd: string, args: string[]) => Promise<{ stdout: string; code: number; stderr: string }>;
  awaitOpts?: { intervalMs?: number; timeoutMs?: number; now?: () => number; sleep?: (ms: number) => Promise<void> };
}

export interface RunArmResult {
  runId: string; arm: Arm; deliverablePath: string; status: string; timedOut: boolean; issueId: string; costCents?: number;
}

function firstDeliverableName(caseRec: Case): string {
  const map = (caseRec.metadata?.["deliverables"] ?? {}) as Record<string, string>;
  const keys = Object.keys(map);
  return keys[0] ?? "output.txt";
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
  writeFileSync(deliverablePath, deliverable.text, "utf-8");

  let costCents: number | undefined;
  try { costCents = (await client.getIssueCostSummary(issue.id)).totalCents; } catch { /* spend optional */ }
  // metrics.json drives the judge's optional cost field.
  writeFileSync(join(resultsDir, runId, "metrics.json"), JSON.stringify({ wall_clock_seconds: 0, cost_cents: costCents ?? null }, null, 2));

  return { runId, arm, deliverablePath, status: closed.status, timedOut: closed.timedOut, issueId: issue.id, costCents };
}
