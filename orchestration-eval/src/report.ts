// orchestration-eval/src/report.ts
import type { Arm } from "./runner.ts";

export interface RunRecord { task: string; arm: Arm; config: string; allPass: boolean; costCents?: number | null; }
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

export function renderReport(cells: CellResult[], meta: { runsPerCell: number; skipped: Array<{ task: string; reason: string }> }): string {
  const lines: string[] = [];
  lines.push(`# Harvey LAB Orchestration A/B — Report`);
  lines.push(``, `Runs per cell (K): ${meta.runsPerCell}. Curated subset only — see SKIPPED below.`, ``);
  lines.push(`| Task | Config | Arm A all-pass | Arm B all-pass | Δ (B−A) | A cost¢ | B cost¢ |`);
  lines.push(`|---|---|---|---|---|---|---|`);
  const tasks = [...new Set(cells.map(c => c.task))];
  const configs = [...new Set(cells.map(c => c.config))];
  for (const task of tasks) for (const config of configs) {
    const a = cells.find(c => c.task === task && c.config === config && c.arm === "A");
    const b = cells.find(c => c.task === task && c.config === config && c.arm === "B");
    if (!a && !b) continue;
    const ar = a ? a.allPassRate : 0, br = b ? b.allPassRate : 0;
    lines.push(`| ${task} | ${config} | ${(ar * 100).toFixed(0)}% | ${(br * 100).toFixed(0)}% | ${((br - ar) * 100).toFixed(0)}pp | ${a?.meanCostCents ?? "—"} | ${b?.meanCostCents ?? "—"} |`);
  }
  lines.push(``, `## SKIPPED (out-of-scope v1 — honest coverage)`, ``);
  if (meta.skipped.length === 0) lines.push(`(none)`);
  for (const s of meta.skipped) lines.push(`- \`${s.task}\` — ${s.reason}`);
  return lines.join("\n");
}
