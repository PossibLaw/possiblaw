// gate-proxy/src/provenance/provenance.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildProvenance } from "./provenance.ts";
import { documentSha256 } from "../citations.ts";
import { segmentDocument } from "./segments.ts";

test("builds one provenance entry per segment, all unsourced in the baseline", () => {
  const doc = "First claim.\n\nSecond claim.\n\nThird claim.";
  const prov = buildProvenance(doc);
  assert.equal(prov.segmentCount, 3);
  assert.equal(prov.segments.length, 3);
  assert.deepEqual(prov.segments.map((s) => s.kind), ["unsourced", "unsourced", "unsourced"]);
});

test("each entry carries its segment index and segmentSha256 from segmentDocument", () => {
  const doc = "Alpha.\n\nBravo.";
  const segs = segmentDocument(doc);
  const prov = buildProvenance(doc);
  assert.deepEqual(prov.segments.map((s) => s.index), [0, 1]);
  assert.deepEqual(
    prov.segments.map((s) => s.segmentSha256),
    segs.map((s) => s.sha256),
  );
});

test("documentSha256 binds the whole document and matches citations.documentSha256", () => {
  const doc = "Only paragraph.";
  assert.equal(buildProvenance(doc).documentSha256, documentSha256(doc));
});

test("summary counts each kind; baseline is all unsourced", () => {
  const prov = buildProvenance("One.\n\nTwo.\n\nThree.\n\nFour.");
  assert.deepEqual(prov.summary, { sourced: 0, quoted: 0, unsourced: 4 });
});

test("empty document yields zero segments and a zeroed summary", () => {
  const prov = buildProvenance("");
  assert.equal(prov.segmentCount, 0);
  assert.deepEqual(prov.segments, []);
  assert.deepEqual(prov.summary, { sourced: 0, quoted: 0, unsourced: 0 });
  assert.equal(prov.documentSha256, documentSha256(""));
});

test("provenance entries never carry segment text (hash-only invariant)", () => {
  const prov = buildProvenance("Sensitive matter detail.\n\nMore detail.");
  for (const s of prov.segments) {
    assert.equal((s as unknown as Record<string, unknown>).text, undefined);
  }
});
