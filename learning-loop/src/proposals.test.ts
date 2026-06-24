import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  nextProposalId, parseProposals, serializeProposals,
  loadProposals, saveProposals, addProposal, setProposalStatus, writeOverlay,
} from "./proposals.ts";
import type { SkillEditProposal } from "./types.ts";

const p = (over: Partial<SkillEditProposal> = {}): SkillEditProposal => ({
  id: "SEP-20260623-001", createdAt: "2026-06-23T00:00:00Z",
  skillSlug: "legal-nda-playbook", sourceMatter: "POS-1", vendorFileId: "FILE1",
  observedChange: "added a Delaware governing-law clause",
  generalizedEdit: "default governing law to Delaware for sales NDAs unless specified",
  proposedOverlayBody: "# NDA Playbook\n\n- Default governing law: Delaware.\n",
  status: "pending", ...over,
});

test("nextProposalId increments per day", () => {
  assert.equal(nextProposalId([], "20260623"), "SEP-20260623-001");
  assert.equal(nextProposalId([p()], "20260623"), "SEP-20260623-002");
});

test("save then load round-trips", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ll-"));
  await saveProposals(dir, [p()]);
  assert.deepEqual(await loadProposals(dir), [p()]);
});

test("setProposalStatus rejects invalid transition", () => {
  const approved = setProposalStatus([p()], "SEP-20260623-001", "approved");
  assert.equal(approved[0].status, "approved");
  assert.throws(() => setProposalStatus(approved, "SEP-20260623-001", "pending"));
});

test("writeOverlay writes the body and archives a prior overlay", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ll-"));
  await writeOverlay(dir, "legal-nda-playbook", "v1 body\n");
  await writeOverlay(dir, "legal-nda-playbook", "v2 body\n");
  const cur = await readFile(join(dir, "skill-overlays", "legal-nda-playbook", "SKILL.md"), "utf8");
  const prev = await readFile(join(dir, "skill-overlays", "legal-nda-playbook", "SKILL.md.prev"), "utf8");
  assert.equal(cur, "v2 body\n");
  assert.equal(prev, "v1 body\n");
});
