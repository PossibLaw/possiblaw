---
name: cap-table-review-checklist
description: Review a cap table against grants, financings, and conversions when a cap-table review matter arrives, producing a risk-rated findings table, a math-check record, and operator follow-ups without restating the cap table as authoritative.
metadata:
  sources:
    - path: companies/legal-operations/skills/cap-table-review-checklist/SKILL.md
      kind: local-file
      usage: vendored
      license: Apache-2.0
      attribution: PossibLaw
---

# Cap Table Review Checklist

Use this skill to run a structured consistency review of a cap table against its source documents — grants, financings, conversions, charters, and consents. The output is findings and flags for operator decision: discrepancies are recorded side by side with the sources, never resolved, and the cap table is never restated as authoritative or corrected.

## Review Steps

1. Scope intake. Record the cap table under review (version and date), the entity, the source documents supplied (equity plans and grant documents, financing documents, convertible instruments, charter and amendments, board and stockholder consents), and any entries or classes the operator excluded. If the cap table itself or the entire source-document set is absent and no acceptable default applies, gate with `missing-info-gate` instead of guessing.
2. Build the entry inventory. List every cap-table entry by holder, security class or instrument, share or unit count, and any stated price, date, or vesting terms. Note any class totals, option-pool figures, and fully diluted counts the cap table states.
3. Run source checks. Check each entry against the cited source document: holder name, instrument, count, price, date, and vesting terms. Where no source document covers an entry, record an explicit `no source provided` flag; never accept a figure without a source check or that flag.
4. Run authorization checks. For each issuance, look for the board approval — and any stockholder approval the documents call for — in the provided set. Where one is absent, record a missing-approval flag framed as a gap for operator follow-up, never as a conclusion that the issuance is invalid.
5. Run math checks. Recompute class totals, fully diluted counts, option-pool availability, and conversion math from the source instruments' stated terms. Where the cap table and the recomputation differ, record both figures side by side with the instruments cited; do not declare either figure correct.
6. Run consistency checks. Compare the cap table against itself and across documents: duplicate or conflicting entries for the same holder, counts that exceed authorized shares as stated in the charter, pool grants that exceed the stated pool, conversion terms applied inconsistently, and dates that contradict the document sequence.
7. Produce the findings table, math-check record, and summary in the formats below.

## Findings Table Format

| Entry / item | Risk | Discrepancy or gap | Source check | Suggested operator action |
|---|---|---|---|---|
| Holder, class, or item reference | High / Medium / Low | One- or two-sentence statement of the discrepancy, missing approval, or gap | Document checked, or `no source provided` | Concrete follow-up, or `[OPERATOR DECISION]` where the fix is a business or legal choice |

Rate each finding with a one-line rationale:

- `High`: a math discrepancy, an entry that conflicts with a source document or the charter's stated limits, or a missing approval for a completed issuance.
- `Medium`: an unsourced entry, an ambiguous term, or an inconsistency the documents do not resolve.
- `Low`: formatting, labeling, or completeness issues that do not change any figure.

## Math-Check Record Format

| Item | Cap-table figure | Recomputed figure | Source instruments | Match |
|---|---|---|---|---|
| Class total / fully diluted count / pool availability / conversion result | As stated | As recomputed from stated terms | Documents cited | Yes / No / `[INPUTS MISSING]` |

## Summary and Next Actions

Close the review with:

- Finding counts by risk level.
- Unsourced entries and missing-approval flags, each listed.
- Documents not provided and entries not reviewed, with why.
- An ordered operator action list starting with `High` findings, including jurisdiction-dependent and securities-law questions routed to the operator or responsible attorney.

## Boundaries

- Do not restate, republish, or deliver a corrected cap table as authoritative; deliver findings and flags for operator decision.
- Do not conclude that any issuance was valid, invalid, or compliant with securities laws, or predict how a regulator or court would treat it; flag and route those questions to the operator or responsible attorney.
- Do not transmit the cap table, the source documents, or the findings to any external party or system; the review is a work product pending operator approval.
