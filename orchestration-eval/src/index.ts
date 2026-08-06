// orchestration-eval/src/index.ts
import { readFileSync } from "node:fs";
import { parse as parseYaml } from "yaml";
import { loadBenchmark } from "../../eval-harness/src/benchmarks.ts";
import { PaperclipEvalClient } from "./paperclip-client.ts";
import { runArm, type Arm, type RunArmResult } from "./runner.ts";
import { scoreRun } from "./judge.ts";
import { aggregate, renderReport, type RunRecord } from "./report.ts";
import { AgentResolutionError, buildAgentDirectory } from "./agent-resolver.ts";

export interface ParsedArgs {
  command: "run" | "list"; benchmark: string; limit?: number; runs: number; config: string; arms: Arm[]; budgetCents?: number; judgeModel?: string; awaitTimeoutMs?: number;
}

export function parseArgs(argv: string[]): ParsedArgs {
  const command = (argv[0] === "list" ? "list" : "run");
  const get = (flag: string): string | undefined => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  return {
    command,
    benchmark: get("--benchmark") ?? "lab",
    limit: get("--limit") ? Number(get("--limit")) : undefined,
    runs: get("--runs") ? Number(get("--runs")) : 3,
    config: get("--config") ?? "sota-subscription",
    arms: (get("--arms") ?? "A,B").split(",").map(s => s.trim()) as Arm[],
    budgetCents: get("--budget") ? Number(get("--budget")) : undefined,
    judgeModel: get("--judge-model"),
    awaitTimeoutMs: get("--await-timeout") ? Number(get("--await-timeout")) * 60 * 1000 : undefined,
  };
}

/** Task 1.3: turn a finished arm run into a RunRecord.
 * A run whose root ended `cancelled` or that hit the await timeout is scored
 * FAILED — the judge is NOT invoked on whatever partial deliverable exists,
 * and the record still counts against the arm's all-pass rate (not SKIPPED). */
export async function completeRun(
  r: Pick<RunArmResult, "status" | "timedOut" | "failureReason" | "costCents" | "wallClockSeconds" | "decomposition">,
  ctx: { task: string; arm: Arm; config: string },
  judge: () => Promise<{ all_pass: boolean }>,
): Promise<RunRecord> {
  const base = {
    ...ctx,
    timedOut: r.timedOut,
    wallClockSeconds: r.wallClockSeconds,
    costCents: r.costCents ?? null,
    decomposition: r.decomposition ?? null,
  };
  if (r.failureReason) return { ...base, allPass: false, failReason: r.failureReason };
  const scores = await judge();
  return { ...base, allPass: scores.all_pass, failReason: null };
}

/** Task 1.1: structured SKIPPED reason for a failed run attempt.
 * AgentResolutionError messages already carry `arm_a_agent_unresolved: <slug> (…)`. */
export function skipReasonFor(e: unknown): string {
  return e instanceof AgentResolutionError ? e.message : String(e);
}

// Live execution requires a disposable paperclip instance + harvey-lab + ANTHROPIC_API_KEY.
// Driven by env: PAPERCLIP_BASE_URL, PAPERCLIP_COMPANY_ID, PAPERCLIP_API_KEY,
// CHIEF_OF_STAFF_AGENT_ID, HARVEY_LAB_DIR, REPO_ROOT.
export async function main(argv: string[]): Promise<void> {
  const args = parseArgs(argv);
  const repoRoot = process.env.REPO_ROOT ?? process.cwd();
  if (args.command === "list") {
    const cases = loadBenchmark(args.benchmark, repoRoot);
    console.log(`${args.benchmark}: ${cases.length} cases`);
    for (const c of cases) console.log(`  ${c.slug}`);
    return;
  }
  const harveyLabDir = process.env.HARVEY_LAB_DIR ?? `${repoRoot}/harvey-lab`;
  const client = new PaperclipEvalClient({
    baseUrl: process.env.PAPERCLIP_BASE_URL!, companyId: process.env.PAPERCLIP_COMPANY_ID!, apiKey: process.env.PAPERCLIP_API_KEY ?? "",
  });
  if (args.budgetCents) await client.patchCompanyBudget(args.budgetCents);
  const chiefOfStaffAgentId = process.env.CHIEF_OF_STAFF_AGENT_ID!;
  const cases = loadBenchmark(args.benchmark, repoRoot).slice(0, args.limit ?? undefined);
  const resultsDir = `${harveyLabDir}/results`;

  // Load manifest excluded tasks for honest SKIPPED accounting.
  const manifestPath = `${repoRoot}/layer/evals/datasets/lab/lab-manifest.yaml`;
  let excluded: Array<{ task: string; reason: string }> = [];
  try {
    const raw = readFileSync(manifestPath, "utf-8");
    const manifest = parseYaml(raw) as any;
    excluded = ((manifest?.excluded ?? []) as Array<{ task: string; reason: string }>)
      .map((e) => ({ task: String(e.task ?? ""), reason: String(e.reason ?? "excluded") }));
  } catch { /* manifest optional — skip if missing */ }

  // Task 1.1: build the slug→UUID agent directory ONCE per run. Manifest
  // `arm_a_agent` values (and a slug-form CHIEF_OF_STAFF_AGENT_ID) are resolved
  // through it; paperclip rejects non-UUID assigneeAgentId values.
  const agentDirectory = buildAgentDirectory(await client.listAgents());

  const records: RunRecord[] = [];
  const dropped: Array<{ task: string; reason: string }> = [];
  const droppedTasks = new Set<string>();
  const armADecomposed: Array<{ task: string; childCount: number }> = [];

  for (const c of cases) {
    const task = (c.metadata?.["task_path"] as string) ?? c.slug;
    for (const arm of args.arms) {
      for (let k = 0; k < args.runs; k++) {
        const runId = `${task.replace(/\//g, "_")}__${arm}__${args.config}__${k}`;
        try {
          const r = await runArm({ caseRec: c, harveyLabDir, resultsDir, runId, arm, chiefOfStaffAgentId, client, agents: agentDirectory,
            ...(args.awaitTimeoutMs ? { awaitOpts: { timeoutMs: args.awaitTimeoutMs } } : {}) });
          // Cancelled/timed-out roots are FAILED without judging (Task 1.3).
          const record = await completeRun(r, { task, arm, config: args.config },
            () => scoreRun(harveyLabDir, runId, task, { judgeModel: args.judgeModel ?? c.grading.rubric?.judge_model }));
          // Track Arm A decomposition: any child issues indicate the lead delegated.
          if (arm === "A" && r.childIssueCount > 0) {
            armADecomposed.push({ task, childCount: r.childIssueCount });
          }
          records.push(record);
        } catch (e) {
          const reason = skipReasonFor(e);
          console.error(`run ${runId} failed: ${reason}`);
          if (!droppedTasks.has(task)) {
            droppedTasks.add(task);
            dropped.push({ task, reason });
          }
        }
      }
    }
  }
  console.log(renderReport(aggregate(records), { runsPerCell: args.runs, skipped: [...excluded, ...dropped], armADecomposed, records }));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv.slice(2)).catch(e => { console.error(e); process.exit(1); });
}
