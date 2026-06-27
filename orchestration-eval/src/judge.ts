// orchestration-eval/src/judge.ts
// Shells to harvey-lab/evaluation/run_eval.py (UNMODIFIED). Judge needs ANTHROPIC_API_KEY.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { spawn } from "node:child_process";

export interface JudgeScores {
  score: number; all_pass: boolean; n_criteria: number; n_passed: number;
  criteria_results: Array<{ id: string; title: string; verdict: "pass" | "fail"; reasoning: string }>;
  run_id: string; task: string; judge_model: string;
  cost?: { input_tokens: number; output_tokens: number; wall_clock_seconds: number };
}

export function judgeArgvFor(runId: string, task: string, judgeModel: string): { cmd: string; args: string[] } {
  return { cmd: "uv", args: ["run", "python", "-m", "evaluation.run_eval", "--run-id", runId, "--task", task, "--judge-model", judgeModel] };
}

const defaultRun = (cmd: string, args: string[], cwd: string) => new Promise<{ code: number; stderr: string }>((resolve) => {
  const p = spawn(cmd, args, { cwd, stdio: ["ignore", "inherit", "pipe"] });
  let stderr = "";
  p.stderr.on("data", d => (stderr += d));
  p.on("close", code => resolve({ code: code ?? 1, stderr }));
  p.on("error", err => resolve({ code: 1, stderr: String(err) }));
});

export async function scoreRun(
  harveyLabDir: string, runId: string, task: string,
  opts: { judgeModel?: string; run?: (cmd: string, args: string[], cwd: string) => Promise<{ code: number; stderr: string }>; readScores?: (p: string) => string } = {},
): Promise<JudgeScores> {
  const judgeModel = opts.judgeModel ?? "claude-sonnet-4-6";
  const { cmd, args } = judgeArgvFor(runId, task, judgeModel);
  const run = opts.run ?? defaultRun;
  const { code, stderr } = await run(cmd, args, harveyLabDir);
  if (code !== 0) throw new Error(`run_eval failed (exit ${code}): ${stderr.trim()}`);
  const scoresPath = join(harveyLabDir, "results", runId, "scores.json");
  const read = opts.readScores ?? ((p: string) => readFileSync(p, "utf-8"));
  return JSON.parse(read(scoresPath)) as JudgeScores;
}
