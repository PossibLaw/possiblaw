import { test } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import { ReceiptChain } from "../receipts.ts";
import { CitationRegistry } from "./citation-registry.ts";
import { documentSha256 } from "../citations.ts";

function freshChain(): ReceiptChain {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gate-receipts-test-"));
  return new ReceiptChain(path.join(dir, "receipts.jsonl"));
}

const DOC = `We rely on Roe v. Wade, 410 U.S. 113, 116 (1973), which held that “the right of personal privacy includes the abortion decision”.`;
const GOOD_ROWS = [{
  citation: "Roe v. Wade, 410 U.S. 113, 116 (1973)",
  match: "Yes",
  quoted: "the right of personal privacy includes the abortion decision",
  sourcePassage: "We therefore conclude that the right of personal privacy includes the abortion decision, but that this right is not unqualified.",
}];

test("happy registration: coverage + all-Yes + quote fidelity → registered", () => {
  const chain = freshChain();
  const reg = new CitationRegistry(chain);
  const r = reg.register({ document: DOC, rows: GOOD_ROWS, meta: { agentId: "checker-1", issueId: "POS-9" } });
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.documentSha256, documentSha256(DOC));
    assert.equal(r.citationCount, 1);
  }
  assert.equal(reg.has(documentSha256(DOC)), true);
  const last = chain.entries().at(-1)!;
  assert.equal(last.body.kind, "quality");
  assert.equal(last.body.outcome, "performed");
});

test("coverage gap: document cites something no row covers → rejected", () => {
  const reg = new CitationRegistry(freshChain());
  const doc = DOC + " See also Miranda v. Arizona, 384 U.S. 436 (1966).";
  const r = reg.register({ document: doc, rows: GOOD_ROWS, meta: {} });
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.equal(r.reason, "coverage_gap");
    assert.deepEqual(r.details, ["384 U.S. 436"]);
  }
  assert.equal(reg.has(documentSha256(doc)), false);
});

test("spacing variance between document and row does not break coverage", () => {
  const reg = new CitationRegistry(freshChain());
  const doc = "Our holding follows 410 U. S. 113."; // spaced official form in the doc
  const r = reg.register({
    document: doc,
    rows: [{ citation: "Roe v. Wade, 410 U.S. 113 (1973)", match: "Yes" }], // compact form in the row
    meta: {},
  });
  assert.equal(r.ok, true);
});

test("non-Yes row → rejected unverified_rows", () => {
  const reg = new CitationRegistry(freshChain());
  const rows = [{ ...GOOD_ROWS[0], match: "Partial" }];
  const r = reg.register({ document: DOC, rows, meta: {} });
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.reason, "unverified_rows");
});

test("quote not verbatim in claimed source passage → rejected quote_mismatch", () => {
  const reg = new CitationRegistry(freshChain());
  const rows = [{ ...GOOD_ROWS[0], sourcePassage: "an entirely different passage" }];
  const r = reg.register({ document: DOC, rows, meta: {} });
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.reason, "quote_mismatch");
});

test("quoted set but sourcePassage missing → quote_mismatch (fail-closed)", () => {
  const reg = new CitationRegistry(freshChain());
  const rows = [{ citation: GOOD_ROWS[0].citation, match: "Yes", quoted: "anything" }];
  const r = reg.register({ document: DOC, rows, meta: {} });
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.reason, "quote_mismatch");
});

test("failed registration appends a blocked quality receipt with counts only", () => {
  const chain = freshChain();
  const reg = new CitationRegistry(chain);
  reg.register({ document: DOC, rows: [{ ...GOOD_ROWS[0], match: "No" }], meta: { agentId: "checker-1" } });
  const last = chain.entries().at(-1)!;
  assert.equal(last.body.outcome, "blocked");
  assert.equal(JSON.stringify(last.body).includes("Roe"), false); // no payload text in receipts
});

test("rebuild from chain: a new registry over the same chain still has() the sha", () => {
  const chain = freshChain();
  new CitationRegistry(chain).register({ document: DOC, rows: GOOD_ROWS, meta: {} });
  const rebuilt = new CitationRegistry(chain);
  assert.equal(rebuilt.has(documentSha256(DOC)), true);
});

test("row cap: more than 500 rows → throws", () => {
  const reg = new CitationRegistry(freshChain());
  const rows = Array.from({ length: 501 }, () => GOOD_ROWS[0]);
  assert.throws(() => reg.register({ document: DOC, rows, meta: {} }));
});

test("zero-citation document registers trivially (citationCount 0)", () => {
  const reg = new CitationRegistry(freshChain());
  const r = reg.register({ document: "No citations here at all.", rows: [], meta: {} });
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.citationCount, 0);
});
