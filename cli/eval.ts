/**
 * PossibLaw v2 — Eval harness (Sprint 9).
 *
 * runEval runs a workflow against a dataset and produces Markdown + JSON reports.
 * Supports dry-run (no LLM calls) and offline mode (uses bundled fixtures).
 * Budget cap aborts gracefully at 95% utilization.
 */

import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { REPO_ROOT } from './loader.js';
import { runPipeline } from './pipeline.js';
import { loadWorkflow } from './loader.js';
import {
  scoreCuad,
  scoreMaud,
  scoreUnfairTos,
  scoreLedgar,
  scoreAcord,
  buildConfusionMatrix,
} from './eval-scorers.js';
import { adaptSample, type KnownDataset } from './eval-adapters.js';
import type { RunReport } from './types.js';

// Re-export KnownDataset so callers can import it from here if convenient
export type { KnownDataset } from './eval-adapters.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EvalSampleResult {
  id: string;
  score: number;
  predicted: string;
  gold: string;
  cost: number;
  dryRun: boolean;
}

export interface EvalReport {
  dataset: KnownDataset;
  workflow: string;
  sampleSize: number;
  actualSamples: number;
  meanScore: number;
  medianScore: number;
  stdDevScore: number;
  totalCost: number;
  budgetUsd: number;
  budgetAborted: boolean;
  modelMix: string[];
  date: string;
  dryRun: boolean;
  results: EvalSampleResult[];
  confusionMatrix?: Array<{ predicted: string; gold: string; count: number }>;
  topFailures: Array<{ id: string; score: number; predicted: string; gold: string }>;
}

export interface RunEvalOptions {
  dataset: KnownDataset;
  workflow: string;
  sampleSize?: number;
  budgetUsd?: number;
  outputDir?: string;
  dryRun?: boolean;
  offline?: boolean;
}

// ---------------------------------------------------------------------------
// Dataset loaders — inline without dynamic imports
// ---------------------------------------------------------------------------

/**
 * Return the directory that contains the compiled layer/evals/datasets folder.
 * When running from `dist/cli/eval.js`, we need to walk up to REPO_ROOT or use
 * the dist mirror at dist/layer/evals/datasets/<name>/cache/samples.jsonl.
 * Fixtures live in dist/layer/evals/datasets/cuad/fixtures.jsonl (copied by build).
 */
function distDatasetsDir(): string {
  // __dirname of compiled file is <repo>/dist/cli/
  const __filename = fileURLToPath(import.meta.url);
  const __dirname2 = dirname(__filename);
  return join(__dirname2, '..', 'layer', 'evals', 'datasets');
}

function loadJsonlFile(path: string, limit?: number): Array<Record<string, unknown>> {
  if (!existsSync(path)) return [];
  const raw = readFileSync(path, 'utf8');
  const lines = raw.trim().split('\n').filter((l) => l.trim() !== '');
  const parsed = lines.map((l) => JSON.parse(l) as Record<string, unknown>);
  return limit ? parsed.slice(0, limit) : parsed;
}

function loadDatasetSamples(
  dataset: KnownDataset,
  limit: number,
  offline: boolean
): Array<Record<string, unknown>> {
  const distBase = distDatasetsDir();

  // Try dist cache first; fall back to source-tree cache; then fixtures
  const cachePathDist = join(distBase, dataset, 'cache', 'samples.jsonl');
  const cachePathSrc = join(REPO_ROOT, 'layer', 'evals', 'datasets', dataset, 'cache', 'samples.jsonl');
  const fixturePathDist = join(distBase, dataset, 'fixtures.jsonl');
  const fixturePathSrc = join(REPO_ROOT, 'layer', 'evals', 'datasets', dataset, 'fixtures.jsonl');

  if (existsSync(cachePathDist)) return loadJsonlFile(cachePathDist, limit);
  if (existsSync(cachePathSrc)) return loadJsonlFile(cachePathSrc, limit);

  // Offline / dry-run: use bundled fixtures if available
  if (offline || true) {
    if (existsSync(fixturePathDist)) return loadJsonlFile(fixturePathDist, limit);
    if (existsSync(fixturePathSrc)) return loadJsonlFile(fixturePathSrc, limit);
  }

  return [];
}

// ---------------------------------------------------------------------------
// Per-dataset scoring dispatcher
// ---------------------------------------------------------------------------

