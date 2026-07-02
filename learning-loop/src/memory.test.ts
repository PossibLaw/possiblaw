import { test } from "node:test";
import assert from "node:assert/strict";
import { appendLesson, sameTopic, renderHotMemory, normalizeText } from "./memory.ts";
import type { Lesson } from "./types.ts";

const mk = (id: string, text: string, topic = "nda", status: Lesson["status"] = "accepted"): Lesson => ({
  id, createdAt: `2026-06-23T00:00:${id.slice(-2)}.000Z`, text, topic, status, sources: [{ matterId: id, feedback: "f" }],
});

test("appendLesson dedupes by normalized text", () => {
  const a = appendLesson([], mk("01", "Cap indemnity at fees paid."));
  assert.equal(a.action, "added");
  const b = appendLesson(a.lessons, mk("02", "  cap   INDEMNITY at fees paid.  "));
  assert.equal(b.action, "duplicate");
  assert.equal(b.lessons.length, 1);
});

test("sameTopic returns accepted lessons for a topic", () => {
  const lessons = [mk("01", "a", "nda"), mk("02", "b", "msa"), mk("03", "c", "nda", "pending")];
  assert.equal(sameTopic(lessons, "nda").length, 1);
});

test("renderHotMemory enforces the line cap and overflows the rest", () => {
  const lessons = [mk("01", "one"), mk("02", "two"), mk("03", "three")];
  const { hot, overflow } = renderHotMemory(lessons, { maxLines: 6 });
  assert.ok(hot.split("\n").length <= 6);
  assert.ok(overflow.length >= 1);
});

test("normalizeText collapses whitespace and case", () => {
  assert.equal(normalizeText("  Foo   BAR "), "foo bar");
});

// --- Render-time ethical wall (Fix 2) ---

test("renderHotMemory excludes a now-contaminated lesson and flags it visibly", () => {
  // Lesson A was clean when accepted (no entity in scope then).
  const a = mk("01", "Zenith prefers arbitration in New York.");
  // Lesson B (added later) introduces the entity into the ledger's known set.
  const b: Lesson = { ...mk("02", "Prefer arbitration clauses generally."), entities: ["Zenith Corp"] };
  const { hot, overflow, excluded } = renderHotMemory([a, b]);
  assert.equal(excluded.length, 1);
  assert.equal(excluded[0].id, "01");
  assert.ok(hot.includes("<!-- excluded: 1 lessons failed sanitization -->"));
  assert.ok(!hot.includes("Zenith prefers"), "excluded lesson text must not leak into HOT body");
  assert.ok(hot.includes("Prefer arbitration clauses"), "clean lesson still rendered");
  assert.equal(overflow.length, 0);
});

test("renderHotMemory renders a clean lesson unchanged with no marker", () => {
  const a: Lesson = { ...mk("01", "Cap indemnity at fees paid."), entities: ["Globex Corp"] };
  const { hot, excluded } = renderHotMemory([a]);
  assert.equal(excluded.length, 0);
  assert.ok(!hot.includes("excluded:"));
  assert.ok(hot.includes("Cap indemnity at fees paid."));
});
