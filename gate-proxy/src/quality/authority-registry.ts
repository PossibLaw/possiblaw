// gate-proxy/src/quality/authority-registry.ts
// Registers legal authorities that were ACTUALLY RETRIEVED from a real source
// (the legal-data MCP posts one registration per fetched authority). State
// derives from the receipt chain (restart-safe) — the same pattern as
// CitationRegistry. Receipts carry the authority's normalized citation, its
// content sha256, and source metadata only — never the authority's text or
// passages (payload-text invariant).
//
// What this proves / does not prove (honesty contract): a registration means a
// retrieval reporter claimed it fetched this authority (by citation + content
// sha256) from the named source at the named time. verifyDocument() then
// answers the anti-hallucination question: of the citations an agent put in an
// outbound document, which were NEVER retrieved? An `unbacked` citation is one
// the firm's own retrieval pipeline never saw — a strong hallucination signal.
// It does NOT prove the cited authority says what the agent claims (that is the
// citation-verification registry's job) and it does NOT prove the source itself
// is authoritative — only that a retrieval was reported and receipted.
import type { ReceiptChain } from "../receipts.ts";
import { extractCitations, comparableCitation } from "../citations.ts";
import { ReceiptChainCorruptError } from "../receipts.ts";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface RegisterAuthorityInput {
  citation: string;
  sha256: string;
  source: string;
  sourceUrl?: string;
  retrievedAt?: string;
  agentId?: string;
  // FIX 3 (S2): meta/reporterMeta removed — caller-supplied meta was stored
  // verbatim in the hash-chained ledger (up to ~1MB of arbitrary JSON) and is
  // never read back by verifyDocument or the sign-off bundle. Drop it entirely;
  // only structured fields the bundle uses are kept in the receipt.
}

export interface RegisterAuthorityResult {
  ok: true;
  normalizedCitation: string;
}

export interface VerifyDocumentResult {
  citations: string[];
  backed: string[];
  unbacked: string[];
}

// ---------------------------------------------------------------------------
// AuthorityRegistry
// ---------------------------------------------------------------------------

export class AuthorityRegistry {
  // SECURITY INVARIANT: this set contains only NORMALIZED citation strings
  // (comparableCitation form) — never authority text. It is never persisted
  // independently: state is rebuilt from the receipt chain on every
  // construction so it survives restarts without a separate state file.
  private readonly retrieved = new Set<string>();

  // Phase 1 posture (mirrors CitationRegistry): a corrupt chain does NOT crash
  // the proxy at startup. The registry fails closed (nothing retrieved,
  // registration refused) until the operator repairs the chain and restarts.
  private chainCorrupt = false;

  constructor(private readonly receipts: ReceiptChain) {
    const chainResult = receipts.verify();
    if (!chainResult.ok) {
      this.chainCorrupt = true;
      return;
    }
    // Rebuild the retrieved set from the chain: any performed authority_provenance
    // quality receipt records a normalized citation in meta.normalizedCitation.
    for (const entry of receipts.entries()) {
      if (
        entry.body.kind === "quality" &&
        entry.body.tool === "authority_provenance" &&
        entry.body.outcome === "performed"
      ) {
        const indexed = entry.body.meta?.["indexedCitations"];
        if (Array.isArray(indexed)) {
          for (const f of indexed) {
            if (typeof f === "string" && f.length > 0) this.retrieved.add(f);
          }
        } else {
          // Backward-compatible fallback to the single primary form.
          const nc = entry.body.meta?.["normalizedCitation"];
          if (typeof nc === "string" && nc.length > 0) this.retrieved.add(nc);
        }
      }
    }
  }

  /**
   * Register that an authority was retrieved from a real source. Appends a
   * "performed" quality receipt (tool=authority_provenance) and indexes the
   * NORMALIZED citation in the retrieved set.
   *
   * SECURITY INVARIANT: the receipt carries the normalized citation + content
   * sha256 + source metadata only — never authority text or passages.
   *
   * Fail-closed: throws ReceiptChainCorruptError over a corrupt chain (the
   * route's catch converts this to an error status — matches ops-fail-on-corrupt).
   */
  register(input: RegisterAuthorityInput): RegisterAuthorityResult {
    if (this.chainCorrupt) {
      throw new ReceiptChainCorruptError(
        "AuthorityRegistry: receipt chain failed integrity verification; repair the chain and restart the proxy",
      );
    }

    // Index by the EXTRACTED citation token(s), normalized the SAME way the
    // citation gate extracts and normalizes the cites in an outbound document.
    // The supplied `citation` is often a full reference ("Roe v. Wade, 410
    // U.S. 113 (1973)"); the gate later extracts only "410 U.S. 113" from the
    // filing. Running the same deterministic extractor on the registration
    // string (then comparableCitation) is what makes register() and
    // verifyDocument() align. A bare-token citation extracts to itself.
    const extracted = extractCitations(input.citation);
    const indexForms = extracted.length > 0
      ? extracted.map(comparableCitation)
      : [comparableCitation(input.citation)];
    // The receipt records the first/primary normalized form for the audit trail.
    const normalizedCitation = indexForms[0];

    // Receipts carry the normalized citation + content sha + source only —
    // never authority text, passages, or caller-supplied meta (FIX 3: reporterMeta
    // was dropped because it stored arbitrary caller JSON in the hash-chained ledger
    // and is never read back by verifyDocument or the sign-off bundle).
    const meta: Record<string, unknown> = {
      normalizedCitation,
      // All normalized forms indexed by this registration — the rebuild-from-
      // chain path reads this so a fresh registry over the same chain sees the
      // identical retrieved set (including multi-citation registration strings).
      indexedCitations: indexForms,
      authoritySha256: input.sha256,
      source: input.source,
    };
    if (input.sourceUrl !== undefined) meta["sourceUrl"] = input.sourceUrl;
    if (input.retrievedAt !== undefined) meta["retrievedAt"] = input.retrievedAt;

    this.receipts.append({
      kind: "quality",
      tool: "authority_provenance",
      boundary: null,
      decision: null,
      outcome: "performed",
      // payloadSha256 is the authority's CONTENT sha (what the citation gate
      // would hash over the authority body) — binds the registration to a
      // specific retrieved document.
      payloadSha256: input.sha256,
      agentId: input.agentId,
      meta,
    });
    for (const f of indexForms) this.retrieved.add(f);
    return { ok: true, normalizedCitation };
  }

  /** Returns true if the given citation was registered as retrieved. */
  hasCitation(cite: string): boolean {
    // Fail-closed: nothing is retrieved over a corrupt chain.
    if (this.chainCorrupt) return false;
    return this.retrieved.has(comparableCitation(cite));
  }

  /**
   * Partition the citations in an outbound document by whether each was ever
   * retrieved. `unbacked` is the anti-hallucination signal: citations the agent
   * put in the document that the firm's retrieval pipeline never saw.
   *
   * Over a corrupt chain everything is unbacked (fail-closed): hasCitation()
   * returns false, so no citation can be marked backed.
   */
  verifyDocument(text: string): VerifyDocumentResult {
    const citations = extractCitations(text);
    const backed: string[] = [];
    const unbacked: string[] = [];
    for (const c of citations) {
      if (this.hasCitation(c)) backed.push(c);
      else unbacked.push(c);
    }
    return { citations, backed, unbacked };
  }
}
