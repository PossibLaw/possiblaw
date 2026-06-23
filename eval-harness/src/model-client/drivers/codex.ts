// eval-harness/src/model-client/drivers/codex.ts
import { spawn } from "node:child_process";
import type { ModelResult, ResolvedModel } from "../types.ts";

export async function run(prompt: string, model: ResolvedModel): Promise<ModelResult> {
  const start = Date.now();
  const args = ["exec", "--model", model.model];
  if (model.params.dangerouslyBypassApprovalsAndSandbox) {
    args.push("--dangerously-bypass-approvals-and-sandbox");
  }
  return new Promise<ModelResult>((resolve) => {
    const proc = spawn("codex", args, { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (d: Buffer) => { stdout += d.toString(); });
    proc.stderr.on("data", (d: Buffer) => { stderr += d.toString(); });
    proc.on("error", (e: NodeJS.ErrnoException) => {
      const reason = e.code === "ENOENT"
        ? "codex CLI not found — install Codex CLI to use this variant"
        : `codex spawn error: ${e.message}`;
      resolve({ ok: false, skipped: true, reason });
    });
    proc.on("close", (code) => {
      if (code !== 0) {
        resolve({ ok: false, skipped: true, reason: `codex exited with code ${code}: ${stderr.trim()}` });
      } else {
        resolve({ ok: true, output: stdout.trim(), costUsd: 0, ms: Date.now() - start });
      }
    });
    const timeoutMs = Number(model.params.timeoutSec ?? 600) * 1000;
    const timer = setTimeout(() => {
      proc.kill();
      resolve({ ok: false, skipped: true, reason: `codex timed out after ${timeoutMs}ms` });
    }, timeoutMs);
    proc.on("close", () => clearTimeout(timer));
    proc.stdin.end(prompt);
  });
}
