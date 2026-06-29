// gate-proxy/src/provenance/segments.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { segmentDocument } from "./segments.ts";
import { documentSha256 } from "../citations.ts";

test("splits paragraphs on blank lines with contiguous 0-based indices", () => {
  const doc = "First paragraph.\n\nSecond paragraph.\n\nThird paragraph.";
  const segs = segmentDocument(doc);
  assert.equal(segs.length, 3);
  assert.deepEqual(segs.map((s) => s.index), [0, 1, 2]);
  assert.deepEqual(segs.map((s) => s.text), [
    "First paragraph.",
    "Second paragraph.",
    "Third paragraph.",
  ]);
});

test("single paragraph yields one segment at index 0", () => {
  const segs = segmentDocument("Just one paragraph here.");
  assert.equal(segs.length, 1);
  assert.equal(segs[0].index, 0);
  assert.equal(segs[0].text, "Just one paragraph here.");
});

test("empty or whitespace-only document yields no segments", () => {
  assert.deepEqual(segmentDocument(""), []);
  assert.deepEqual(segmentDocument("   \n\n  \t  \n"), []);
});

test("collapses multiple consecutive blank lines without emitting empty segments", () => {
  const doc = "Alpha.\n\n\n\nBravo.";
  const segs = segmentDocument(doc);
  assert.equal(segs.length, 2);
  assert.deepEqual(segs.map((s) => s.text), ["Alpha.", "Bravo."]);
});

test("ignores leading and trailing blank lines and keeps indices starting at 0", () => {
  const doc = "\n\n  \nLead paragraph.\n\nTail paragraph.\n\n\n";
  const segs = segmentDocument(doc);
  assert.deepEqual(segs.map((s) => s.index), [0, 1]);
  assert.deepEqual(segs.map((s) => s.text), ["Lead paragraph.", "Tail paragraph."]);
});

test("identical paragraph text yields the same sha256 but distinct indices", () => {
  const doc = "Boilerplate clause.\n\nUnique middle.\n\nBoilerplate clause.";
  const segs = segmentDocument(doc);
  assert.equal(segs.length, 3);
  assert.equal(segs[0].sha256, segs[2].sha256);
  assert.notEqual(segs[0].index, segs[2].index);
});

test("segment sha256 aligns with documentSha256 so quote/citation checks compare consistently", () => {
  const para = "The court held that the statute applies.";
  const segs = segmentDocument(`Intro.\n\n${para}`);
  assert.equal(segs[1].sha256, documentSha256(para));
});

test("normalizes line endings: CRLF paragraphs split the same as LF", () => {
  const segs = segmentDocument("One.\r\n\r\nTwo.");
  assert.deepEqual(segs.map((s) => s.text), ["One.", "Two."]);
});

test("is deterministic: same input produces identical output", () => {
  const doc = "P one.\n\nP two.\n\nP three.";
  assert.deepEqual(segmentDocument(doc), segmentDocument(doc));
});
