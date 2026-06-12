// gate-proxy/src/quality/citation-registry.ts
// Registers citation-verification attestations after deterministic re-checks.
// State derives from the receipt chain (restart-safe). Receipts carry counts +
// shas only — never citation text, quotes, or passages (payload-text invariant).
//
// What this proves / does not prove (honesty contract): a passing registration
// means every detectable citation in the document has a row, every row claims
// "Yes", every quoted passage appears character-for-character inside BOTH the
// source passage the checker says it came from AND in the registered document
// itself (quote-document binding: an attacker cannot register a fabricated
// self-consistent quote pair that is absent from the actual document), and
// coverage is verified via exact comparable-form equality between citations
// extracted from the document and citations extracted from each row's citation
// field (substring containment is not used: a crafted row cannot "cover" a
// different citation by sharing a common substring). It does NOT prove the
// source passage genuinely came from the cited authority — that link is
// enforced by the checker agent's workflow and attributed via agentId in the
// receipt.
import type { ReceiptChain } from "../receipts.ts";
import { extractCitations, normalizeText, documentSha256 } from "../citations.ts";
import { ReceiptChainCorruptError } from "../receipts.ts";

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

  // Phase 1 posture: a corrupt chain does NOT crash the proxy at startup.
  // The registry fails closed (nothing verified, registration refused) until
  // the operator repairs the chain and restarts. The proxy stays bootable so
  // /health can return 503 receipts_corrupt for diagnostics.
  private chainCorrupt = false;

  constructor(private readonly receipts: ReceiptChain) {
    // Verify chain integrity before trusting it. A corrupt chain does NOT
    // throw here (the proxy must stay bootable for /health diagnostics —
    // Phase 1 posture); instead the registry fails closed: nothing is
    // verified, and registration is refused until the operator repairs
    // the chain.
    const chainResult = receipts.verify();
    if (!chainResult.ok) {
      this.chainCorrupt = true;
      return;
    }

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
    // Fail-closed: nothing is verified over a corrupt chain.
    if (this.chainCorrupt) return false;
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
    // Fail-closed: refuse registration over a corrupt chain. The route's
    // existing catch converts this to a 400/500 — matches ops-fail-on-corrupt.
    if (this.chainCorrupt) {
      throw new ReceiptChainCorruptError(
        "CitationRegistry: receipt chain failed integrity verification; repair the chain and restart the proxy",
      );
    }
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
    // 1. Coverage: every extracted citation must itself be extracted from some
    //    row's citation field (exact comparable-form equality — substring
    //    containment allowed crafted rows to "cover" different citations).
    //    CitationLimitError from a pathological row propagates as-is (caller
    //    route will 400/500-guard it); no special handling needed here.
    // -----------------------------------------------------------------------
    const rowCites = new Set<string>();
    for (const r of input.rows) {
      for (const cite of extractCitations(r.citation)) rowCites.add(comparable(cite));
    }
    const missing = citations.filter((c) => !rowCites.has(comparable(c)));
    if (missing.length > 0) return fail("coverage_gap", missing);

    // -----------------------------------------------------------------------
    // 2. Every row must claim exactly "Yes".
    // -----------------------------------------------------------------------
    const notYes = input.rows
      .map((r, i) => ({ match: r.match.trim(), i }))
      .filter(({ match }) => match !== "Yes");
    if (notYes.length > 0) return fail("unverified_rows", notYes.map(({ i }) => `row ${i}`));

    // -----------------------------------------------------------------------
    // 3. Quote fidelity: a row with non-empty quoted text fails closed as
    //    quote_mismatch unless BOTH conditions hold:
    //      (a) normalizeText(input.document).includes(normalizeText(r.quoted))
    //          — the quote is actually present in the registered document
    //          (prevents fabricated self-consistent quote pairs)
    //      (b) r.sourcePassage !== undefined &&
    //          normalizeText(r.sourcePassage).includes(normalizeText(r.quoted))
    //          — the quote appears verbatim in the claimed source passage
    //    Quoted-without-passage fails closed (condition b alone would reject it).
    // -----------------------------------------------------------------------
    const normalizedDoc = normalizeText(input.document);
    const badQuotes = input.rows
      .map((r, i) => ({ r, i }))
      .filter(({ r }) =>
        r.quoted !== undefined &&
        r.quoted !== "" &&
        !(
          normalizedDoc.includes(normalizeText(r.quoted)) &&
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
