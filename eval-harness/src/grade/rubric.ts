// eval-harness/src/grade/rubric.ts
import type { Grading, RubricCriterion } from "../types.ts";
import type { ModelClient, ResolvedModel } from "../model-client/types.ts";
import { buildJudgePrompt } from "./judge-prompt.ts";

export interface CriterionVerdict {
  id: string;
  pass: boolean;
  raw: string;
}

/**
 * Parses a judge response into a boolean verdict.
 * Returns true only if the first line contains PASS (case-insensitive)
 * and does not contain FAIL.
 */
export function parseVerdict(raw: string): boolean {
  const firstLine = raw.split("\n")[0] ?? "";
  return /\bpass\b/i.test(firstLine) && !/\bfail\b/i.test(firstLine);
}

/**
 * Runs an all-pass LLM-judge rubric against the given output.
 * For each criterion, invokes the judge model and parses the verdict.
 * If a model call is skipped, the criterion is treated as failing.
 */
export async function runRubric(
  output: string,
  rubric: NonNullable<Grading["rubric"]>,
  judge: ModelClient,
  resolveJudge: (lane: string) => ResolvedModel,
  subjectModel: ResolvedModel,
): Promise<{ score: number; pass: boolean; verdicts: CriterionVerdict[]; judgeIsSubject: boolean }> {
  const judgeModel = resolveJudge(rubric.judge_model);
  // Flag when the judge is effectively the model under test. Compare the full
  // (adapterType, model) pair so a shared model name across adapter families
  // is not mistaken for a self-judge, and vice versa.
  const judgeIsSubject =
    judgeModel.model === subjectModel.model && judgeModel.adapterType === subjectModel.adapterType;

  const verdicts: CriterionVerdict[] = [];
  for (const criterion of rubric.criteria) {
    const prompt = buildJudgePrompt(output, criterion);
    const result = await judge.run(prompt, judgeModel);
    if (!result.ok) {
      // Skipped — treat as fail
      verdicts.push({ id: criterion.id, pass: false, raw: result.reason });
    } else {
      const pass = parseVerdict(result.output);
      verdicts.push({ id: criterion.id, pass, raw: result.output });
    }
  }

  const passCount = verdicts.filter(v => v.pass).length;
  const total = verdicts.length;
  const pass = verdicts.every(v => v.pass); // pass_rule: "all"
  const score = total > 0 ? passCount / total : 1;

  return { score, pass, verdicts, judgeIsSubject };
}
