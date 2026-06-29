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
import { documentSha256 } from "../citations.ts";
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

/**
 * Build the baseline provenance record for a document: one entry per segment,
 * each labeled `unsourced`. Deterministic and side-effect free.
 */
export function buildProvenance(documentText: string): DocumentProvenance {
  const segments: SegmentProvenance[] = segmentDocument(documentText).map((s) => ({
    index: s.index,
    segmentSha256: s.sha256,
    kind: "unsourced",
  }));

  const summary: ProvenanceSummary = { sourced: 0, quoted: 0, unsourced: 0 };
  for (const s of segments) summary[s.kind]++;

  return {
    documentSha256: documentSha256(documentText),
    segmentCount: segments.length,
    segments,
    summary,
  };
}
