import { test } from "node:test";
import assert from "node:assert/strict";
import { hashText, diffLines } from "./diff.ts";

test("hashText is stable and differs on change", () => {
  assert.equal(hashText("a"), hashText("a"));
  assert.notEqual(hashText("a"), hashText("b"));
});

test("identical content => not changed, empty diff", () => {
  const d = diffLines("line one\nline two\n", "line one\nline two\n");
  assert.equal(d.changed, false);
  assert.deepEqual(d.added, []);
  assert.deepEqual(d.removed, []);
});

test("whitespace-only difference is not a change", () => {
  const d = diffLines("a\nb", "a \n b ");
  assert.equal(d.changed, false);
});

test("added line is reported", () => {
  const d = diffLines("a\nb", "a\nb\ngoverning law: Delaware");
  assert.equal(d.changed, true);
  assert.deepEqual(d.added, ["governing law: Delaware"]);
  assert.deepEqual(d.removed, []);
});

test("removed line is reported", () => {
  const d = diffLines("a\nb\nc", "a\nc");
  assert.equal(d.changed, true);
  assert.deepEqual(d.removed, ["b"]);
});
