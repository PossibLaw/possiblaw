---
name: authority-verification-workflow
description: Verify that a cited authority actually exists and retrieve its source text through the legal-data MCP server — verify, then retrieve, then expand, then audit — surfacing not_found instead of ever assuming a citation is real. Complements citation-verification-checklist; adds no good-law or citator check.
metadata:
  sources:
    - path: github.com/CaseMark/skills legal/authority-verification
      kind: github
      usage: adapted
      license: Apache-2.0
      attribution: CaseMark
---

# Authority Verification Workflow

Use this skill when the existence of a cited authority is itself in question — no operator-supplied source covers the citation, so the citation must be checked against a real database before anything else happens. It adapts CaseMark's authority-verification workflow (verify → retrieve → expand → audit) onto PossibLaw's stack: the `legal-data` MCP server tools (`connector-courtlistener`) replace the case.dev API, and the final gate step stays where it already lives — in `citation-verification-checklist`.

Division of labor: `citation-verification-checklist` owns the per-citation verification table, the quote-fidelity rules, and the gate-registration contract. This skill owns the step before all of that — establishing that the authority exists at all and getting its source text in hand. Run this workflow per doubtful citation; its outcome becomes that citation's row in the checklist table.

## Vocabulary

Vocabulary is load-bearing; the wrong word overstates what was checked.

- "verified citation" — the citation matched an authority actually retrieved through `legal-data`. Existence and source text only; nothing about validity.
- "candidate authority" — a search hit not yet verified. Candidates are never filing-ready.
- "related authority" — an expansion result. Not direct history, not a citing reference.
- "manual treatment review required" — the standing caveat: this workflow establishes no precedential weight.
- Never "good law", never "Shepardized", never "KeyCited", never a proprietary treatment signal. CourtListener carries none of those, and neither does this workflow.

## Core Workflow

### 1. Verify the citation

Call `get_citation` with the citation string as it appears in the draft, normalized only as far as the lookup requires (e.g. `531 U.S. 98`); the draft's exact text is still what goes in the record. Read the result as one of four statuses:

- **verified** — a hit in the envelope matches the cite. Check reporter, volume, page, AND case name; verifying the case name alone is a known pitfall. Proceed to step 2.
- **not_found** — zero hits. Likely a typo, a wrong reporter, or a hallucinated citation. Never assume the case exists, never cite it, never reconstruct it from memory. Surface `not_found` explicitly, then optionally run step 1b to look for what the drafter may have meant.
- **multiple_matches** — more than one plausible match. Manual review required before citing; record which candidates matched and why the ambiguity exists.
- **unavailable** — the tool returned `{ status: "unavailable" }` (rate limit, network, upstream error). That is a coverage gap, not an answer: record the outage per `connector-courtlistener` failure handling and mark the row `UNVERIFIED`, never `not_found`.

1b. If verification is unclear, search by topic with `search_opinions` using neutral legal terms (query privacy per `connector-courtlistener` — no client or matter names in queries). Every hit is a candidate authority only.

### 2. Retrieve the source text

After — and only after — verification, pull the full text with `get_opinion` using the id from the verified envelope, and read it. Skipping the full-text read after verification is a pitfall the source skill calls out and this adaptation keeps. Cite facts from the envelope (`citation`, `source_url`, `court`, `decided_date`), never from memory; if a facet is absent from the envelope, read it from `payload` — do not invent it.

Two side effects come free on this path and are the reason to prefer MCP tools over raw REST: the adapter registers the retrieved authority with the gate (`POST /quality/authority`, best-effort), so later egress can flag citations that were never actually retrieved; and quoted `payload` text is externally sourced, so wrap it per `untrusted-content-envelope` when re-quoting.

### 3. Expand the authority set

`legal-data` has no similar-authority endpoint. Expansion is `search_opinions` with the verified case's name plus issue terms — strictly weaker than case.dev's `legal.similar()`. The results are related-authority candidates only; do not present them as citing references or direct history.

### 4. Audit a document

