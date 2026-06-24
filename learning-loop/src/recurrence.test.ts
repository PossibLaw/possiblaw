import { test } from "node:test";
import assert from "node:assert/strict";
import { topicsAtThreshold, distinctMattersByTopic } from "./recurrence.ts";
import type { Lesson } from "./types.ts";

const mk = (id: string, topic: string, matter: string): Lesson => ({
  id, createdAt: "2026-06-23T00:00:00.000Z", text: id, topic, status: "accepted",
  sources: [{ matterId: matter, feedback: "f" }],
});

test("topicsAtThreshold counts distinct matters, not lessons", () => {
  const lessons = [
    mk("1", "nda", "POS-1"), mk("2", "nda", "POS-2"), mk("3", "nda", "POS-3"),
    mk("4", "msa", "POS-9"),
  ];
  assert.deepEqual(topicsAtThreshold(lessons, 3), ["nda"]);
});

test("the same matter repeated does not reach the threshold", () => {
  const lessons = [mk("1", "nda", "POS-1"), mk("2", "nda", "POS-1"), mk("3", "nda", "POS-1")];
  assert.equal(distinctMattersByTopic(lessons).get("nda"), 1);
  assert.deepEqual(topicsAtThreshold(lessons, 3), []);
});
