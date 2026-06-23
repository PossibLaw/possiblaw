// eval-harness/src/model-client/drivers/opencode.ts
import { spawn } from "node:child_process";
import type { ModelResult, ResolvedModel } from "../types.ts";

function spawnOpencode(args: string[], prompt: string, timeoutMs: number): Promise<ModelResult> {
  const start = Date.now();
  return new Promise<ModelResult>((resolve) => {
    const proc = spawn("opencode", args, { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (d: Buffer) => { stdout += d.toString(); });
    proc.stderr.on("data", (d: Buffer) => { stderr += d.toString(); });
    proc.on("error", (e: NodeJS.ErrnoException) => {
      const reason = e.code === "ENOENT"
        ? "opencode CLI not found — install OpenCode to use this variant"
        : `opencode spawn error: ${e.message}`;
      resolve({ ok: false, skipped: true, reason });
    });
    proc.on("close", (code) => {
      if (code !== 0) {
        resolve({ ok: false, skipped: true, reason: `opencode exited with code ${code}: ${stderr.trim()}` });
      } else {
        resolve({ ok: true, output: stdout.trim(), costUsd: 0, ms: Date.now() - start });
      }
    });
    const timer = setTimeout(() => {
      proc.kill();
      resolve({ ok: false, skipped: true, reason: `opencode timed out after ${timeoutMs}ms` });
    }, timeoutMs);
    proc.on("close", () => clearTimeout(timer));
    proc.stdin.end(prompt);
  });
}

export async function run(prompt: string, model: ResolvedModel): Promise<ModelResult> {
  const timeoutMs = Number(model.params.timeoutSec ?? 600) * 1000;
  const ollamaUrl = process.env.OLLAMA_BASE_URL;
  const hasApiKey = Boolean(process.env.OPENCODE_API_KEY);
  const args = ollamaUrl && !hasApiKey
    ? ["run", "--model", model.model, "--provider", ollamaUrl]
    : ["run", "--model", model.model];
  return spawnOpencode(args, prompt, timeoutMs);
}
