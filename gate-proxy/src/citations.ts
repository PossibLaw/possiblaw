// gate-proxy/src/citations.ts
// Deterministic legal-citation extraction — the code-backed floor under the
// LLM citation checklist. Curated common classes only (see docs/known-limitations.md):
// volume-reporter-page for the reporters below, U.S.C., C.F.R., Fed. R. * P.
// Never resolves id./supra; never judges validity.
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

export function normalizeText(s: string): string {
  return s.normalize("NFC").replace(/\s+/g, " ").trim();
}

export function documentSha256(text: string): string {
  return sha256hex(normalizeText(text));
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Reporter abbreviations tolerate zero-or-one space between tokens ("F.Supp.3d").
const REPORTER_ALT = REPORTERS.map((r) => escapeRe(r).replace(/ /g, "\\s?")).join("|");

const PATTERNS: RegExp[] = [
  new RegExp(`\\b\\d{1,4}\\s(?:${REPORTER_ALT})\\s?\\d{1,5}\\b`, "g"),
  /\b\d{1,3}\s?U\.S\.C\.(?:A\.)?\s?§{1,2}\s?\d[\w.()-]*/g,
  /\b\d{1,3}\s?C\.F\.R\.\s?§{1,2}\s?\d[\w.()-]*/g,
  /\bFed\.\s?R\.\s?(?:Civ|Crim|App|Bankr)\.\s?P\.\s?\d+(?:\([a-zA-Z0-9]+\))*/g,
  /\bFed\.\s?R\.\s?Evid\.\s?\d+(?:\([a-zA-Z0-9]+\))*/g,
];

/** Returns unique citations in order of first appearance, from NFC/whitespace-normalized text. */
export function extractCitations(text: string): string[] {
  const norm = normalizeText(text);
  const found: { index: number; cite: string }[] = [];
  for (const pattern of PATTERNS) {
    pattern.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = pattern.exec(norm)) !== null) {
      found.push({ index: m.index, cite: m[0].trim() });
    }
  }
  found.sort((a, b) => a.index - b.index);
  const unique: string[] = [];
  for (const f of found) {
    if (!unique.includes(f.cite)) unique.push(f.cite);
    if (unique.length > MAX_CITATIONS) throw new CitationLimitError();
  }
  return unique;
}
