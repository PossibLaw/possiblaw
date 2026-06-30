// gate-proxy/src/provenance/segments.ts
// Deterministic document segmentation — the code-backed floor under per-segment
// provenance. A document is split into paragraph segments on blank-line
// boundaries; each segment carries a stable 0-based index and a sha256 computed
// over its NORMALIZED text via the same normalizeText path the citation gate and
// quote-fidelity checks use (see citations.ts), so a segment's sha compares
// consistently with a registered authority/quote sha.
//
// Hash-only invariant: callers that persist segments to a receipt MUST store
// only { index, sha256 } — never the segment text. The `text` field exists for
// in-memory verification at the gate, not for the audit trail.
import { normalizeText, documentSha256 } from "../citations.ts";

export interface Segment {
  /** 0-based order of appearance among non-empty segments. */
  index: number;
  /** Normalized segment text (normalizeText path); for in-memory checks only. */
  text: string;
  /** sha256hex(normalizeText(rawSegment)) === documentSha256(rawSegment). */
  sha256: string;
}

/**
 * Split a document into paragraph segments on blank-line boundaries.
 *
 * A blank-line boundary is one newline, optional spaces/tabs, then another
 * newline (CRLF/CR are unified to LF first). Runs of blank lines collapse to a
 * single boundary. Paragraphs that normalize to empty text are dropped, so
 * indices are always contiguous from 0. Pure and deterministic: same input →
 * identical output.
 */
export function segmentDocument(text: string): Segment[] {
  const unified = text.replace(/\r\n?/g, "\n");
  const rawParas = unified.split(/\n[ \t]*\n/);
  const segments: Segment[] = [];
  let index = 0;
  for (const raw of rawParas) {
    const norm = normalizeText(raw);
    if (norm === "") continue;
    segments.push({ index, text: norm, sha256: documentSha256(raw) });
    index++;
  }
  return segments;
}
