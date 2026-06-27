// eval-harness/src/benchmarks.ts
// Registry mapping a benchmark name → Case[] loaded from its on-disk dataset.
// This is the single seam the CLI's `--benchmark` flag consumes; new benchmarks
// (e.g. Harvey LAB, spec §13) register here and become runnable with no other
// changes to the runner or CLI.
import { join } from "node:path";
import type { Case } from "./types.ts";
import { loadCuadCases } from "./adapters/cuad.ts";
import { loadLabCases } from "./adapters/lab.ts";

export interface BenchmarkDef {
  name: string;
  /** Load the benchmark's cases given the repo root (paths are resolved here). */
  load(repoRoot: string): Case[];
}

const BENCHMARKS: Record<string, BenchmarkDef> = {
  cuad: {
    name: "cuad",
    load: (repoRoot: string): Case[] =>
      loadCuadCases(join(repoRoot, "layer/evals/datasets/cuad/fixtures.jsonl")),
  },
  lab: {
    name: "lab",
    load: (repoRoot: string): Case[] => loadLabCases(repoRoot),
  },
};

export function knownBenchmarks(): string[] {
  return Object.keys(BENCHMARKS);
}

export function loadBenchmark(name: string, repoRoot: string): Case[] {
  const def = BENCHMARKS[name];
  if (!def) {
    throw new Error(`Unknown benchmark: ${name}. Known: ${knownBenchmarks().join(", ")}`);
  }
  return def.load(repoRoot);
}
