// gate-proxy/src/citations.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { extractCitations, normalizeText, documentSha256, CitationLimitError } from "./citations.ts";

test("extracts volume-reporter-page citations", () => {
  const text = "See Roe v. Wade, 410 U.S. 113, 116 (1973); Smith v. Jones, 123 F.3d 456 (9th Cir. 1997).";
  assert.deepEqual(extractCitations(text), ["410 U.S. 113", "123 F.3d 456"]);
});

test("extracts F. Supp. series with flexible spacing", () => {
  assert.deepEqual(extractCitations("Doe, 45 F.Supp.3d 100 (S.D.N.Y. 2014)"), ["45 F.Supp.3d 100"]);
});

test("extracts statutes and rules", () => {
  const text = "Under 42 U.S.C. § 1983 and 29 C.F.R. § 1604.11, see Fed. R. Civ. P. 12(b)(6).";
  assert.deepEqual(extractCitations(text), ["42 U.S.C. § 1983", "29 C.F.R. § 1604.11", "Fed. R. Civ. P. 12(b)(6)"]);
});

test("regional reporters match", () => {
  assert.deepEqual(extractCitations("Accord 850 N.E.2d 1140; 712 So. 2d 1148."), ["850 N.E.2d 1140", "712 So. 2d 1148"]);
});

test("no false positives on addresses, money, dates", () => {
  assert.deepEqual(extractCitations("Meet at 123 Main St. Suite 456 on 12 June 2026; fee is $5,000."), []);
});

test("dedupes repeated citations", () => {
  assert.deepEqual(extractCitations("410 U.S. 113 ... again 410 U.S. 113"), ["410 U.S. 113"]);
});

test("empty/citation-free text returns empty array", () => {
  assert.deepEqual(extractCitations(""), []);
  assert.deepEqual(extractCitations("Please find the signed engagement letter attached."), []);
});

test("throws CitationLimitError above 500 unique citations", () => {
  const many = Array.from({ length: 501 }, (_, i) => `${i + 1} U.S. ${i + 100}`).join("; ");
  assert.throws(() => extractCitations(many), CitationLimitError);
});

test("normalizeText: NFC + whitespace collapse", () => {
  assert.equal(normalizeText("á  b\n\tc"), "á b c");
});

test("documentSha256 is stable across cosmetic whitespace", () => {
  assert.equal(documentSha256("410 U.S.  113\n"), documentSha256("410 U.S. 113"));
  assert.notEqual(documentSha256("410 U.S. 113"), documentSha256("410 U.S. 114"));
});
