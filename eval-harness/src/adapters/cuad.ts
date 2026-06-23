// eval-harness/src/adapters/cuad.ts
// Maps CUAD fixtures.jsonl → Case[]
// CUAD fixture schema: { id, text, question, gold_label, gold_spans }
// Maps: id → slug, question → input_brief, text → document, gold_label → golden check value
//
// v1 STATUS: interface demonstration. This adapter proves the benchmark-adapter
// shape on real data but is not yet wired into the runner/CLI (no --benchmark path
// yet). The live CUAD-backed cases are the hand-authored markdown cases under
// companies/legal-operations/evals/cases/. See spec §3 (prove the interface) and §13.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Case } from "../types.ts";

interface CuadLine {
  id: string;
  text: string;
  question: string;
  gold_label: string;
  gold_spans: Array<{ start: number; end: number; text: string }>;
}

export function loadCuadCases(fixturesPath: string): Case[] {
  // Resolve relative to eval-harness/src/adapters/ (cwd when tests run is eval-harness/)
  const absolutePath = resolve(fixturesPath);
  const content = readFileSync(absolutePath, "utf-8");
  const lines = content.split("\n").filter(line => line.trim().length > 0);

  return lines.map((line): Case => {
    const row = JSON.parse(line) as CuadLine;
    return {
      slug: row.id,
      target: "clause-extractor",
      targetType: "agent",
      lane: "extractive",
      input_brief: row.question,
      documents: [row.text],
      grading: {
        mode: "deterministic",
        checks: [
          {
            id: `${row.id}-gold`,
            type: "golden",
            value: row.gold_label,
            threshold: 0.7,
          },
        ],
      },
      source: { kind: "benchmark", name: "cuad" },
      metadata: {
        gold_spans: row.gold_spans,
      },
    };
  });
}