function scoreSample(
  dataset: KnownDataset,
  predicted: string,
  sample: Record<string, unknown>
): number {
  switch (dataset) {
    case 'cuad': {
      const spans = (sample['gold_spans'] as Array<{ start: number; end: number; text: string }>) ?? [];
      return scoreCuad(predicted, { spans });
    }
    case 'maud': {
      const answer = String(sample['gold_label'] ?? '');
      return scoreMaud(predicted, { answer });
    }
    case 'unfair-tos': {
      const label = String(sample['gold_label'] ?? 'fair') as 'fair' | 'unfair';
      return scoreUnfairTos(predicted, { label });
    }
    case 'ledgar': {
      const topic = String(sample['topic'] ?? sample['gold_label'] ?? '');
      return scoreLedgar(predicted, { topic });
    }
    case 'acord': {
      const fields = (sample['gold_fields'] ?? {}) as Record<string, string>;
      return scoreAcord(predicted, { fields });
    }
  }
}

// ---------------------------------------------------------------------------
// Deterministic stub deliverable for dry-run / offline
// ---------------------------------------------------------------------------

function stubDeliverable(
  dataset: KnownDataset,
  sample: Record<string, unknown>
): string {
  switch (dataset) {
    case 'cuad': {
      const goldLabel = String(sample['gold_label'] ?? 'NOT_FOUND');
      return goldLabel;
    }
    case 'maud':
      return String(sample['gold_label'] ?? '');
    case 'unfair-tos': {
      const label = String(sample['gold_label'] ?? 'fair');
      return label === 'unfair' ? 'UNFAIR — This clause is potentially unfair.' : 'FAIR — This clause is acceptable.';
    }
    case 'ledgar':
      return String(sample['topic'] ?? sample['gold_label'] ?? '');
    case 'acord': {
      const fields = (sample['gold_fields'] ?? {}) as Record<string, string>;
      return Object.entries(fields)
        .map(([k, v]) => `${k}: ${v}`)
        .join('\n');
    }
  }
}

// ---------------------------------------------------------------------------
// Statistics helpers
// ---------------------------------------------------------------------------

function mean(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function median(arr: number[]): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2
    : (sorted[mid] ?? 0);
}

function stdDev(arr: number[]): number {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  const variance = arr.reduce((acc, x) => acc + (x - m) ** 2, 0) / arr.length;
  return Math.sqrt(variance);
}

// ---------------------------------------------------------------------------
// Report rendering
// ---------------------------------------------------------------------------

