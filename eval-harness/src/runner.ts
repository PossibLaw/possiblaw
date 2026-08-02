// eval-harness/src/runner.ts
import { readFileSync } from "node:fs";
import { parse as yamlParse } from "yaml";
import type { Case } from "./types.ts";
import type { ModelClient } from "./model-client/types.ts";
import { loadVariants, resolveModel } from "./variants.ts";
import { loadCasesForTarget } from "./cases/parse.ts";
import { runDeterministic } from "./grade/deterministic.ts";
import { runRubric } from "./grade/rubric.ts";
import { summarize, type CaseRecord, type RunReport } from "./report/index.ts";

export interface RunOptions {
  variant: string;
  budget: number | null;
  client: ModelClient;
  variantsPath: string;
  paperclipYamlPath: string;
  casesDir: string;
}

/**
 * Reads the .paperclip.yaml sidecar and extracts the modelLane for the given agent target.
 * Falls back to "primary" if the agent is not found or has no modelLane set.
 */
function laneFromPaperclip(paperclipYamlPath: string, target: string): string {
  try {
    const content = readFileSync(paperclipYamlPath, "utf-8");
    const parsed = yamlParse(content) as Record<string, unknown>;
    const agents = parsed.agents as Record<string, unknown> | undefined;
    if (!agents) return "primary";
    const agent = agents[target] as Record<string, unknown> | undefined;
    if (!agent) return "primary";
    const metadata = agent.metadata as Record<string, unknown> | undefined;
    if (!metadata) return "primary";
    const possiblaw = metadata.possiblaw as Record<string, unknown> | undefined;
    if (!possiblaw) return "primary";
    const lane = possiblaw.modelLane;
    return typeof lane === "string" ? lane : "primary";
  } catch {
    return "primary";
  }
}

/**
 * Builds the prompt sent to the model: input_brief followed by any document contents.
 */
function buildAgentPrompt(c: Case): string {
  const parts = [c.input_brief];
  if (c.documents.length > 0) {
    parts.push("\n\n--- Documents ---");
    for (const doc of c.documents) {
      parts.push(doc);
    }
  }
  return parts.join("\n");
}

/**
 * Runs a single eval case: resolves the model, invokes it, grades the output.
 */
export async function runCase(c: Case, opts: RunOptions): Promise<CaseRecord> {
  const variantsFile = loadVariants(opts.variantsPath);
  const lane = c.lane ?? laneFromPaperclip(opts.paperclipYamlPath, c.target);
  const model = resolveModel(variantsFile, opts.variant, lane);

  const prompt = buildAgentPrompt(c);
  const result = await opts.client.run(prompt, model);

  if (!result.ok) {
    return {
      slug: c.slug,
      target: c.target,
      mode: c.grading.mode,
      pass: false,
      score: 0,
      costUsd: 0,
      ms: 0,
      skipped: true,
      detail: result.reason,
    };
  }

  const { output, costUsd, ms } = result;

  // Grade the output
  let score = 0;
  let pass = false;
  let detail = "";

  if (c.grading.mode === "deterministic") {
    const checks = c.grading.checks ?? [];
    const graded = runDeterministic(output, checks);
    score = graded.score;
    pass = graded.pass;
    const failed = graded.results.filter(r => !r.pass);
    detail = failed.map(r => r.detail).join("; ");
  } else {
    // rubric mode
    const rubric = c.grading.rubric;
    if (!rubric) {
      return {
        slug: c.slug, target: c.target, mode: c.grading.mode,
        pass: false, score: 0, costUsd, ms, skipped: false,
        detail: "rubric grading mode but no rubric defined",
        output,
      };
    }
    const graded = await runRubric(
      output,
      rubric,
      opts.client,
      (judgeModelLane: string) => resolveModel(variantsFile, opts.variant, judgeModelLane),
      model,
    );
    score = graded.score;
    pass = graded.pass;
    const failed = graded.verdicts.filter(v => !v.pass);
    detail = failed.map(v => v.raw.split("\n")[0]).join("; ");
  }

  return {
    slug: c.slug,
    target: c.target,
    mode: c.grading.mode,
    pass,
    score,
    costUsd,
    ms,
    skipped: false,
    detail,
    output,
  };
}

/**
 * Runs all cases for a target sequentially, respecting the budget limit.
 * Stops running new cases when cumulative cost would exceed the budget.
 */
/**
 * Runs a given list of cases sequentially (respecting the budget) and summarizes
 * them under `label` (the report's target field). Shared by the target path
 * (runTarget) and the benchmark path (CLI --benchmark).
 */
export async function runCases(cases: Case[], label: string, opts: RunOptions): Promise<RunReport> {
  const records: CaseRecord[] = [];
  let cumulativeCost = 0;
  let budgetAborted = false;
  const timestamp = new Date().toISOString();

  for (const c of cases) {
    if (opts.budget !== null && cumulativeCost >= opts.budget) {
      budgetAborted = true;
      break;
    }
    const rec = await runCase(c, opts);
    records.push(rec);
    cumulativeCost += rec.costUsd;
  }

  // Lane + model mix for the report header derive from the first case's target.
  const refTarget = cases.length > 0 ? cases[0].target : label;
  const lane = cases.length > 0 ? (cases[0].lane ?? laneFromPaperclip(opts.paperclipYamlPath, refTarget)) : "primary";
  let modelMix = opts.variant;
  try {
    const variantsFile = loadVariants(opts.variantsPath);
    const model = resolveModel(variantsFile, opts.variant, lane);
    modelMix = `${model.adapterType}/${model.model}`;
  } catch {
    // keep variant as modelMix
  }

  return summarize(label, opts.variant, lane, modelMix, records, opts.budget, budgetAborted, timestamp);
}

/**
 * Runs all cases for a target (loaded from the cases dir) sequentially.
 */
export async function runTarget(target: string, opts: RunOptions): Promise<RunReport> {
  const cases = loadCasesForTarget(opts.casesDir, target);
  return runCases(cases, target, opts);
}
