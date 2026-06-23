// eval-harness/src/cases/parse.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCase, CaseParseError } from "./parse.ts";

const DET = `---
slug: nda-gov-law
target: nda-drafter
targetType: agent
lane: drafting
input_brief: Draft a mutual NDA, Delaware law.
grading:
  mode: deterministic
  checks:
    - id: gov-law
      type: regex
      pattern: "(?i)State of Delaware"
source: { kind: local }
---
free text`;

test("parses a deterministic case with defaults", () => {
  const c = parseCase(DET, "fallback");
  assert.equal(c.slug, "nda-gov-law");
  assert.equal(c.targetType, "agent");
  assert.equal(c.grading.mode, "deterministic");
  assert.equal(c.grading.checks?.[0].type, "regex");
  assert.deepEqual(c.documents, []); // default
});

test("rejects a case missing required fields", () => {
  assert.throws(() => parseCase("---\nslug: x\n---", "fb"), CaseParseError);
});

test("rejects an unknown grading mode", () => {
  const bad = DET.replace("mode: deterministic", "mode: vibes");
  assert.throws(() => parseCase(bad, "fb"), CaseParseError);
});
