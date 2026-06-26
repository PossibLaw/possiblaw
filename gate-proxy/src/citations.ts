// gate-proxy/src/citations.ts
// Deterministic legal-citation extraction — the code-backed floor under the
// LLM citation checklist. Curated common classes only (see docs/known-limitations.md):
// volume-reporter-page for the reporters below, U.S.C., C.F.R., Fed. R. * P.
// Never resolves id./supra; never judges validity.
//
// Normalization: NFKC (folds fullwidth/compatibility chars incl. fullwidth digits)
// followed by whitespace collapse, then a combined strip of: \p{Cf} (format chars:
// ZWSP, soft-hyphen, ZWJ, etc.), \p{Mn} (non-spacing combining marks, e.g. U+0332
// combining low-line), \p{Me} (enclosing combining marks), \p{Cc} non-whitespace
// controls (e.g. NUL U+0000 — whitespace Cc are already collapsed to space earlier),
// and \p{Default_Ignorable_Code_Point} (variation selectors, Hangul fillers, etc.).
// Whitespace collapse runs FIRST so \t/\n/\r (Cc) become plain spaces before the Cc
// strip; NFKC runs before the Mn strip so precomposed accents (á) survive.
// Known residual NOT stripped: visually-blank but non-ignorable code points such as
// U+2800 BRAILLE PATTERN BLANK — tracked in docs/known-limitations.md.
// Compatibility-equivalent texts intentionally share a documentSha256 — the gate
// treats them as the same document.
//
// §-less U.S.C. is IN (e.g. "28 U.S.C. 1331") because under-extraction is the
// dangerous direction (ZERO citations = gate passes fail-open). §-less C.F.R. is
// OUT — bare "29 C.F.R. 1604" form is rarer and the false-positive surface is
// larger; the asymmetry is intentional.
//
// Spacing design (a): reporter matches return as-matched normalized text (e.g.
// "410 U. S. 113" stays "410 U. S. 113"). Downstream coverage matching uses the
// same normalizeText path, so spacing variants compare consistently as long as the
// checker-supplied row text uses the same spacing as the document. No post-match
// canonicalization is applied to reporter cites.
import { sha256hex } from "./receipts.ts";

export class CitationLimitError extends Error {
  constructor() {
    super("citation extraction limit exceeded (500 unique citations)");
    this.name = "CitationLimitError";
  }
}

const MAX_CITATIONS = 500;

/** Longest-first so e.g. "F. Supp. 2d" wins over "F. Supp." over "F." */
const REPORTERS = [
  "L. Ed. 2d", "Cal. Rptr. 3d", "Cal. Rptr. 2d", "F. Supp. 3d", "F. Supp. 2d",
  "N.Y.S.3d", "N.Y.S.2d", "Cal. Rptr.", "F. Supp.", "S. Ct.", "L. Ed.",
  "N.E.3d", "N.E.2d", "N.W.2d", "S.E.2d", "S.W.3d", "S.W.2d", "So. 3d",
  "So. 2d", "F.R.D.", "N.Y.S.", "F.4th", "F.3d", "F.2d", "A.3d", "A.2d",
  "P.3d", "P.2d", "B.R.", "N.E.", "N.W.", "S.E.", "S.W.", "U.S.",
  "So.", "A.", "P.", "F.",
].sort((a, b) => b.length - a.length);

/** S1: NFKC → whitespace-collapse → strip Cf/Mn/Me/Cc(non-WS)/Default_Ignorable → trim */
export function normalizeText(s: string): string {
  return s
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .replace(/[\p{Cf}\p{Mn}\p{Me}\p{Cc}]|\p{Default_Ignorable_Code_Point}/gu, "")
    .trim();
}

export function documentSha256(text: string): string {
  return sha256hex(normalizeText(text));
}

/**
 * Spacing-insensitive comparison form for a single citation. The extractor
 * returns as-matched spacing ("410 U. S. 113"), while a registered authority or
 * checker row may use compact form ("410 U.S. 113"). Collapsing space-after-period
 * on BOTH sides makes equality robust to that variance without touching the
 * sha-binding normalization. This is the ONE shared normalization that both the
 * citation-verification registry and the authority-provenance registry use, so a
 * citation registered on retrieval and the same citation extracted from outbound
 * text compare identically. Exact comparable-form equality is the contract —
 * substring containment is intentionally NOT used (a crafted value must not
 * "cover" a different citation by sharing a common substring).
 */
export function comparableCitation(s: string): string {
  return normalizeText(s).replace(/\.\s+/g, ".");
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// S2a: space is optional after EVERY period in reporter abbreviations, and
// spaces between tokens are also optional ("F.Supp.3d" or "F. Supp. 3d").
const REPORTER_ALT = REPORTERS.map((r) =>
  escapeRe(r).replace(/\\\./g, "\\.\\s?").replace(/ /g, ""),
).join("|");

const PATTERNS: RegExp[] = [
  // Volume-reporter-page
  new RegExp(`\\b\\d{1,4}\\s(?:${REPORTER_ALT})\\s?\\d{1,5}\\b`, "g"),
  // U.S.C.: § is optional (S2b); tail bounded (S2c); flexible spacing around periods
  /\b\d{1,3}\s?U\.?\s?S\.?\s?C\.(?:A\.)?\s?§{0,2}\s?\d[\w.()-]{0,60}/g,
  // C.F.R.: § is REQUIRED (see module header for asymmetry rationale); tail bounded (S2c)
  /\b\d{1,3}\s?C\.F\.R\.\s?§{1,2}\s?\d[\w.()-]{0,60}/g,
  // Fed. R. * P. rules: tail bounded (S2c)
  /\bFed\.\s?R\.\s?(?:Civ|Crim|App|Bankr)\.\s?P\.\s?\d+(?:\([a-zA-Z0-9]{1,10}\)){0,8}/g,
  // Fed. R. Evid. rules: tail bounded (S2c)
  /\bFed\.\s?R\.\s?Evid\.\s?\d+(?:\([a-zA-Z0-9]{1,10}\)){0,8}/g,
];

/** Returns unique citations in order of first appearance, from NFKC/Cf-stripped/whitespace-normalized text. */
export function extractCitations(text: string): string[] {
  const norm = normalizeText(text);
  const found: { index: number; cite: string }[] = [];
  for (const pattern of PATTERNS) {
    pattern.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = pattern.exec(norm)) !== null) {
      // S2d: strip trailing sentence punctuation
      const cite = m[0].trim().replace(/[.,;:]+$/, "");
      found.push({ index: m.index, cite });
    }
  }
  found.sort((a, b) => a.index - b.index);
  // S2e: O(n) dedupe via Set
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const f of found) {
    if (!seen.has(f.cite)) { seen.add(f.cite); unique.push(f.cite); }
    if (unique.length > MAX_CITATIONS) throw new CitationLimitError();
  }
  return unique;
}
