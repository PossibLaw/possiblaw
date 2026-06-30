# Design: Per-segment provenance — Phase D (producer registry + verbatim `quoted` + strict blocking)

Status: `DRAFT` — design only, nothing here is implemented. This is the starter
spec for the next coding agent. Phases A–C context is real and shipped; Phase D
below is the build.

## TL;DR for the next agent

Phase A (shipped, PR #14) gives **gate-computed** per-paragraph provenance:
each segment is `sourced` (carries a citation that was actually retrieved) or
`unsourced`. Phase D adds the **producer-supplied, cryptographically verified**
layer: a `POST /quality/provenance` endpoint + registry that verifies a
segment's quote appears verbatim in both the outbound document and a supplied
source passage — unlocking the `quoted` kind and an opt-in strict-blocking
policy. Mirror `gate-proxy/src/quality/citation-registry.ts` almost exactly; it
already does this quote-fidelity check at the document level.

## What already exists (Phase A — do not rebuild)

- `gate-proxy/src/provenance/segments.ts` — `segmentDocument(text)`: deterministic
  blank-line segmentation, stable 0-based `index`, `sha256` via `documentSha256`.
- `gate-proxy/src/provenance/provenance.ts` — `buildProvenance(text, { isCitationBacked })`:
  one record per segment; `sourced` when a segment carries a backed citation,
  else `unsourced`. The `quoted` kind is **declared but never produced yet** —
  Phase D produces it.
- `gate-proxy/src/server.ts` egress step **5d** — computes `buildProvenance` on
  citation-gated boundaries and attaches it to the egress receipt meta via
  `authorityReceiptMeta`. `MAX_PROVENANCE_SEGMENTS = 500`.
- `gate-proxy/src/quality/signoff.ts` — "Provenance (per-segment)" report
  section (`metaProvenance` parser + `ProvenanceProjection`).
- Patterns to mirror: `gate-proxy/src/quality/citation-registry.ts` (quote
  fidelity: `normalizeText(doc).includes(normalizeText(quote))` AND
  `normalizeText(sourcePassage).includes(normalizeText(quote))`; chain-rebuild
  constructor; fail-closed on corrupt chain) and
  `gate-proxy/src/quality/authority-registry.ts` (state derived from the receipt
  chain, restart-safe).

## Problem (why Phase D is necessary, not optional)

True per-paragraph **verbatim quote-fidelity** cannot be gate-only. At egress the
gate holds only source *shas* — both registries store hashes, never source text
(the payload-text invariant). So to prove "this paragraph is a verbatim quote of
source X," a producer (the citation/quote checker agent) must supply, per
segment, the quote and its source passage. The gate verifies and records the
binding; the verified binding then upgrades the segment to `quoted`.

## Design

### 1. New endpoint `POST /quality/provenance`

Producer (the `legal-citation-checker` agent, after it has the source passages)
registers per-segment source bindings for a specific document.

Request body:
```jsonc
{
  "document": "<full outbound document text>",
  "segments": [
    {
      "index": 1,                       // must match segmentDocument() index
      "quoted": "<verbatim quote text>",// the passage this segment quotes
      "sourcePassage": "<source text the quote came from>",
      "citation": "410 U.S. 113"        // optional, the backing authority
    }
  ],
  "meta": { "agentId": "...", "issueId": "..." }
}
```

Verification per segment (fail-closed, mirror citation-registry step 3):
1. Re-run `segmentDocument(document)`; the supplied `index` must exist.
2. `normalizeText(segment.text).includes(normalizeText(quoted))` — the quote is
   actually in that paragraph of the document.
3. `normalizeText(sourcePassage).includes(normalizeText(quoted))` — the quote is
   verbatim in the supplied source. A `quoted` with no `sourcePassage` fails closed.
4. (Optional, recommended) if `citation` is supplied, require it to be a backed
   authority (`authorityRegistry.hasCitation`) — ties the quote to a real retrieval.

On success, append a `kind: "quality", tool: "segment_provenance"` receipt
carrying **shas + indices only** (never quote/source text):
```jsonc
{
  "kind": "quality", "tool": "segment_provenance", "outcome": "performed",
  "payloadSha256": "<documentSha256>",
  "agentId": "...", "issueId": "...",
  "meta": {
    "documentSha256": "<docSha>",
    "verifiedSegments": [ { "index": 1, "segmentSha256": "<sha>", "citation": "410 U.S. 113" } ]
  }
}
```
On any failure append an `outcome: "blocked"` receipt with `{ reason, ... }` (no text).

### 2. `SegmentProvenanceRegistry` (`gate-proxy/src/quality/segment-provenance-registry.ts`)

Mirror `CitationRegistry` / `AuthorityRegistry`:
- Constructor verifies chain integrity; on corrupt chain → fail closed.
- Rebuild state from the chain: for each performed `segment_provenance` receipt,
  index the set of **`documentSha256:segmentSha256`** keys (and/or citation) that
  are verified-quoted.
- `isSegmentQuoted(documentSha256, segmentSha256): boolean`.
- `register(input)`: the verification above; append receipt; update set.

Keying on `documentSha256:segmentSha256` binds the verification to the exact
paragraph of the exact document (an edit changes the sha → re-verification
required), exactly like the citation gate's doc-sha binding.

### 3. Wire into egress (`server.ts` step 5d) — upgrade segments to `quoted`

Extend the Phase A call. `buildProvenance` gains a second predicate:
```ts
buildProvenance(documentText, {
  isCitationBacked: (c) => authorityRegistry.hasCitation(c),
  isSegmentQuoted: (segmentSha256) =>
    segmentProvenanceRegistry.isSegmentQuoted(docSha, segmentSha256),
});
```
Precedence in `buildProvenance`: a segment that is verified-quoted → `quoted`
(strongest); else carries a backed citation → `sourced`; else `unsourced`.
`quoted` implies a verified source, so set `sourceSha256`/`citation` accordingly.

### 4. Strict-policy blocking (opt-in)

Add `requireSegmentProvenance: boolean` to `policy.citationGate` (default
**false** — `gate-proxy/src/policy.ts`, mirror `requireAuthorityProvenance`).
When true, on a citation-gated boundary, block egress if any segment is
`unsourced` (or below a configured threshold). Append a blocked receipt with
`reason: "segment_provenance_unverified"` and the offending indices. Document the
honesty caveat: pure original analysis is legitimately `unsourced`, so strict
mode is for document types where every paragraph must be sourced (e.g. a brief's
argument section) — likely needs a per-boundary or per-matter scope, not global.
Mark scope decision **UNCONFIRMED**.

### 5. Report + producer contract

- `signoff.ts`: the existing "Provenance (per-segment)" section already renders
  `quoted` counts (the column exists); just confirm `quoted` totals surface and
  add a "verified quotes" note.
- Package: extend the `citation-verification-checklist` skill + `legal-citation-checker`
  agent to call `POST /quality/provenance` with per-segment quotes after the
  citation table passes (mirror the existing `POST /quality/citation` "Gate
  Registration" step). Add a `403 segment_provenance_*` remediation contract to
  the connector egress skills if strict mode ships on.

## Eval walkthrough (Given/When/Then)

- **Happy.** *Given* a brief whose paragraph 3 quotes a CourtListener opinion and
  the checker registers `{index:3, quoted, sourcePassage, citation}` via
  `POST /quality/provenance`. *When* the brief is filed (citation-gated egress).
  *Then* the gate verifies the quote verbatim in doc + source, segment 3 is
  `quoted` in the egress receipt and the Matter Trust Report; chain verifies; no text in receipts.
- **Edge.** *Given* paragraph 3's quote was altered by one word after
  registration (doc sha changes) or the producer registers index 9 that doesn't
  exist. *Then* `isSegmentQuoted` returns false for the new sha (re-verification
  required) / registration of a non-existent index fails closed; the segment
  falls back to `sourced`/`unsourced`; report shows it accurately.
- **Failure/security.** *Given* a fabricated self-consistent quote pair absent
  from the actual document, OR a `quoted` with no `sourcePassage`, OR (strict
  mode) a document with an `unsourced` argument paragraph. *Then* registration is
  refused (blocked receipt, no text); strict mode blocks the egress with
  `segment_provenance_unverified`; on `local_trusted` the same self-registration
  trust caveat as `POST /quality/citation` applies — document it, do not silently trust.

## TDD order

1. `segment-provenance-registry.test.ts` (RED→GREEN): verify/refuse, quote
   fidelity, chain-rebuild restart-safety, fail-closed on corrupt chain.
2. `buildProvenance` `isSegmentQuoted` predicate + precedence (extend
   `provenance.test.ts`).
3. Endpoint route test (extend `server.test.ts` / a new `segment-provenance.test.ts`
   using `test-helpers.ts`; add a `registerSegmentProvenance` helper).
4. Egress upgrade-to-`quoted` end-to-end (extend `citation-gate.test.ts`).
5. Strict-policy blocking (policy test + egress block test).
6. `signoff` quoted-totals projection (extend `signoff.test.ts`).
Run `pnpm -C gate-proxy test` + `pnpm -C gate-proxy typecheck` after each.

## Out of scope (Phase D v1)

- Non-citation / internal-document provenance (memos, contracts, prior work
  products) — a separate identifier scheme; later phase.
- Auto-extraction of quotes by the gate (the producer supplies them).
- Cross-matter provenance reuse.

## UNCONFIRMED

- Strict-mode scope (global vs per-boundary vs per-matter) and the
  unsourced-threshold semantics (original analysis is legitimately unsourced).
- Whether `quoted` should require a backed `citation` or accept any verified
  source passage (recommend: require backed citation for legal authorities).
- Receipt-size budget for `verifiedSegments` (reuse `MAX_PROVENANCE_SEGMENTS`?).
