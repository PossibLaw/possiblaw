// eval-harness/src/model-client/drivers/gemini.ts
import { spawn } from "node:child_process";
import type { ModelResult, ResolvedModel } from "../types.ts";

export async function run(prompt: string, model: ResolvedModel): Promise<ModelResult> {
  const start = Date.now();
  // gemini CLI takes prompt as an argument (headless mode)
  const args = ["--model", model.model, "--prompt", prompt];
  return new Promise<ModelResult>((resolve) => {
    const proc = spawn("gemini", args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (d: Buffer) => { stdout += d.toString(); });
    proc.stderr.on("data", (d: Buffer) => { stderr += d.toString(); });
    proc.on("error", (e: NodeJS.ErrnoException) => {
      const reason = e.code === "ENOENT"
        ? "gemini CLI not found — install Gemini CLI to use this variant"
        : `gemini spawn error: ${e.message}`;
      resolve({ ok: false, skipped: true, reason });
    });
    proc.on("close", (code) => {
      if (code !== 0) {
        resolve({ ok: false, skipped: true, reason: `gemini exited with code ${code}: ${stderr.trim()}` });
      } else {
        resolve({ ok: true, output: stdout.trim(), costUsd: 0, ms: Date.now() - start });
      }
    });
    const timeoutMs = Number(model.params.timeoutSec ?? 600) * 1000;
    const timer = setTimeout(() => {
      proc.kill();
      resolve({ ok: false, skipped: true, reason: `gemini timed out after ${timeoutMs}ms` });
    }, timeoutMs);
    proc.on("close", () => clearTimeout(timer));
  });
}
