// gate-proxy/src/quality/citation-registry.ts
// Registers citation-verification attestations after deterministic re-checks.
// State derives from the receipt chain (restart-safe). Receipts carry counts +
// shas only — never citation text, quotes, or passages (payload-text invariant).
//
// What this proves / does not prove (honesty contract): a passing registration
// means every detectable citation in the document has a row, every row claims
// "Yes", and every quoted passage appears character-for-character inside the
// source passage the checker says it came from. It does NOT prove the source
// passage genuinely came from the cited authority — that link is enforced by
// the checker agent's workflow and attributed via agentId in the receipt.
import type { ReceiptChain } from "../receipts.ts";
import { extractCitations, normalizeText, documentSha256 } from "../citations.ts";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface CitationRow {
  citation: string;
  match: string;
  quoted?: string;
  sourcePassage?: string;
}

export interface RegisterInput {
  document: string;
  rows: CitationRow[];
  meta: { agentId?: string; issueId?: string };
}

export type RegisterResult =
  | { ok: true; documentSha256: string; citationCount: number }
  | { ok: false; reason: "coverage_gap" | "unverified_rows" | "quote_mismatch"; details: string[] };

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_ROWS = 500;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Spacing-insensitive comparison form: the extractor returns as-matched
 * spacing ("410 U. S. 113"), while checker rows may use compact form
 * ("410 U.S. 113"). Collapsing space-after-period on BOTH sides makes
 * coverage containment robust to that variance without touching the
 * sha-binding normalization.
 */
function comparable(s: string): string {
  return normalizeText(s).replace(/\.\s+/g, ".");
}

// ---------------------------------------------------------------------------
// CitationRegistry
// ---------------------------------------------------------------------------

export class CitationRegistry {
  // SECURITY INVARIANT: verified set contains only document shas (64-char hex).
  // It is never persisted independently — state is rebuilt from the receipt chain
  // on every construction so it survives restarts without a separate state file.
  private readonly verified = new Set<string>();

  constructor(private readonly receipts: ReceiptChain) {
    // Rebuild verified set from the chain: any quality/performed receipt records
    // a sha that passed all checks in a prior session.
    for (const entry of receipts.entries()) {
      if (entry.body.kind === "quality" && entry.body.outcome === "performed") {
        this.verified.add(entry.body.payloadSha256);
      }
    }
  }

  /** Returns true if the document with the given sha has a passing registration. */
  has(docSha: string): boolean {
    return this.verified.has(docSha);
  }

  /**
   * Attempt to register a citation-verification result.
   *
   * Steps (fail-closed at each):
   *   1. Coverage: every citation extracted from the document must appear inside
   *      at least one row's citation field (spacing-insensitive containment).
   *   2. Verification: every row must claim exactly "Yes".
   *   3. Quote fidelity: if a row supplies a quoted passage, it must appear
   *      verbatim (post-normalization) inside the claimed sourcePassage.
   *      A quoted passage without a sourcePassage fails closed.
   *
   * On any failure, a "blocked" quality receipt is appended (counts + sha only,
   * no payload text). On success, a "performed" receipt is appended and the sha
   * is added to the in-memory verified set.
   *
   * Throws synchronously (no receipt appended) if rows.length > MAX_ROWS.
   */
  register(input: RegisterInput): RegisterResult {
    if (input.rows.length > MAX_ROWS) {
      throw new Error(`citation registration exceeds ${MAX_ROWS} rows`);
    }

    const docSha = documentSha256(input.document);
    const citations = extractCitations(input.document);

    // -----------------------------------------------------------------------
    // Helper: append a blocked receipt and return a failure result.
    // SECURITY INVARIANT: the blocked receipt carries only counts and the
    // document sha — never citation text, quotes, or passages.
    // -----------------------------------------------------------------------
    const fail = (
      reason: "coverage_gap" | "unverified_rows" | "quote_mismatch",
      details: string[],
    ): RegisterResult => {
      this.receipts.append({
        kind: "quality",
        tool: "citation_verification",
        boundary: null,
        decision: null,
        outcome: "blocked",
        payloadSha256: docSha,
        agentId: input.meta.agentId,
        issueId: input.meta.issueId,
        meta: { reason, citationCount: citations.length, rowCount: input.rows.length },
      });
      return { ok: false, reason, details };
    };

    // -----------------------------------------------------------------------
    // 1. Coverage: every extracted citation appears inside some row's citation
    //    (spacing-insensitive containment).
    // -----------------------------------------------------------------------
    const rowCmp = input.rows.map((r) => comparable(r.citation));
    const missing = citations.filter((c) => {
      const cc = comparable(c);
      return !rowCmp.some((rc) => rc.includes(cc));
    });
    if (missing.length > 0) return fail("coverage_gap", missing);

    // -----------------------------------------------------------------------
    // 2. Every row must claim exactly "Yes".
    // -----------------------------------------------------------------------
    const notYes = input.rows
      .map((r, i) => ({ match: r.match.trim(), i }))
      .filter(({ match }) => match !== "Yes");
    if (notYes.length > 0) return fail("unverified_rows", notYes.map(({ i }) => `row ${i}`));

    // -----------------------------------------------------------------------
    // 3. Quote fidelity: quoted text must appear verbatim (post-normalization)
    //    inside the claimed source passage. Quoted-without-passage fails closed.
    // -----------------------------------------------------------------------
    const badQuotes = input.rows
      .map((r, i) => ({ r, i }))
      .filter(({ r }) =>
        r.quoted !== undefined &&
        r.quoted !== "" &&
        !(
          r.sourcePassage !== undefined &&
          normalizeText(r.sourcePassage).includes(normalizeText(r.quoted))
        ),
      );
    if (badQuotes.length > 0) return fail("quote_mismatch", badQuotes.map(({ i }) => `row ${i}`));

    // -----------------------------------------------------------------------
    // All checks passed: append a performed receipt and register the sha.
    // SECURITY INVARIANT: receipt carries counts and sha only, no payload text.
    // -----------------------------------------------------------------------
    const quotedRowCount = input.rows.filter((r) => r.quoted !== undefined && r.quoted !== "").length;
    this.receipts.append({
      kind: "quality",
      tool: "citation_verification",
      boundary: null,
      decision: null,
      outcome: "performed",
      payloadSha256: docSha,
      agentId: input.meta.agentId,
      issueId: input.meta.issueId,
      meta: { citationCount: citations.length, rowCount: input.rows.length, quotedRowCount },
    });
    this.verified.add(docSha);
    return { ok: true, documentSha256: docSha, citationCount: citations.length };
  }
}
