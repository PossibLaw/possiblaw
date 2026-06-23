// eval-harness/src/adapters/lab.ts
// Harvey LAB adapter stub — v1 interface only.
// See docs/superpowers/specs/2026-06-22-eval-harness-design.md §13 for future milestone.
import type { Case } from "../types.ts";

export interface BenchmarkAdapter {
  name: string;
  load(rootPath: string): Case[];
}

export const labAdapter: BenchmarkAdapter = {
  name: "lab",
  load(_rootPath: string): Case[] {
    throw new Error(
      "lab adapter not implemented (v1 stub); see docs/superpowers/specs/2026-06-22-eval-harness-design.md §13"
    );
  },
};
