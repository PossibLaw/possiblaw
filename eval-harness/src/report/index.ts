// eval-harness/src/report/index.ts
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { GradingMode } from "../types.ts";

export interface CaseRecord {
  slug: string;
  target: string;
  mode: GradingMode;
  pass: boolean;
  score: number;
  costUsd: number;
  ms: number;
  skipped: boolean;
  detail: string;
  /** Raw model output, preserved for debugging (absent on skipped records). */
  output?: string;
}

export interface RunReport {
  target: string;
  variant: string;
  lane: string;
  modelMix: string;
  cases: CaseRecord[];
  meanScore: number;
  medianScore: number;
  stddev: number;
  totalCost: number;
  budget: number | null;
  budgetAborted: boolean;
  timestamp: string;
}

export function summarize(
  target: string,
  variant: string,
  lane: string,
  modelMix: string,
  cases: CaseRecord[],
  budget: number | null,
  budgetAborted: boolean,
  timestamp: string,
): RunReport {
  const scores = cases.map(c => c.score);
  const n = scores.length;
  const meanScore = n > 0 ? scores.reduce((a, b) => a + b, 0) / n : 0;

  const sorted = [...scores].sort((a, b) => a - b);
  const medianScore =
    n === 0
      ? 0
      : n % 2 === 1
      ? sorted[Math.floor(n / 2)]
      : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;

  const variance =
    n > 0 ? scores.reduce((sum, s) => sum + (s - meanScore) ** 2, 0) / n : 0;
  const stddev = Math.sqrt(variance);

  const totalCost = cases.reduce((sum, c) => sum + c.costUsd, 0);

  return {
    target, variant, lane, modelMix,
    cases, meanScore, medianScore, stddev,
    totalCost, budget, budgetAborted, timestamp,
  };
}

export function renderMarkdown(r: RunReport): string {
  const lines: string[] = [];

  lines.push("# PossibLaw Eval Report");
  lines.push("");

  // Header table — Field/Value format matching prior report
  lines.push("| Field | Value |");
  lines.push("|---|---|");
  lines.push(`| Target | ${r.target} |`);
  lines.push(`| Variant | ${r.variant} |`);
  lines.push(`| Lane | ${r.lane} |`);
  lines.push(`| Date | ${r.timestamp} |`);
  lines.push(`| Sample size | ${r.cases.length} |`);
  lines.push(`| Mean score | ${r.meanScore.toFixed(4)} |`);
  lines.push(`| Median score | ${r.medianScore.toFixed(4)} |`);
  lines.push(`| Std dev | ${r.stddev.toFixed(4)} |`);
  lines.push(`| Total cost | $${r.totalCost.toFixed(4)} |`);
  lines.push(`| Budget | ${r.budget !== null ? `$${r.budget.toFixed(2)}` : "none"} |`);
  lines.push(`| Budget aborted | ${r.budgetAborted ? "yes" : "no"} |`);
  lines.push(`| Model mix | ${r.modelMix} |`);
  lines.push("");

  // Top Failures section
  const failures = r.cases
    .filter(c => !c.pass)
    .sort((a, b) => a.score - b.score);

  lines.push("## Top Failures");
  lines.push("");
  if (failures.length === 0) {
    lines.push("_No failures._");
  } else {
    for (const c of failures) {
      lines.push(`### Case \`${c.slug}\` — score ${c.score.toFixed(2)}`);
      if (c.detail) {
        lines.push(`- **Detail:** ${c.detail}`);
      }
      if (c.skipped) {
        lines.push(`- **Skipped:** yes`);
      }
    }
  }
  lines.push("");

  // Per-case Results table
  lines.push("## Per-case Results");
  lines.push("");
  lines.push("| Slug | Target | Mode | Pass | Score | Cost (USD) | Ms | Skipped | Detail |");
  lines.push("|---|---|---|---|---|---|---|---|---|");
  for (const c of r.cases) {
    const pass = c.pass ? "✓" : "✗";
    const skipped = c.skipped ? "yes" : "no";
    const detail = c.detail.length > 60 ? c.detail.slice(0, 57) + "…" : c.detail;
    lines.push(
      `| ${c.slug} | ${c.target} | ${c.mode} | ${pass} | ${c.score.toFixed(2)} | ${c.costUsd.toFixed(4)} | ${c.ms} | ${skipped} | ${detail} |`
    );
  }
  lines.push("");

  return lines.join("\n");
}

export function writeReport(
  dir: string,
  r: RunReport,
): { mdPath: string; jsonPath: string } {
  mkdirSync(dir, { recursive: true });

  // Sanitize timestamp for use in filename
  const ts = r.timestamp.replace(/[:.]/g, "-").replace(/Z$/, "");
  const base = `${r.target}--${r.variant}--${ts}`;

  const mdPath = join(dir, `${base}.md`);
  const jsonPath = join(dir, `${base}.json`);

  writeFileSync(mdPath, renderMarkdown(r), "utf-8");
  writeFileSync(jsonPath, JSON.stringify(r, null, 2), "utf-8");

  return { mdPath, jsonPath };
}
