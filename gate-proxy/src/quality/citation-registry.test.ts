import { test } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import { ReceiptChain, ReceiptChainCorruptError } from "../receipts.ts";
import { CitationRegistry } from "./citation-registry.ts";
import { documentSha256 } from "../citations.ts";
import { canonicalJson, sha256hex } from "../receipts.ts";

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

// ---------------------------------------------------------------------------
// S1 regression tests — Fix A (quote-document binding) + Fix B (per-row extraction)
// ---------------------------------------------------------------------------

test("S1 regression: one row cannot cover a different citation via substring bleed", () => {
  const reg = new CitationRegistry(freshChain());
  const r = reg.register({
    document: "cite 410 U.S. 113 and 10 U.S. 11",
    rows: [{ citation: "Roe v. Wade, 410 U.S. 113 (1973)", match: "Yes" }],
    meta: {},
  });
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.equal(r.reason, "coverage_gap");
    assert.deepEqual(r.details, ["10 U.S. 11"]);
  }
});

test("S1 regression: crafted row '1410 U.S. 1131' does not cover '410 U.S. 113'", () => {
  const reg = new CitationRegistry(freshChain());
  const r = reg.register({
    document: "See 410 U.S. 113.",
    rows: [{ citation: "1410 U.S. 1131", match: "Yes" }],
    meta: {},
  });
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.reason, "coverage_gap");
});

test("S1 regression: fabricated quote absent from the document is rejected", () => {
  const reg = new CitationRegistry(freshChain());
  const r = reg.register({
    document: "See 410 U.S. 113. We argue accordingly.",
    rows: [{
      citation: "Roe v. Wade, 410 U.S. 113 (1973)",
      match: "Yes",
      quoted: "a fabricated holding never in the document",
      sourcePassage: "text containing a fabricated holding never in the document, self-consistently",
    }],
    meta: {},
  });
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.reason, "quote_mismatch");
});

test("no-quote attestation registers with quotedRowCount 0 (documented honesty floor)", () => {
  const chain = freshChain();
  const reg = new CitationRegistry(chain);
  const r = reg.register({
    document: "See 410 U.S. 113.",
    rows: [{ citation: "Roe v. Wade, 410 U.S. 113 (1973)", match: "Yes" }],
    meta: {},
  });
  assert.equal(r.ok, true);
  assert.equal(chain.entries().at(-1)!.body.meta!["quotedRowCount"], 0);
});

// ---------------------------------------------------------------------------
// Hardening C — verify chain integrity at construction
// ---------------------------------------------------------------------------

test("Hardening C: corrupt chain — constructor succeeds, has() returns false, register() throws ReceiptChainCorruptError", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gate-receipts-c-"));
  const filePath = path.join(dir, "receipts.jsonl");
  const chain = new ReceiptChain(filePath);

  // Build a valid chain with a performed entry so reg1 adds a sha to the verified set
  const reg1 = new CitationRegistry(chain);
  const testDoc = "See 410 U.S. 113.";
  reg1.register({
    document: testDoc,
    rows: [{ citation: "Roe v. Wade, 410 U.S. 113 (1973)", match: "Yes" }],
    meta: {},
  });
  const testSha = documentSha256(testDoc);

  // Tamper the first line body — leave the stored hash intact, so verify() fails
  const lines = fs.readFileSync(filePath, "utf8").split("\n").filter(Boolean);
  if (lines.length >= 1) {
    const entry = JSON.parse(lines[0]) as import("../receipts.ts").ReceiptEntry;
    entry.body.outcome = entry.body.outcome === "performed" ? "blocked" : "performed";
    lines[0] = JSON.stringify(entry);
    fs.writeFileSync(filePath, lines.join("\n") + "\n");
  }

  // Phase 1 posture: constructor must NOT throw — proxy stays bootable
  const reg2 = new CitationRegistry(chain);

  // has() must return false for the sha that was in the (pre-corruption) performed receipt
  assert.equal(
    reg2.has(testSha),
    false,
    "has() must return false over a corrupt chain (fail-closed)",
  );

  // register() must throw ReceiptChainCorruptError
  assert.throws(
    () =>
      reg2.register({
        document: testDoc,
        rows: [{ citation: "Roe v. Wade, 410 U.S. 113 (1973)", match: "Yes" }],
        meta: {},
      }),
    (err: unknown) => {
      assert.ok(
        err instanceof ReceiptChainCorruptError,
        `expected ReceiptChainCorruptError, got ${String(err)}`,
      );
      return true;
    },
  );
});
