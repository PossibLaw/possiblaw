// eval-harness/src/adapters/lab.ts
// Maps the curated Harvey LAB manifest → Case[]. Tasks + rubric come from the
// pinned harvey-lab/ submodule, UNMODIFIED. See spec §4 / plan Spike Receipts.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import type { Case } from "../types.ts";

interface LabCriterion {
  id: string; title: string; match_criteria: string;
  deliverables?: string[]; sources?: string[];
}
interface LabTaskJson {
  title: string; work_type: string; instructions: string;
  deliverables: Record<string, string>; criteria: LabCriterion[]; tags?: string[];
}
interface ManifestEntry { task: string; work_type?: string; arm_a_agent?: string; note?: string; }
interface LabManifest { included: ManifestEntry[]; excluded?: Array<{ task: string; reason: string }>; }

const JUDGE_MODEL = "claude-sonnet-4-6";

export function loadLabCases(repoRoot: string): Case[] {
  const manifestPath = join(repoRoot, "layer/evals/datasets/lab/lab-manifest.yaml");
  const manifest = parseYaml(readFileSync(manifestPath, "utf-8")) as LabManifest;
  return (manifest.included ?? []).map((entry): Case => {
    const taskJsonPath = join(repoRoot, "harvey-lab/tasks", entry.task, "task.json");
    const t = JSON.parse(readFileSync(taskJsonPath, "utf-8")) as LabTaskJson;
    return {
      slug: entry.task,
      target: entry.arm_a_agent ?? "chief-counsel",
      targetType: "agent",
      input_brief: t.instructions,
      documents: [], // populated at run time by the extractor (orchestration-eval)
      grading: {
        mode: "rubric",
        rubric: {
          judge_model: JUDGE_MODEL,
          pass_rule: "all",
          criteria: t.criteria.map(c => ({ id: c.id, prompt: c.match_criteria })),
        },
      },
      source: { kind: "benchmark", name: "lab" },
      metadata: {
        work_type: entry.work_type ?? t.work_type,
        arm_a_agent: entry.arm_a_agent ?? null,
        deliverables: t.deliverables,
        criteria_raw: t.criteria, // keep deliverables[] per criterion for the runner/judge
        task_path: entry.task,
      },
    };
  });
}
