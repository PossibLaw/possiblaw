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

test("approve-edit --overlay-file with contaminated body returns exit 2 and writes nothing", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ll-"));
  // Step 1: propose-edit with a CLEAN overlay file.
  const cleanOverlay = join(dir, "clean.md");
  await writeFile(cleanOverlay, "# NDA\n- Default governing law: Delaware.\n", "utf8");
  const add = await run([
    "propose-edit", "--business", dir, "--skill", "legal-nda-playbook", "--matter", "POS-1",
    "--file-id", "F1", "--observed", "lawyer added a Delaware governing-law clause",
    "--edit", "default governing law to Delaware unless specified", "--overlay-file", cleanOverlay,
  ]);
  assert.equal(add.code, 0);
  const id = add.stdout.trim();
  assert.match(id, /^SEP-\d{8}-\d{3}$/);

  // Step 2: write a CONTAMINATED overlay file (contains client entity name).
  const badOverlay = join(dir, "bad.md");
  await writeFile(badOverlay, "# NDA\n- ACME Inc. requires Delaware law.\n", "utf8");

  // Step 3: approve-edit with the contaminated file + matching --entity flag — must be rejected.
  const r = await run([
    "approve-edit", "--business", dir, "--id", id,
    "--overlay-file", badOverlay, "--entity", "ACME Inc.",
  ]);
  assert.equal(r.code, 2);
  assert.match(r.stdout, /violations/);

  // Step 4: overlay file must NOT have been written.
  const overlayPath = join(dir, "skill-overlays", "legal-nda-playbook", "SKILL.md");
  let written = false;
  try {
    await rf(overlayPath, "utf8");
    written = true;
  } catch {
    written = false;
  }
  assert.equal(written, false, "overlay file must not be written on sanitizer rejection");

  // Step 5: proposal status must still be "pending".
  const props = await loadProposals(dir);
  assert.equal(props.find((p) => p.id === id)?.status, "pending");
});

// --- Re-sanitize at accept (Fix 1) ---

test("accept re-runs the wall against ledger-known entities and fails closed to pending", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ll-cli-"));
  // Lesson 1 is clean at propose time (Zenith is not yet a known entity).
  const p1 = await run([
    "propose", "--business", dir, "--topic", "arb", "--matter", "POS-1",
    "--text", "Zenith prefers arbitration in New York.",
  ]);
  assert.equal(p1.code, 0);
  const id1 = p1.stdout.trim();
  // Lesson 2 introduces "Zenith Corp" into the ledger via --entity (its own text is clean).
  const p2 = await run([
    "propose", "--business", dir, "--topic", "arb", "--matter", "POS-2",
    "--text", "Prefer arbitration clauses generally.", "--entity", "Zenith Corp",
  ]);
  assert.equal(p2.code, 0);
  // Accepting lesson 1 must now fail closed: union of ledger entities includes Zenith Corp.
  const a = await run(["accept", "--business", dir, "--id", id1]);
  assert.equal(a.code, 2);
  assert.ok(a.stdout.includes("violations"));
  // No client name echoed in the failure output.
  assert.ok(!a.stdout.includes("Zenith"));
  // Lesson 1 stays pending with a recorded, auditable reason.
  const { loadStore } = await import("./store.ts");
  const led = await loadStore(dir);
  const l1 = led.find((l) => l.id === id1)!;
  assert.equal(l1.status, "pending");
  assert.ok(Array.isArray(l1.sanitizeBlockReasons) && l1.sanitizeBlockReasons.length > 0);
  assert.ok(typeof l1.sanitizeBlockedAt === "string");
});

test("accept passes a genuinely clean lesson and it renders unchanged", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ll-cli-"));
  const p = await run([
    "propose", "--business", dir, "--topic", "nda", "--matter", "POS-1",
    "--text", "Cap indemnity at fees paid.",
  ]);
  const id = p.stdout.trim();
  const a = await run(["accept", "--business", dir, "--id", id]);
  assert.equal(a.code, 0);
  const hot = await rf(join(dir, "memory", "firm-memory.md"), "utf8");
  assert.ok(hot.includes("Cap indemnity at fees paid."));
  assert.ok(!hot.includes("excluded:"));
});

// --- Entity source hardening (Fix 4) ---

test("propose --entities-file rejects a leaked party and records the source", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ll-cli-"));
  const ents = join(dir, "parties.txt");
  await writeFile(ents, "ACME Inc.\nGlobex Corp\n", "utf8");
  const bad = await run([
    "propose", "--business", dir, "--topic", "nda", "--matter", "POS-1",
    "--text", "ACME wants a 2y term", "--entities-file", ents,
  ]);
  assert.equal(bad.code, 2);
  assert.ok(bad.stdout.includes("violations"));

  const good = await run([
    "propose", "--business", dir, "--topic", "nda", "--matter", "POS-1",
    "--text", "Prefer a mutual NDA structure.", "--entities-file", ents,
  ]);
  assert.equal(good.code, 0);
  const { loadStore } = await import("./store.ts");
  const led = await loadStore(dir);
  const l = led.find((x) => x.id === good.stdout.trim())!;
  assert.equal(l.entitySource, "file");
  assert.ok((l.entities ?? []).includes("ACME Inc."));
});

// --- check-memory CLI (Fix 3) ---

test("check-memory returns exit 0 on a clean file", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ll-cli-"));
  const mem = join(dir, "firm-memory.md");
  await writeFile(mem, "# Firm Memory\n- Prefer mutual NDAs.\n- Cap indemnity at fees paid.\n", "utf8");
  const r = await run(["check-memory", mem]);
  assert.equal(r.code, 0);
});

test("check-memory flags PII line numbers without echoing content", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ll-cli-"));
  const mem = join(dir, "firm-memory.md");
  await writeFile(mem, "# Firm Memory\n- Prefer mutual NDAs.\n- Send drafts to jane@acme.com first.\n", "utf8");
  const r = await run(["check-memory", mem]);
  assert.equal(r.code, 1);
  assert.match(r.stdout, /"line":\s*3/);
  assert.match(r.stdout, /pattern:email/);
  // No content echo: neither the email nor the line text may appear.
  assert.ok(!r.stdout.includes("jane@acme.com"));
  assert.ok(!r.stdout.includes("Send drafts"));
});

test("check-memory --business catches a ledger-known entity edited directly into memory", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ll-cli-"));
  // Seed the ledger with the entity via a clean proposal.
  await run([
    "propose", "--business", dir, "--topic", "nda", "--matter", "POS-1",
    "--text", "Prefer mutual NDAs.", "--entity", "ACME Inc.",
  ]);
  // Operator directly edits firm-memory.md with a client name + email.
  const mem = join(dir, "memory", "firm-memory.md");
  await writeFile(mem, "# Firm Memory\n- ACME always wants a 2y term.\n- Contact jane@acme.com.\n", "utf8");
  const r = await run(["check-memory", mem, "--business", dir]);
  assert.equal(r.code, 1);
  assert.match(r.stdout, /"line":\s*2/);
  assert.match(r.stdout, /"line":\s*3/);
  // Entity name must be redacted to a reason code, never echoed.
  assert.ok(!r.stdout.includes("ACME"));
  assert.ok(!r.stdout.includes("jane@acme.com"));
});