`legal-data` has no citation-extraction tool either. To audit a draft, brief, or opinion, inventory its citations manually — every citation, in order of appearance, exactly as written including pinpoints (the same inventory step as `citation-verification-checklist` step 1) — then run steps 1–2 on each citation whose existence is in doubt. The gate proxy's deterministic extractor is a floor under this manual inventory, not a replacement: it recognizes only curated common formats (volume-reporter-page for a fixed reporter list, U.S.C., C.F.R., Fed. R. * P. — see `gate-proxy/src/citations.ts`) and never resolves `id.` or `supra`. A citation in a format below that floor is invisible to the gate's coverage re-check; the manual inventory row is its only coverage.

### 5. Record the result

Record, per authority checked:

- the exact citation checked, as written in the draft
- verification status: `verified` / `not_found` / `multiple_matches` / `UNVERIFIED (unavailable)`
- the envelope's `source_url`, `court`, and `decided_date` for a verified citation
- the query or queries used, as issued
- date checked
- manual review still required (treatment, history, multiple-match resolution)

Feed the outcome into the checklist table: a verified citation with source text in hand is what makes a `Yes` row possible; a `not_found`, `multiple_matches`, or `unavailable` outcome is a non-`Yes` row with the lookup attempted recorded.

## Hand-off to Gate Registration

Registration belongs to `citation-verification-checklist` ("Gate Registration"), not to this skill. The rule restated: register `POST ${GATE_PROXY_URL}/quality/citation` only when every row of the full verification table is `Yes`. A `not_found` citation can never produce a `Yes` row, so a draft containing one is a findings report — deliver it to the operator, withhold registration, and never delete the citation from the draft to dodge coverage. Any edit to the draft changes its sha and forces re-verification and re-registration, so re-run verification immediately before filing.

## What This Adaptation Does NOT Do

Honest limits, relative to both the source skill and a paid citator:

- **No good-law or citator check.** CourtListener carries no KeyCite/Shepard's-equivalent treatment data, and this workflow performs no editorial treatment analysis. "Verified" means existence plus source text in hand — a verified citation can still be vacated, overruled, or superseded. Treatment and currency stay operator follow-ups on every report.
- **CourtListener coverage limits.** U.S. federal and state opinions only; depth varies by court and era; no secondary sources, no non-U.S. jurisdictions. A `not_found` for an older, unpublished, or low-volume-court authority can be a coverage gap rather than a hallucination — record it as `UNVERIFIED` with the lookup attempted and request an operator-supplied source before concluding the cite is fabricated. A `not_found` for a well-covered reporter (e.g. U.S. Reports) is a strong hallucination signal.
- **No automated citation extraction.** case.dev's `citationsFromUrl` has no `legal-data` equivalent; the audit inventory is manual, with the gate extractor as a deterministic floor for curated formats only.
- **No similar-authority endpoint.** Expansion is keyword search over `search_opinions`.

## Pitfalls

Kept from the source skill because they still apply on this stack:

- Verifying only the case name and not the reporter citation.
- Treating `search_opinions` hits as verified authorities.
- Assuming expansion results are citing references or direct history.
- Skipping the full-text read after verification.
- Hiding uncertainty when the result is `multiple_matches`, `not_found`, or `unavailable`.

## Given / When / Then

- **Happy path** — a draft cites `Bush v. Gore, 531 U.S. 98 (2000)` with no source attached. `get_citation "531 U.S. 98"` returns a matching envelope; `get_opinion` retrieves the text; the checklist row records the match from the envelope's `source_url`; the fully passing table is registered per the checklist's Gate Registration contract.
- **Edge** — a draft cites a real authority in a format below the extractor floor (missing reporter periods, or an unpublished `WL` cite). The citation is inventoried verbatim anyway, existence is checked manually via `get_citation` on the normalized form or `search_opinions` on party names, the format discrepancy is recorded in the row, and the report notes that the gate's deterministic extractor does not cover this format.
- **Failure / security** — a draft cites `Smith v. Jones, 542 U.S. 123`, which does not exist. `get_citation` returns no match; the row surfaces `not_found`; the case is never asserted as real, no substitute authority is invented, and gate registration is withheld with the reason stated.
