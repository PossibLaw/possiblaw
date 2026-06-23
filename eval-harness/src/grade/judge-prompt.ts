// eval-harness/src/grade/judge-prompt.ts
import type { RubricCriterion } from "../types.ts";

/**
 * Builds a strict judge prompt for a single rubric criterion.
 * The judge must respond with exactly PASS or FAIL on the first line,
 * followed by a one-sentence reason.
 */
export function buildJudgePrompt(output: string, criterion: RubricCriterion): string {
  return [
    "You are grading a legal work product against ONE criterion.",
    "Answer with exactly `PASS` or `FAIL` on the first line, then a one-sentence reason.",
    "",
    `Criterion: ${criterion.prompt}`,
    "",
    `Work product: ${output}`,
  ].join("\n");
}
