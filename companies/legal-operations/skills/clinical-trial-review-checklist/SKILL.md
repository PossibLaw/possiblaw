---
name: clinical-trial-review-checklist
description: Review a clinical trial agreement clause by clause when a CTA review matter arrives, producing risk-rated findings with suggested rewrites for publication rights, IP and inventions, subject injury, indemnification, data ownership, and termination.
metadata:
  sources:
    - path: companies/legal-operations/skills/clinical-trial-review-checklist/SKILL.md
      kind: local-file
      usage: vendored
      license: Apache-2.0
      attribution: PossibLaw
---

# Clinical Trial Review Checklist

Use this skill to run a structured, clause-by-clause review of a clinical trial agreement from the side the issue specifies — sponsor, site or institution, or investigator. The output is a findings table the operator or responsible healthcare counsel can act on row by row. The review covers contract language only; it makes no medical, scientific, or regulatory judgments.

## Review Steps

1. Scope and side intake. Record the agreement under review, the instructed side, the study reference as stated, the documents supplied (protocol, budget exhibits, informed-consent form if provided), the governing law as stated, and any sections the operator excluded. If the agreement or the side instruction is absent and no acceptable default applies, gate with `missing-info-gate` instead of guessing; the review posture depends on the side.
2. Build the clause inventory. Locate and list each of the following, noting any that are absent:
   - Publication rights — who may publish, sponsor review windows, deletion or delay rights, multi-site publication priority, and whether the rights amount to indefinite suppression
   - IP and inventions — ownership of study inventions versus background IP, assignment mechanics, license-backs, and improvements to sponsor compounds or devices
   - Subject injury — who pays for the diagnosis and treatment of study-related injury, conditions and carve-outs (for example protocol noncompliance), and how the clause interacts with the informed-consent language
   - Indemnification — scope, mutual versus one-way, carve-outs for negligence and protocol deviation, defense control, and insurance requirements backing the obligations
   - Data ownership and use — study data versus medical records, sponsor use rights, site and investigator use rights, de-identified data, and biospecimens
   - Confidentiality — term, scope, and carve-outs for patient safety, regulatory disclosure, and publication
   - Regulatory responsibilities — sponsor and site obligations as allocated, audit and inspection cooperation, and safety-reporting duties as stated
   - Budget and payment — payment triggers, holdbacks, non-refundable startup amounts, and payment on early termination
   - Termination — termination rights for each party, subject-safety wind-down obligations, data and document handover, and surviving provisions
   - Record retention — retention periods recorded as stated, marked `[VERIFY — COUNSEL]` where the agreement ties them to regulatory requirements
3. Rate each clause from the instructed side's posture. Assign `High`, `Medium`, or `Low` risk with a one-line rationale:
   - `High`: the agreement is silent or one-sided on subject injury or indemnification, publication rights permit indefinite suppression, or data and IP ownership provisions contradict each other.
   - `Medium`: ambiguous allocations, materially off market-standard positions, or missing the mechanics needed to operate the clause.
   - `Low`: stylistic, minor clarity, or completeness issues.
4. Trace the protection chain. Check the subject-injury, indemnification, and insurance provisions against each other; a carve-out in one that swallows the protection of another is a finding, not a footnote.
5. Check silences. For each inventory item with no matching language, record a `[NOT FOUND]` row stating which party the silence favors.
6. Flag counsel-dependent items — consistency with the informed-consent form, regulatory-responsibility allocation, insurance sufficiency, enforceability questions — as `Counsel flag` rows and route the determination to the operator or responsible healthcare counsel. Do not resolve them in the findings.
7. Produce the findings table and summary in the format below.

## Findings Table Format

| Clause | Risk | Issue | Suggested rewrite |
|---|---|---|---|
| Clause name and section reference | High / Medium / Low | One- or two-sentence issue statement with rationale | Concrete replacement language from the instructed side's position, or `[OPERATOR DECISION]` where the fix is a business choice |

Every `High` and `Medium` row must include a specific suggested rewrite. Append `Counsel flag` and `[NOT FOUND]` items as their own rows with the label noted in the Issue column.

## Summary and Next Actions

Close the review with:

- Finding counts by risk level and the count of counsel flags.
- Missing clauses from the inventory and which party each absence favors.
- Sections not reviewed and why.
- A short ordered list of next actions for the operator, starting with `High` findings.

## Boundaries

- Do not opine on enforceability, predict how a court or regulator would rule, or give jurisdiction-specific advice as settled; flag and route those determinations.
- Do not make medical, scientific, or study-conduct judgments; the review covers contract language only.
- Do not rewrite the source agreement directly; deliver findings and suggested rewrites for operator decision.
- Do not transmit the agreement or the review to any external party or system; the review is a work product pending operator approval.
