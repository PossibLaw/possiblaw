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
        `Extract the SHORTEST exact contiguous span of text from the document ` +
        `below that answers the CUAD category "${row.question}". Return ONLY ` +
        `the span, verbatim from the document — no explanation, no preamble, ` +
        `no quotation marks, and no surrounding sentence beyond the answer ` +
        `itself. If no such span exists, return an empty response.\n\n` +
        `Examples of correct extraction behavior (from other contracts, not ` +
        `this one):\n` +
        `- Category "Expiration Date"; document sentence "This Agreement ` +
        `expires on December 31, 2027, unless renewed." -> correct answer: ` +
        `"December 31, 2027" (not the whole sentence).\n` +
        `- Category "Notice Period To Terminate Renewal"; document sentence ` +
        `"Either party may opt out of renewal by giving sixty (60) days ` +
        `written notice before the renewal date." -> correct answer: ` +
        `"sixty (60) days written notice" (not the whole sentence).`,
      documents: [row.text],
      grading: {
        mode: "deterministic",
        // "NOT_FOUND" is CUAD's sentinel for "the document has no such
        // clause" — the correct model behavior is an empty response, so the
        // check is emptiness, never tokenF1 against the sentinel string.
        checks: [
          row.gold_label === "NOT_FOUND"
            ? { id: `${row.id}-gold`, type: "regex", pattern: "^\\s*$" }
            : {
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
