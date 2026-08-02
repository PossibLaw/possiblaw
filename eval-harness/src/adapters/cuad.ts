// eval-harness/src/adapters/cuad.ts
// Maps CUAD fixtures.jsonl → Case[]
// CUAD fixture schema: { id, text, question, gold_label, gold_spans }
// Maps: id → slug, question → extraction instruction in input_brief,
// text → document, gold_label → golden check value
//
// The fixture `question` is a bare CUAD category name ("Governing Law").
// buildAgentPrompt sends input_brief verbatim, so the adapter must wrap the
// category in an explicit span-extraction instruction — without it the model
// answers in prose and tokenF1 collapses (0.07 mean observed 2026-08-02 vs
// 0.58 historical with an instructed prompt).
//
// Wired into the runner/CLI via `./bin/eval run --benchmark cuad`.
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
      input_brief:
        `Extract the exact contiguous span of text from the document below that ` +
        `answers the CUAD category "${row.question}". Return ONLY the span, ` +
        `verbatim from the document — no explanation, no preamble, no quotation ` +
        `marks. If no such span exists, return an empty response.`,
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
