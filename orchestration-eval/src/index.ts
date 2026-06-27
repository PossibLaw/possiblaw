// orchestration-eval/src/index.ts
import { loadBenchmark } from "../../eval-harness/src/benchmarks.ts";
import { PaperclipEvalClient } from "./paperclip-client.ts";
import { runArm, type Arm } from "./runner.ts";
import { scoreRun } from "./judge.ts";
import { aggregate, renderReport, type RunRecord } from "./report.ts";

export interface ParsedArgs {
  command: "run" | "list"; benchmark: string; limit?: number; runs: number; config: string; arms: Arm[]; budgetCents?: number;
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
  };
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

  const records: RunRecord[] = [];
  for (const c of cases) {
    const task = (c.metadata?.["task_path"] as string) ?? c.slug;
    for (const arm of args.arms) {
      for (let k = 0; k < args.runs; k++) {
        const runId = `${task.replace(/\//g, "_")}__${arm}__${args.config}__${k}`;
        try {
          const r = await runArm({ caseRec: c, harveyLabDir, resultsDir, runId, arm, chiefOfStaffAgentId, client });
          const scores = await scoreRun(harveyLabDir, runId, task, { judgeModel: c.grading.rubric?.judge_model });
          records.push({ task, arm, config: args.config, allPass: scores.all_pass, costCents: r.costCents ?? null });
        } catch (e) {
          console.error(`run ${runId} failed: ${String(e)}`);
        }
      }
    }
  }
  console.log(renderReport(aggregate(records), { runsPerCell: args.runs, skipped: [] }));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv.slice(2)).catch(e => { console.error(e); process.exit(1); });
}
