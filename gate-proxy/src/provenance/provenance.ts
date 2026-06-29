// gate-proxy/src/provenance/provenance.ts
// Per-segment provenance record for an outbound document — the data structure
// the citation gate records and the Matter Trust Report projects. Built on the
// deterministic segmenter (segments.ts).
//
// Phase A (this file): every segment is labeled `unsourced` — the honest
// baseline before any source binding. Later phases enrich entries:
//   - `quoted`   — segment text is a verbatim quote of a registered source
//                  (cryptographically verifiable; sourceSha256 set).
//   - `sourced`  — segment cites an authority that was actually retrieved
//                  (tied to the authority registry; citation/sourceSha256 set).
//   - `unsourced`— original analysis/argument; honestly labeled, not faked.
//
// Hash-only invariant: a SegmentProvenance carries the segment's sha, NEVER its
// text. The whole-document sha is retained too, so a receipt can bind both the
// document and each of its segments without persisting any payload text.
import { documentSha256, extractCitations } from "../citations.ts";
import { segmentDocument } from "./segments.ts";

export type SegmentProvenanceKind = "sourced" | "quoted" | "unsourced";

export interface SegmentProvenance {
  /** 0-based segment index, aligned with segmentDocument(). */
  index: number;
  /** sha256 of the segment's normalized text. */
  segmentSha256: string;
  kind: SegmentProvenanceKind;
  /** sha256 of the backing source (set when quoted/sourced). */
  sourceSha256?: string;
  /** Normalized citation tying this segment to a retrieved authority (set when sourced). */
  citation?: string;
}

export interface ProvenanceSummary {
  sourced: number;
  quoted: number;
  unsourced: number;
}

export interface DocumentProvenance {
  /** Whole-document sha (citations.documentSha256), the existing receipt binding. */
  documentSha256: string;
  segmentCount: number;
  segments: SegmentProvenance[];
  summary: ProvenanceSummary;
}

export interface BuildProvenanceOptions {
  /**
   * Returns true if the given citation token (raw, as extracted from the
   * segment) was actually retrieved from a real source — i.e. registered with
   * the authority registry. The gate passes
   * `(c) => authorityRegistry.hasCitation(c)`. A segment carrying a backed
   * citation is labeled `sourced`; this is the verifiable-first signal (the cite
   * ties back to a retrieval the firm's own pipeline saw), not self-assertion.
   */
  isCitationBacked?: (citation: string) => boolean;
}

/**
 * Build the per-segment provenance record for a document.
 *
 * Without options, every segment is `unsourced` (the honest baseline). With an
 * `isCitationBacked` predicate, a segment that carries at least one backed
 * (retrieved) citation is labeled `sourced` and the first such citation is
 * recorded. Segments with no citation, or only unbacked citations, stay
 * `unsourced`. The `quoted` kind (verbatim quote-fidelity against source text)
 * requires producer-supplied source passages and is added in a later phase.
 *
 * Deterministic and side-effect free.
 */
export function buildProvenance(
  documentText: string,
  opts: BuildProvenanceOptions = {},
): DocumentProvenance {
  const segments: SegmentProvenance[] = segmentDocument(documentText).map((s) => {
    const rec: SegmentProvenance = {
      index: s.index,
      segmentSha256: s.sha256,
      kind: "unsourced",
    };
    if (opts.isCitationBacked !== undefined) {
      const backed = extractCitations(s.text).find((c) => opts.isCitationBacked!(c));
      if (backed !== undefined) {
        rec.kind = "sourced";
        rec.citation = backed;
      }
    }
    return rec;
  });

  const summary: ProvenanceSummary = { sourced: 0, quoted: 0, unsourced: 0 };
  for (const s of segments) summary[s.kind]++;

  return {
    documentSha256: documentSha256(documentText),
    segmentCount: segments.length,
    segments,
    summary,
  };
}
