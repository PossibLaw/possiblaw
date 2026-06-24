import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { run } from "./cli.ts";
import { loadManifest } from "./manifest.ts";
import { hashText } from "./diff.ts";
import { loadProposals } from "./proposals.ts";
import { readFile as rf } from "node:fs/promises";

test("propose rejects a client-fact-laden lesson with exit 2", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ll-cli-"));
  const r = await run([
    "propose", "--business", dir, "--topic", "nda", "--matter", "POS-1",
    "--feedback", "lawyer note", "--text", "ACME wants a 2y term", "--entity", "ACME Inc.",
  ]);
  assert.equal(r.code, 2);
  assert.ok(r.stdout.includes("violations"));
});

test("propose then accept stores an accepted lesson", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ll-cli-"));
  const p = await run([
    "propose", "--business", dir, "--topic", "nda", "--matter", "POS-1",
    "--feedback", "lawyer note", "--text", "Cap indemnity at fees paid.",
  ]);
  assert.equal(p.code, 0);
  const id = p.stdout.trim();
  assert.ok(id.startsWith("LRN-"));
  const a = await run(["accept", "--business", dir, "--id", id]);
  assert.equal(a.code, 0);
  const rec = await run(["recurring", "--business", dir, "--n", "1"]);
  assert.ok(rec.stdout.includes("nda"));
});

test("double-accept returns code 1 instead of throwing", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ll-cli-"));
  const p = await run([
    "propose", "--business", dir, "--topic", "nda", "--matter", "POS-1",
    "--text", "Cap indemnity at fees paid.",
  ]);
  assert.equal(p.code, 0);
  const id = p.stdout.trim();
  const a1 = await run(["accept", "--business", dir, "--id", id]);
  assert.equal(a1.code, 0);
  const a2 = await run(["accept", "--business", dir, "--id", id]);
  assert.equal(a2.code, 1);
});

test("accept on unknown id returns code 1 with 'unknown id'", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ll-cli-"));
  const r = await run(["accept", "--business", dir, "--id", "LRN-99999999-001"]);
  assert.equal(r.code, 1);
  assert.ok(r.stdout.includes("unknown id"));
});

test("propose with blank --text returns code 1 'empty lesson text' and writes no ledger entry", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ll-cli-"));
  const r = await run([
    "propose", "--business", dir, "--matter", "POS-1", "--text", "   ",
  ]);
  assert.equal(r.code, 1);
  assert.ok(r.stdout.includes("empty lesson text"));
  // no store file should have been created
  const { readdir } = await import("node:fs/promises");
  const files = await readdir(dir).catch(() => []);
  assert.equal(files.length, 0);
});

test("propose with no --matter returns code 1 'missing --matter'", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ll-cli-"));
  const r = await run([
    "propose", "--business", dir, "--text", "Cap indemnity at fees paid.",
  ]);
  assert.equal(r.code, 1);
  assert.ok(r.stdout.includes("missing --matter"));
});

test("manifest-add records a delivery with the draft hash", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ll-"));
  const draft = join(dir, "draft.md");
  await writeFile(draft, "DRAFT BODY\n", "utf8");
  const r = await run([
    "manifest-add", "--business", dir, "--file-id", "FILE1", "--kind", "gdrive",
    "--matter", "POS-1", "--agent", "ag1", "--skill", "legal-nda-playbook", "--draft-path", draft,
  ]);
  assert.equal(r.code, 0);
  const m = await loadManifest(dir);
  assert.equal(m.length, 1);
  assert.equal(m[0].vendorFileId, "FILE1");
  assert.equal(m[0].draftHash, hashText("DRAFT BODY\n"));
});

test("manifest-pending lists records; manifest-mark sets lastProcessedHash", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ll-"));
  const draft = join(dir, "draft.md");
  await writeFile(draft, "X\n", "utf8");
  await run(["manifest-add", "--business", dir, "--file-id", "F", "--kind", "gdrive",
    "--matter", "P-1", "--agent", "a", "--skill", "s", "--draft-path", draft]);
  const pend = await run(["manifest-pending", "--business", dir]);
  assert.equal(pend.code, 0);
  assert.match(pend.stdout, /"vendorFileId":"F"/);
  const mark = await run(["manifest-mark", "--business", dir, "--file-id", "F", "--hash", "hZ"]);
  assert.equal(mark.code, 0);
  const m = await loadManifest(dir);
  assert.equal(m[0].lastProcessedHash, "hZ");
});

test("propose-edit sanitizer-rejects leaked entities at exit 2", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ll-"));
  const overlay = join(dir, "o.md");
  await writeFile(overlay, "# NDA\n- Default governing law: Delaware.\n", "utf8");
  const r = await run([
    "propose-edit", "--business", dir, "--skill", "legal-nda-playbook", "--matter", "POS-1",
    "--file-id", "F1", "--observed", "ACME Inc. wanted Delaware law",
    "--edit", "default to Delaware", "--overlay-file", overlay, "--entity", "ACME Inc.",
  ]);
  assert.equal(r.code, 2);
  assert.match(r.stdout, /violations/);
});

test("propose-edit then approve-edit writes the overlay", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ll-"));
  const overlay = join(dir, "o.md");
  await writeFile(overlay, "# NDA\n- Default governing law: Delaware.\n", "utf8");
  const add = await run([
    "propose-edit", "--business", dir, "--skill", "legal-nda-playbook", "--matter", "POS-1",
    "--file-id", "F1", "--observed", "lawyer added a Delaware governing-law clause",
    "--edit", "default governing law to Delaware unless specified", "--overlay-file", overlay,
  ]);
  assert.equal(add.code, 0);
  const id = add.stdout.trim();
  assert.match(id, /^SEP-\d{8}-\d{3}$/);

  const list = await run(["review-list", "--business", dir]);
  assert.match(list.stdout, new RegExp(id));

  const ok = await run(["approve-edit", "--business", dir, "--id", id]);
  assert.equal(ok.code, 0);
  const body = await rf(join(dir, "skill-overlays", "legal-nda-playbook", "SKILL.md"), "utf8");
  assert.match(body, /Delaware/);
  const props = await loadProposals(dir);
  assert.equal(props.find((p) => p.id === id)?.status, "approved");
});
