---
name: erisa-plan-review-checklist
description: Review plan documents and summary plan descriptions provision by provision when a plan-review matter arrives, producing risk-rated findings on internal consistency, required-provision gaps, and plan-document/SPD mismatches with fiduciary and qualification flags.
metadata:
  sources:
    - path: companies/legal-operations/skills/erisa-plan-review-checklist/SKILL.md
      kind: local-file
      usage: vendored
      license: Apache-2.0
      attribution: PossibLaw
---

# ERISA Plan Review Checklist

Use this skill to run a structured, provision-by-provision review of a plan document, a summary plan description, or both side by side. The output is a findings table the operator or responsible benefits counsel can act on row by row. The review surfaces consistency problems and gaps; it makes no fiduciary or plan-qualification determinations.

## Review Steps

1. Scope intake. Record the documents under review, the plan type and plan year as stated, the plan sponsor and administrator as named in the documents, and any sections the operator excluded. If the plan document, the SPD, the plan type, or the review scope is absent and no acceptable default applies, gate with `missing-info-gate`.
2. Build the provision inventory. Locate and list each of the following, noting any that are absent; do not skip a section because it appears standard:
   - Eligibility and participation provisions.
   - Vesting provisions.
   - Benefit formula or contribution provisions.
   - Distribution and payment provisions, including forms of benefit.
   - Claims and appeals procedures.
   - Plan-administrator and named-fiduciary designations.
   - Amendment and termination provisions.
   - Definitions the operative provisions depend on (for example compensation, service, disability).
3. Run the internal-consistency check. Within each document, record provisions that contradict each other, definitions used inconsistently, and cross-references that point to missing or misnumbered sections, citing both locations for each.
4. Run the plan-document/SPD comparison. When both documents are supplied, compare them provision by provision and record every mismatch — eligibility, vesting, benefits, claims procedures, named parties, dates — as its own finding citing both locations. Record every required provision a document lacks as a gap finding; absence is a finding, not a footnote.
5. Rate each finding. Assign `High`, `Medium`, or `Low` risk with a one-line rationale:
   - `High`: a plan-document/SPD mismatch on an operative term, a missing required provision, or an internal contradiction affecting who gets what benefit.
   - `Medium`: an ambiguous or stale provision, an inconsistent definition, or a mismatch on a procedural term.
   - `Low`: stylistic, numbering, or clarity issues.
6. Flag determinations. Record fiduciary-duty questions, prohibited-transaction questions, plan-qualification questions, and correction-program decisions as flags routed to the operator or responsible benefits counsel; do not resolve them in the findings.
7. Pair every `High` and `Medium` finding with a specific suggested fix or `[OPERATOR DECISION]` marker, not just a description of the problem.
8. Produce the findings table and summary in the formats below.

## Findings Table Format

| Provision | Location(s) | Finding type | Risk | Issue | Suggested fix |
|---|---|---|---|---|---|
| Provision name | Plan document and/or SPD cite — both cites for mismatch rows | Mismatch / Gap / Internal inconsistency / Drafting issue | High / Medium / Low | One- or two-sentence issue with rationale | Concrete fix language or `[OPERATOR DECISION]` |

Fiduciary, prohibited-transaction, qualification, and correction-program items appear as their own rows with `Counsel determination` noted in the Issue column.

## Summary and Next Actions

Close the review with:

- Finding counts by risk level and by finding type.
- Fiduciary and qualification flags, listed separately from the findings counts.
- Missing provisions from the inventory and whether each should be added.
- Sections not reviewed and why.
- A short ordered list of next actions for the operator, starting with `High` findings.

## Boundaries

- Do not make fiduciary, prohibited-transaction, or plan-qualification determinations, and do not predict how a court or regulator would treat a provision; flag those questions to the operator or responsible benefits counsel.
- Do not rewrite the plan or the SPD; deliver findings and suggested fixes for operator decision.
- Do not transmit the plan, the SPD, or the review to any external party or system; the review is a work product pending operator approval.
