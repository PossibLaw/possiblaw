---
name: forbearance-review-checklist
description: Review forbearance agreements, standstills, and restructuring support agreements clause by clause when a restructuring-review matter arrives, producing risk-rated findings on waived versus reserved defaults, milestones, termination events, and releases.
metadata:
  sources:
    - path: companies/legal-operations/skills/forbearance-review-checklist/SKILL.md
      kind: local-file
      usage: vendored
      license: Apache-2.0
      attribution: PossibLaw
---

# Forbearance Review Checklist

Use this skill to run a structured, clause-by-clause review of a forbearance agreement, standstill, or restructuring support agreement from the side the issue specifies. The output is a findings table the operator or responsible attorney can act on row by row. The review organizes rights and consequences; it never decides whether any provision is enforceable.

## Review Steps

1. Scope intake. Record the agreement under review and its type (forbearance, standstill, or restructuring support agreement), the client's side as stated (for example lender or borrower; company or supporting creditor), the underlying credit or debt documents supplied, the governing law as stated, and any sections the operator excluded. If the agreement, the client's side, or the review scope is absent and no acceptable default applies, gate with `missing-info-gate` instead of guessing.
2. Build the clause inventory. Locate and list each of the following, noting any that are absent:
   - Recitals and acknowledgments — stated debt amounts, default acknowledgments, and lien- or claim-validity admissions
   - Defaults waived versus reserved — the explicit list of defaults forborne or waived, the rights-reservation language, and the treatment of unknown or future defaults; ambiguity between waiver and reservation is a finding, not a footnote
   - Forbearance or standstill period — duration, extension mechanics, and conditions
   - Milestones — each deliverable and date, and the stated consequence of missing it
   - Termination events — each trigger, whether it operates automatically or on notice, and any cure rights
   - Fees and pricing changes — forbearance fees, default-rate interest, and payment-in-kind terms as stated
   - Additional covenants and reporting — new obligations imposed during the period
   - Releases — scope, timing, parties covered and carve-outs; flag releases that extend beyond the forbearance period or the named parties
   - Amendments to underlying documents — collateral additions, guaranty reaffirmations, and document amendments bundled into the agreement
   - Support and voting obligations (restructuring support agreements) — support commitments, fiduciary outs, and party-specific termination rights
   - Remedies on termination — what springs back, what accrues, and what accelerates
   - Governing law, forum, and jury or jurisdiction provisions
3. Trace consequences. Follow every milestone and termination event to its stated consequence — what right springs back, what fee accrues, what obligation accelerates — and flag any consequence the agreement leaves unstated.
4. Rate each finding. Assign `High`, `Medium`, or `Low` risk with a one-line rationale:
   - `High`: waiver-versus-reservation ambiguity, a release broader than the period or parties, a termination event with no stated consequence, or a provision that contradicts the underlying documents as supplied.
   - `Medium`: ambiguous mechanics, materially off market-standard positions for the client's side, or missing the machinery needed to operate a clause.
   - `Low`: stylistic, minor clarity, or completeness issues.
5. Check silences. For each inventory item with no matching language, record a `[NOT FOUND]` row stating which party the silence favors.
6. Flag counsel-dependent items — enforceability of releases or prospective waivers, jurisdiction-dependent questions, interactions with insolvency proceedings — as `Counsel flag` rows and route the determination to the operator or responsible attorney. Do not resolve them in the findings.
7. Produce the findings table and summary in the format below.

## Findings Table Format

| Clause | Risk | Issue | Suggested rewrite |
|---|---|---|---|
| Clause name and section reference | High / Medium / Low | One- or two-sentence issue statement with rationale | Concrete replacement language from the client's position, or `[OPERATOR DECISION]` where the fix is a business choice |

Every `High` and `Medium` row must include a specific suggested rewrite. Append `Counsel flag` and `[NOT FOUND]` items as their own rows with the label noted in the Issue column.

## Summary and Next Actions

Close the review with:

- A scope statement restating the agreement reviewed, the client's side, and the documents supplied.
- Finding counts by risk level and the count of counsel flags.
- Missing clauses from the inventory and which party each absence favors.
- Sections not reviewed and why.
- A short ordered list of next actions for the operator, starting with `High` findings.

## Boundaries

- Do not opine on enforceability, predict how a court would rule, or give jurisdiction-specific advice as settled; flag and route those determinations.
- Do not give insolvency or restructuring strategy advice; strategy questions route to the operator or responsible attorney.
- Do not rewrite the source agreement directly; deliver findings and suggested rewrites for operator decision.
- Do not transmit the agreement or the review to a counterparty, court, or any other external party or system; the review is a work product pending operator approval.
