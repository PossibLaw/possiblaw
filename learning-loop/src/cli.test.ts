import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { run } from "./cli.ts";

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
