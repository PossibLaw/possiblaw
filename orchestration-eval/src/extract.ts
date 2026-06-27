// orchestration-eval/src/extract.ts
// Shells to harvey-lab/sandbox/parsers/parse_doc.py (UNMODIFIED) via uv.
// .eml/.txt are read directly; binary formats go through parse_doc.
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, extname } from "node:path";
import { spawn } from "node:child_process";

export type DocFormat = "docx" | "pdf" | "pptx" | "xlsx";
const FORMAT_BY_EXT: Record<string, DocFormat> = { ".docx": "docx", ".pdf": "pdf", ".pptx": "pptx", ".xlsx": "xlsx" };

export function parseArgvFor(harveyLabDir: string, format: DocFormat, file: string): { cmd: string; args: string[] } {
  return { cmd: "uv", args: ["run", "python", "sandbox/parsers/parse_doc.py", format, file] };
}

type Runner = (cmd: string, args: string[], cwd: string) => Promise<{ stdout: string; code: number; stderr: string }>;

const defaultRun: Runner = (cmd, args, cwd) => new Promise((resolve) => {
  const p = spawn(cmd, args, { cwd });
  let stdout = "", stderr = "";
  p.stdout.on("data", d => (stdout += d));
  p.stderr.on("data", d => (stderr += d));
  p.on("close", code => resolve({ stdout, code: code ?? 1, stderr }));
  p.on("error", err => resolve({ stdout: "", code: 1, stderr: String(err) }));
});

export async function extractDocText(
  harveyLabDir: string, file: string,
  run?: (cmd: string, args: string[]) => Promise<{ stdout: string; code: number; stderr: string }>,
): Promise<{ text: string; skipped: boolean; reason?: string }> {
  const ext = extname(file).toLowerCase();
  if (ext === ".eml" || ext === ".txt") {
    try { return { text: readFileSync(file, "utf-8"), skipped: false }; }
    catch (e) { return { text: "", skipped: true, reason: `read failed: ${String(e)}` }; }
  }
  const format = FORMAT_BY_EXT[ext];
  if (!format) return { text: "", skipped: true, reason: `unsupported extension: ${ext}` };
  const { cmd, args } = parseArgvFor(harveyLabDir, format, file);
  const exec = run ? (c: string, a: string[]) => run(c, a) : (c: string, a: string[]) => defaultRun(c, a, harveyLabDir);
  const { stdout, code, stderr } = await exec(cmd, args);
  if (code !== 0) return { text: "", skipped: true, reason: stderr.trim() || `parse_doc exit ${code}` };
  return { text: stdout, skipped: false };
}

export async function extractTaskDocuments(
  harveyLabDir: string, taskPath: string,
  run?: (cmd: string, args: string[]) => Promise<{ stdout: string; code: number; stderr: string }>,
): Promise<Array<{ name: string; text: string; skipped: boolean }>> {
  const dir = join(harveyLabDir, "tasks", taskPath, "documents");
  if (!existsSync(dir)) return [];
  const out: Array<{ name: string; text: string; skipped: boolean }> = [];
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    try {
      const r = await extractDocText(harveyLabDir, join(dir, entry.name), run);
      out.push({ name: entry.name, text: r.text, skipped: r.skipped });
    } catch {
      // per-file failures do not abort the batch
    }
  }
  return out;
}