function renderMarkdown(report: EvalReport): string {
  const lines: string[] = [];
  lines.push(`# PossibLaw Eval Report`);
  lines.push('');
  lines.push(`| Field | Value |`);
  lines.push(`|---|---|`);
  lines.push(`| Dataset | ${report.dataset} |`);
  lines.push(`| Workflow | ${report.workflow} |`);
  lines.push(`| Date | ${report.date} |`);
  lines.push(`| Sample size | ${report.actualSamples} / ${report.sampleSize} requested |`);
  lines.push(`| Mean score | ${report.meanScore.toFixed(4)} |`);
  lines.push(`| Median score | ${report.medianScore.toFixed(4)} |`);
  lines.push(`| Std dev | ${report.stdDevScore.toFixed(4)} |`);
  lines.push(`| Total cost | $${report.totalCost.toFixed(4)} |`);
  lines.push(`| Budget | $${report.budgetUsd.toFixed(2)} |`);
  lines.push(`| Budget aborted | ${report.budgetAborted ? 'YES' : 'no'} |`);
  lines.push(`| Dry run | ${report.dryRun ? 'yes' : 'no'} |`);
  lines.push(`| Model mix | ${report.modelMix.join(', ') || '(offline/stub)'} |`);
  lines.push('');

  if (report.topFailures.length > 0) {
    lines.push(`## Top Failures`);
    lines.push('');
    for (const f of report.topFailures.slice(0, 5)) {
      lines.push(`### Sample \`${f.id}\` — score ${f.score.toFixed(2)}`);
      lines.push(`- **Gold:** \`${f.gold.slice(0, 120)}\``);
      lines.push(`- **Predicted:** \`${f.predicted.slice(0, 120)}\``);
      lines.push('');
    }
  }

  if (report.confusionMatrix && report.confusionMatrix.length > 0) {
    lines.push(`## Confusion Matrix (top 10)`);
    lines.push('');
    lines.push(`| Predicted | Gold | Count |`);
    lines.push(`|---|---|---|`);
    for (const entry of report.confusionMatrix.slice(0, 10)) {
      lines.push(`| ${entry.predicted} | ${entry.gold} | ${entry.count} |`);
    }
    lines.push('');
  }

  lines.push(`## Per-sample Results`);
  lines.push('');
  lines.push(`| ID | Score | Gold (truncated) | Predicted (truncated) |`);
  lines.push(`|---|---|---|---|`);
  for (const r of report.results) {
    const gold = r.gold.replace(/\|/g, '\\|').slice(0, 60);
    const pred = r.predicted.replace(/\|/g, '\\|').slice(0, 60);
    lines.push(`| ${r.id} | ${r.score.toFixed(2)} | ${gold} | ${pred} |`);
  }
  lines.push('');

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Main runEval function
// ---------------------------------------------------------------------------

export async function runEval(opts: RunEvalOptions): Promise<EvalReport> {
  const {
    dataset,
    workflow: workflowName,
    sampleSize = 20,
    budgetUsd = 50,
    outputDir = join(REPO_ROOT, 'layer', 'evals', 'results'),
    dryRun = false,
    offline = false,
  } = opts;

  const BUDGET_ABORT_THRESHOLD = budgetUsd * 0.95;

  // Ensure output directory exists
  mkdirSync(outputDir, { recursive: true });

  // Load workflow (validates it exists)
  loadWorkflow(workflowName);

  // Load samples
  const samples = loadDatasetSamples(dataset, sampleSize, offline || dryRun);

  if (samples.length === 0) {
    throw new Error(
      `No samples available for dataset "${dataset}". ` +
      `Run 'possiblaw eval fetch ${dataset}' first, or the dataset may not support offline mode.`
    );
  }

  const results: EvalSampleResult[] = [];
  let totalCost = 0;
  let budgetAborted = false;
  const modelMixSet = new Set<string>();
  const workflow = loadWorkflow(workflowName);

  for (const sample of samples) {
    // Budget check
    if (totalCost >= BUDGET_ABORT_THRESHOLD) {
      console.warn(
        `[eval] Budget threshold reached ($${totalCost.toFixed(4)} >= $${BUDGET_ABORT_THRESHOLD.toFixed(4)}). Aborting gracefully.`
      );
      budgetAborted = true;
      break;
    }

    const sampleId = String(sample['id'] ?? `sample-${results.length}`);
    const prompt = adaptSample(dataset, sample);

    let predicted: string;
    let sampleCost = 0;

    if (dryRun) {
      // No LLM calls — use gold label as stub prediction
      predicted = stubDeliverable(dataset, sample);
    } else {
      let report: RunReport;
      try {
        report = await runPipeline(workflow, prompt, {
          verbose: false,
          offline,
          privacyProfile: 'off',
        });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        console.warn(`[eval] Sample ${sampleId} pipeline error: ${message}`);
        results.push({
          id: sampleId,
          score: 0,
          predicted: `ERROR: ${message}`,
          gold: String(sample['gold_label'] ?? ''),
          cost: 0,
          dryRun: false,
        });
        continue;
      }

      predicted = report.deliverable;
      sampleCost = report.cost?.total ?? 0;
      totalCost += sampleCost;

      // Collect model mix
      for (const call of report.agentCalls) {
        modelMixSet.add(call.model);
      }
    }

    const score = scoreSample(dataset, predicted, sample);
    const gold = String(sample['gold_label'] ?? '');

    results.push({
      id: sampleId,
      score,
      predicted: predicted.slice(0, 500),
      gold: gold.slice(0, 200),
      cost: sampleCost,
      dryRun,
    });
  }

  const scores = results.map((r) => r.score);
  const meanScore = mean(scores);
  const medianScore = median(scores);
  const stdDevScore = stdDev(scores);

  // Build confusion matrix for classification tasks
  let confusionMatrix: Array<{ predicted: string; gold: string; count: number }> | undefined;
  if (dataset === 'unfair-tos' || dataset === 'ledgar') {
    const predictedLabels = results.map((r) => {
      if (dataset === 'unfair-tos') {
        return /unfair|potentially.unfair|problematic|violat|harmful|unreasonab/i.test(r.predicted)
          ? 'unfair'
          : 'fair';
      }
      return r.predicted.split('\n')[0]?.trim().toLowerCase() ?? '';
    });
    const goldLabels = results.map((r) => r.gold);
    confusionMatrix = buildConfusionMatrix(predictedLabels, goldLabels);
  }

  // Top failures: lowest-scoring, non-perfect results
  const topFailures = results
    .filter((r) => r.score < 1.0)
    .sort((a, b) => a.score - b.score)
    .slice(0, 10)
    .map((r) => ({ id: r.id, score: r.score, predicted: r.predicted, gold: r.gold }));

  const report: EvalReport = {
    dataset,
    workflow: workflowName,
    sampleSize,
    actualSamples: results.length,
    meanScore,
    medianScore,
    stdDevScore,
    totalCost,
    budgetUsd,
    budgetAborted,
    modelMix: [...modelMixSet],
    date: new Date().toISOString(),
    dryRun,
    results,
    confusionMatrix,
    topFailures,
  };

  // Write outputs
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const baseName = `${dataset}--${workflowName}--${timestamp}`;

  writeFileSync(
    join(outputDir, `${baseName}.json`),
    JSON.stringify(report, null, 2) + '\n',
    'utf8'
  );

  writeFileSync(
    join(outputDir, `${baseName}.md`),
    renderMarkdown(report),
    'utf8'
  );

  return report;
}
