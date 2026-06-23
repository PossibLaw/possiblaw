#!/usr/bin/env tsx
// eval-harness/src/index.ts — CLI entry point
// Subcommands: run, list, compare, report, coverage
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { parseCase, CaseParseError, loadCasesForTarget } from "./cases/parse.ts";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { generateCoverage } from "./coverage.ts";
import { runTarget } from "./runner.ts";
import { createModelClient } from "./model-client/index.ts";
import { writeReport, renderMarkdown, type RunReport } from "./report/index.ts";

// Paths relative to repo root
const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..", "..");

const VARIANTS_PATH = join(REPO_ROOT, "companies/legal-operations/variants.yaml");
const PAPERCLIP_YAML_PATH = join(REPO_ROOT, "companies/legal-operations/.paperclip.yaml");
const CASES_DIR = join(REPO_ROOT, "companies/legal-operations/evals/cases");
const AGENTS_DIR = join(REPO_ROOT, "companies/legal-operations/agents");
const SKILLS_DIR = join(REPO_ROOT, "companies/legal-operations/skills");
const RESULTS_DIR = join(REPO_ROOT, "eval-harness/results");
const COVERAGE_OUT = join(REPO_ROOT, "companies/legal-operations/evals/COVERAGE.md");

function usage(): void {
  console.log(`
PossibLaw Eval Harness

Usage:
  ./bin/eval <command> [options]

Commands:
  run --agent <slug> | --skill <slug> [--variant <v>] [--budget <n>]
      Run eval cases for an agent or skill, write report to eval-harness/results/

  list
      Print coverage table to stdout (lists all targets + eval status, reports parse errors)

  coverage
      Write COVERAGE.md to companies/legal-operations/evals/COVERAGE.md

  compare <run-a.json> <run-b.json>
      Print per-case score delta table between two report JSON files

  report <run.json>
      Re-render a saved report JSON as markdown to stdout
`.trim());
}

async function cmdRun(args: string[]): Promise<void> {
  let target: string | null = null;
  let variant = "codex";
  let budget: number | null = null;

  for (let i = 0; i < args.length; i++) {
    if ((args[i] === "--agent" || args[i] === "--skill") && args[i + 1]) {
      target = args[++i];
    } else if (args[i] === "--variant" && args[i + 1]) {
      variant = args[++i];
    } else if (args[i] === "--budget" && args[i + 1]) {
      budget = parseFloat(args[++i]);
    }
  }

  if (!target) {
    console.error("Error: --agent <slug> or --skill <slug> is required");
    process.exit(1);
  }

  const client = createModelClient();
  console.log(`Running eval for target: ${target} (variant: ${variant})`);

  const report = await runTarget(target, {
    variant,
    budget,
    client,
    variantsPath: VARIANTS_PATH,
    paperclipYamlPath: PAPERCLIP_YAML_PATH,
    casesDir: CASES_DIR,
  });

  // Print per-case table
  console.log(`\n${target}  (${report.cases.length} cases, lane=${report.lane} → ${report.modelMix})`);
  for (const c of report.cases) {
    const status = c.skipped ? "SKIP" : c.pass ? "PASS" : "FAIL";
    const detail = c.detail ? `  (${c.detail})` : "";
    console.log(`  ${c.slug.padEnd(40)} ${status}  ${c.score.toFixed(2)}${detail}`);
  }
  console.log(`\n  score: ${report.meanScore.toFixed(2)}   cost $${report.totalCost.toFixed(4)}   ${report.timestamp}`);

  const { mdPath, jsonPath } = writeReport(RESULTS_DIR, report);
  console.log(`  report → ${mdPath}`);
  console.log(`  json   → ${jsonPath}`);
}

function cmdList(): void {
  // Parse all cases in casesDir, report CaseParseErrors, print coverage
  const files = (() => {
    try {
      return readdirSync(CASES_DIR).filter(f => f.endsWith(".md")).sort();
    } catch {
      return [];
    }
  })();

  const errors: Array<{ file: string; message: string }> = [];
  for (const file of files) {
    const filePath = join(CASES_DIR, file);
    const content = readFileSync(filePath, "utf-8");
    const slug = file.replace(/\.md$/, "");
    try {
      parseCase(content, slug);
    } catch (e) {
      if (e instanceof CaseParseError) {
        errors.push({ file, message: e.message });
      }
    }
  }

  if (errors.length > 0) {
    console.error("Case parse errors (fix these before running evals):");
    for (const { file, message } of errors) {
      console.error(`  ${file}: ${message}`);
    }
    console.error("");
  }

  const md = generateCoverage(AGENTS_DIR, SKILLS_DIR, CASES_DIR);
  console.log(md);
}

function cmdCoverage(): void {
  const md = generateCoverage(AGENTS_DIR, SKILLS_DIR, CASES_DIR);
  mkdirSync(dirname(COVERAGE_OUT), { recursive: true });
  writeFileSync(COVERAGE_OUT, md, "utf-8");
  console.log(`Coverage written to: ${COVERAGE_OUT}`);
}

function cmdCompare(args: string[]): void {
  const [pathA, pathB] = args;
  if (!pathA || !pathB) {
    console.error("Usage: compare <run-a.json> <run-b.json>");
    process.exit(1);
  }

  const reportA = JSON.parse(readFileSync(resolve(pathA), "utf-8")) as RunReport;
  const reportB = JSON.parse(readFileSync(resolve(pathB), "utf-8")) as RunReport;

  const slugsA = new Map(reportA.cases.map(c => [c.slug, c]));
  const slugsB = new Map(reportB.cases.map(c => [c.slug, c]));
  const allSlugs = new Set([...slugsA.keys(), ...slugsB.keys()]);

  console.log(`# Compare: ${reportA.variant} vs ${reportB.variant}`);
  console.log(`# ${reportA.target} — ${reportA.timestamp} vs ${reportB.timestamp}`);
  console.log("");
  console.log(`| slug | ${reportA.variant} | ${reportB.variant} | delta |`);
  console.log(`|---|---|---|---|`);

  for (const slug of [...allSlugs].sort()) {
    const a = slugsA.get(slug);
    const b = slugsB.get(slug);
    const scoreA = a ? a.score.toFixed(2) : "—";
    const scoreB = b ? b.score.toFixed(2) : "—";
    const delta = a && b ? (b.score - a.score).toFixed(2) : "—";
    console.log(`| ${slug} | ${scoreA} | ${scoreB} | ${delta} |`);
  }

  const meanA = reportA.meanScore.toFixed(2);
  const meanB = reportB.meanScore.toFixed(2);
  const meanDelta = (reportB.meanScore - reportA.meanScore).toFixed(2);
  console.log(`| **mean** | ${meanA} | ${meanB} | **${meanDelta}** |`);
}

function cmdReport(args: string[]): void {
  const [path] = args;
  if (!path) {
    console.error("Usage: report <run.json>");
    process.exit(1);
  }
  const report = JSON.parse(readFileSync(resolve(path), "utf-8")) as RunReport;
  console.log(renderMarkdown(report));
}

async function main(): Promise<void> {
  const [, , cmd, ...rest] = process.argv;

  switch (cmd) {
    case "run":
      await cmdRun(rest);
      break;
    case "list":
      cmdList();
      break;
    case "coverage":
      cmdCoverage();
      break;
    case "compare":
      cmdCompare(rest);
      break;
    case "report":
      cmdReport(rest);
      break;
    default:
      usage();
      if (cmd) {
        console.error(`\nUnknown command: ${cmd}`);
        process.exit(1);
      }
  }
}

main().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});
