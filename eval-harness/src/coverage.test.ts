// eval-harness/src/coverage.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generateCoverage } from "./coverage.ts";

test("marks targets with a case as done, others as TODO", () => {
  const root = mkdtempSync(join(tmpdir(), "cov-"));
  for (const d of ["agents/nda-drafter", "agents/bd-lead", "skills/quick-counsel", "cases"]) {
    mkdirSync(join(root, d), { recursive: true });
  }
  writeFileSync(
    join(root, "cases/x.md"),
    "---\nslug: x\ntarget: nda-drafter\ntargetType: agent\ninput_brief: y\ngrading:\n  mode: deterministic\n  checks: []\nsource: { kind: local }\n---"
  );
  const md = generateCoverage(join(root, "agents"), join(root, "skills"), join(root, "cases"));
  // nda-drafter has a case → done
  assert.match(md, /nda-drafter.*(done|✅)/i);
  // bd-lead has no case → TODO
  assert.match(md, /bd-lead.*(TODO|⬜)/i);
});

test("reports parse errors inline", () => {
  const root = mkdtempSync(join(tmpdir(), "cov-err-"));
  mkdirSync(join(root, "agents/nda-drafter"), { recursive: true });
  mkdirSync(join(root, "skills"), { recursive: true });
  mkdirSync(join(root, "cases"), { recursive: true });
  // Write a broken case file
  writeFileSync(join(root, "cases/broken.md"), "not frontmatter at all");
  const md = generateCoverage(join(root, "agents"), join(root, "skills"), join(root, "cases"));
  // Should report the parse error
  assert.match(md, /broken\.md|parse error/i);
});

test("summary line reflects counts", () => {
  const root = mkdtempSync(join(tmpdir(), "cov-count-"));
  mkdirSync(join(root, "agents/agent-a"), { recursive: true });
  mkdirSync(join(root, "agents/agent-b"), { recursive: true });
  mkdirSync(join(root, "skills"), { recursive: true });
  mkdirSync(join(root, "cases"), { recursive: true });
  writeFileSync(
    join(root, "cases/a.md"),
    "---\nslug: a\ntarget: agent-a\ntargetType: agent\ninput_brief: test\ngrading:\n  mode: deterministic\n  checks: []\nsource: { kind: local }\n---"
  );
  const md = generateCoverage(join(root, "agents"), join(root, "skills"), join(root, "cases"));
  // 1 covered of 2 total
  assert.match(md, /1.*of.*2|1\/2/);
});
