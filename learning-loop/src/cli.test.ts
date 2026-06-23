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
