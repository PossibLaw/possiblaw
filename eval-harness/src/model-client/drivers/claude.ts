// eval-harness/src/model-client/drivers/claude.ts
import { spawn } from "node:child_process";
import type { ModelResult, ResolvedModel } from "../types.ts";

export async function run(prompt: string, model: ResolvedModel): Promise<ModelResult> {
  const start = Date.now();
  const args = ["--print", "--model", model.model];
  if (model.params.dangerouslySkipPermissions) {
    args.push("--dangerously-skip-permissions");
  }
  return new Promise<ModelResult>((resolve) => {
    const proc = spawn("claude", args, { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (d: Buffer) => { stdout += d.toString(); });
    proc.stderr.on("data", (d: Buffer) => { stderr += d.toString(); });
    proc.on("error", (e: NodeJS.ErrnoException) => {
      const reason = e.code === "ENOENT"
        ? "claude CLI not found — install Claude CLI to use this variant"
        : `claude spawn error: ${e.message}`;
      resolve({ ok: false, skipped: true, reason });
    });
    proc.on("close", (code) => {
      if (code !== 0) {
        resolve({ ok: false, skipped: true, reason: `claude exited with code ${code}: ${stderr.trim()}` });
      } else {
        resolve({ ok: true, output: stdout.trim(), costUsd: 0, ms: Date.now() - start });
      }
    });
    const timeoutMs = Number(model.params.timeoutSec ?? 600) * 1000;
    const timer = setTimeout(() => {
      proc.kill();
      resolve({ ok: false, skipped: true, reason: `claude timed out after ${timeoutMs}ms` });
    }, timeoutMs);
    proc.on("close", () => clearTimeout(timer));
    proc.stdin.end(prompt);
  });
}
