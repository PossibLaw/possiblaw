import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadStore, saveStore } from "./store.ts";
import type { Lesson } from "./types.ts";

const mk = (id: string): Lesson => ({
  id, createdAt: "2026-06-23T00:00:00.000Z", text: `lesson ${id}`, topic: "nda",
  status: "accepted", sources: [{ matterId: id, feedback: "f" }],
});

test("save then load round-trips and writes the views", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ll-store-"));
  await saveStore(dir, [mk("LRN-20260623-001")]);
  const loaded = await loadStore(dir);
  assert.equal(loaded.length, 1);
  assert.equal(loaded[0].id, "LRN-20260623-001");
  const hot = await readFile(join(dir, "memory", "firm-memory.md"), "utf8");
  assert.ok(hot.includes("lesson LRN-20260623-001"));
  const md = await readFile(join(dir, "learnings", "ledger.md"), "utf8");
  assert.ok(md.includes("LRN-20260623-001"));
});

test("loadStore returns [] for a fresh dir", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ll-store-"));
  assert.deepEqual(await loadStore(dir), []);
});
