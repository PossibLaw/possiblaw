import { test } from "node:test";
import assert from "node:assert/strict";
import { nextLessonId, serializeLedger, parseLedger, setStatus, renderLedgerMarkdown } from "./ledger.ts";
import type { Lesson } from "./types.ts";

const mk = (id: string, status: Lesson["status"] = "pending"): Lesson => ({
  id, createdAt: "2026-06-23T00:00:00.000Z", text: "x", topic: "nda", status, sources: [],
});

test("nextLessonId increments within a date", () => {
  assert.equal(nextLessonId([], "20260623"), "LRN-20260623-001");
  assert.equal(nextLessonId([mk("LRN-20260623-001")], "20260623"), "LRN-20260623-002");
});

test("serialize/parse round-trips", () => {
  const lessons = [mk("LRN-20260623-001", "accepted")];
  assert.deepEqual(parseLedger(serializeLedger(lessons)), lessons);
});

test("setStatus enforces valid transitions", () => {
  const out = setStatus([mk("LRN-20260623-001", "pending")], "LRN-20260623-001", "accepted");
  assert.equal(out[0].status, "accepted");
  assert.throws(() => setStatus([mk("LRN-20260623-001", "rejected")], "LRN-20260623-001", "accepted"));
});

test("renderLedgerMarkdown names each lesson id", () => {
  assert.ok(renderLedgerMarkdown([mk("LRN-20260623-001")]).includes("LRN-20260623-001"));
});
