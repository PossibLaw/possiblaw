// eval-harness/src/types.ts
export type GradingMode = "deterministic" | "rubric";
export type CheckType = "regex" | "contains" | "golden" | "schema";

export interface DeterministicCheck {
  id: string; type: CheckType;
  pattern?: string;      // regex
  value?: string;        // contains | golden
  threshold?: number;    // golden similarity pass threshold (default 0.8)
}
export interface RubricCriterion { id: string; prompt: string; }
export interface Grading {
  mode: GradingMode;
  checks?: DeterministicCheck[];
  rubric?: { judge_model: string; pass_rule: "all"; criteria: RubricCriterion[] };
}
export interface Case {
  slug: string;
  target: string;
  targetType: "agent" | "skill";
  project?: string;
  lane?: string;
  input_brief: string;
  documents: string[];
  grading: Grading;
  source: { kind: "local" | "benchmark" | "external"; name?: string };
  metadata?: Record<string, unknown>;
  body?: string;
}
