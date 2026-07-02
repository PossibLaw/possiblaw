// orchestration-eval/src/report.ts
import type { Arm, RunDecomposition } from "./runner.ts";

export interface RunRecord {
  task: string; arm: Arm; config: string; allPass: boolean; costCents?: number | null;
  /** True when the run hit the await timeout — must be visibly flagged in the report. */
  timedOut?: boolean;
  /** "cancelled" | "timed_out" when the run was scored FAILED without judging; null/absent otherwise. */
  failReason?: string | null;
  /** Real elapsed seconds for the arm run; absent on older/partial records → rendered as n/a. */
  wallClockSeconds?: number;
  /** Decomposition shape (both arms); absent/null on older or failed-early records → rendered as n/a. */
  decomposition?: RunDecomposition | null;
}
export interface CellResult {
  task: string; arm: Arm; config: string;
  allPassRuns: number; totalRuns: number; allPassRate: number; meanCostCents: number | null;
}

export function aggregate(records: RunRecord[]): CellResult[] {
  const byCell = new Map<string, RunRecord[]>();
  for (const r of records) {
    const key = `${r.task}|${r.arm}|${r.config}`;
    (byCell.get(key) ?? byCell.set(key, []).get(key)!).push(r);
  }
  const cells: CellResult[] = [];
  for (const [key, rs] of byCell) {
    const [task, arm, config] = key.split("|");
    const allPassRuns = rs.filter(r => r.allPass).length;
    const costs = rs.map(r => r.costCents).filter((c): c is number => typeof c === "number");
    cells.push({
      task, arm: arm as Arm, config,
      allPassRuns, totalRuns: rs.length,
      allPassRate: rs.length ? allPassRuns / rs.length : 0,
      meanCostCents: costs.length ? Math.round(costs.reduce((a, b) => a + b, 0) / costs.length) : null,
    });
  }
  return cells;
}

function renderDecomposition(d: RunRecord["decomposition"]): string {
  if (d === undefined || d === null) return "n/a";
  if (d.childIssueCount === 0) return "none";
  const kids = d.children
    .map((c) => `${c.assignee ?? "unassigned"}${typeof c.costCents === "number" ? ` (${c.costCents}¢)` : ""}`)
    .join(", ");
  return `${d.childIssueCount} child(ren), depth ${d.maxDepth}${kids ? `: ${kids}` : ""}`;
}

function renderRunResult(r: RunRecord): string {
  if (r.failReason) return `FAILED (${r.failReason})${r.timedOut ? " ⏱ TIMED OUT" : ""}`;
  const base = r.allPass ? "pass" : "fail";
  return r.timedOut ? `${base} ⏱ TIMED OUT` : base;
}

export function renderReport(
  cells: CellResult[],
  meta: {
    runsPerCell: number;
    skipped: Array<{ task: string; reason: string }>;
    armADecomposed?: Array<{ task: string; childCount: number }>;
    /** Per-run records; when provided, a Run Details section is rendered. */
    records?: RunRecord[];
  },
): string {
  const lines: string[] = [];
  const skippedCount = meta.skipped.length;
  lines.push(`# Harvey LAB Orchestration A/B — Report`);
  lines.push(``, `Runs per cell (K): ${meta.runsPerCell} · ${skippedCount} task(s) skipped/dropped. Curated subset only — see SKIPPED below.`, ``);
  lines.push(`| Task | Config | Arm A all-pass | Arm B all-pass | Δ (B−A) | A cost¢ | B cost¢ |`);
  lines.push(`|---|---|---|---|---|---|---|`);
  const tasks = [...new Set(cells.map(c => c.task))];
  const configs = [...new Set(cells.map(c => c.config))];
  for (const task of tasks) for (const config of configs) {
    const a = cells.find(c => c.task === task && c.config === config && c.arm === "A");
    const b = cells.find(c => c.task === task && c.config === config && c.arm === "B");
    if (!a && !b) continue;
    const aDisp = a ? `${(a.allPassRate * 100).toFixed(0)}% (${a.allPassRuns}/${a.totalRuns})` : "—";
    const bDisp = b ? `${(b.allPassRate * 100).toFixed(0)}% (${b.allPassRuns}/${b.totalRuns})` : "—";
    const ar = a?.allPassRate ?? 0, br = b?.allPassRate ?? 0;
    lines.push(`| ${task} | ${config} | ${aDisp} | ${bDisp} | ${((br - ar) * 100).toFixed(0)}pp | ${a?.meanCostCents ?? "—"} | ${b?.meanCostCents ?? "—"} |`);
  }
  // Per-run details: timed-out/cancelled runs visibly marked; wall clock + decomposition per run.
  const records = meta.records ?? [];
  if (records.length > 0) {
    lines.push(``, `## Run Details`, ``);
    lines.push(`| Task | Arm | Config | Result | Wall clock (s) | Cost¢ | Decomposition |`);
    lines.push(`|---|---|---|---|---|---|---|`);
    for (const r of records) {
      const wall = typeof r.wallClockSeconds === "number" ? String(r.wallClockSeconds) : "n/a";
      const cost = typeof r.costCents === "number" ? String(r.costCents) : "n/a";
      lines.push(`| ${r.task} | ${r.arm} | ${r.config} | ${renderRunResult(r)} | ${wall} | ${cost} | ${renderDecomposition(r.decomposition)} |`);
    }
  }
  // Arm A decomposition warnings (monolithic assumption verification).
  const decomposed = meta.armADecomposed ?? [];
  if (decomposed.length > 0) {
    lines.push(``, `## ⚠ Arm A Decomposition Warnings`, ``);
    lines.push(`Arm A assignees are practice leads that CAN delegate. These runs show childIssueCount > 0,`);
    lines.push(`meaning Arm A decomposed — the monolithic assumption is violated. Exclude these runs from the thesis comparison.`, ``);
    for (const d of decomposed) lines.push(`- \`${d.task}\` — Arm A created ${d.childCount} child issue(s). This run should be excluded.`);
  }
  lines.push(``, `## SKIPPED — ${skippedCount} task(s) excluded or errored`, ``);
  if (skippedCount === 0) lines.push(`(none)`);
  for (const s of meta.skipped) lines.push(`- \`${s.task}\` — ${s.reason}`);
  return lines.join("\n");
}
