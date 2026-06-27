import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadLabCases } from "./lab.ts";

function fixtureRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "lab-"));
  // a fixture LAB task under harvey-lab/tasks/<area>/<slug>/task.json
  const taskDir = join(root, "harvey-lab/tasks/contracts/redflag-memo");
  mkdirSync(taskDir, { recursive: true });
  writeFileSync(join(taskDir, "task.json"), JSON.stringify({
    title: "Red-flag memo",
    work_type: "review",
    instructions: "Review the contract and produce red-flag-memo.docx.",
    deliverables: { "red-flag-memo.docx": "red-flag-memo.docx" },
    criteria: [
      { id: "C-001", title: "Flags change-of-control", match_criteria: "PASS if it flags the change-of-control consent.", deliverables: ["red-flag-memo.docx"] },
    ],
  }));
  // manifest
  const manifestDir = join(root, "layer/evals/datasets/lab");
  mkdirSync(manifestDir, { recursive: true });
  writeFileSync(join(manifestDir, "lab-manifest.yaml"),
    "schema: possiblaw/lab-manifest/v1\nincluded:\n  - task: contracts/redflag-memo\n    work_type: review\n    arm_a_agent: commercial-lead\nexcluded: []\n");
  return root;
}

test("loadLabCases maps a manifest task.json into a rubric Case", () => {
  const root = fixtureRoot();
  const cases = loadLabCases(root);
  assert.equal(cases.length, 1);
  const c = cases[0];
  assert.equal(c.slug, "contracts/redflag-memo");
  assert.equal(c.input_brief.includes("red-flag-memo.docx"), true);
  assert.equal(c.grading.mode, "rubric");
  assert.equal(c.grading.rubric?.pass_rule, "all");
  assert.equal(c.grading.rubric?.judge_model, "claude-sonnet-4-6");
  assert.equal(c.grading.rubric?.criteria.length, 1);
  assert.equal(c.metadata?.work_type, "review");
  assert.equal((c.metadata as any)?.arm_a_agent, "commercial-lead");
  assert.deepEqual((c.metadata as any)?.deliverables, { "red-flag-memo.docx": "red-flag-memo.docx" });
  assert.equal(c.source.name, "lab");
});
