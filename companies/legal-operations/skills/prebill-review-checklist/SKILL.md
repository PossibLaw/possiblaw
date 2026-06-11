---
name: prebill-review-checklist
description: Review draft prebills entry by entry before client invoicing when a prebill-review matter arrives, producing an edit-recommendation table covering narrative hygiene, privilege leakage, billing-guideline compliance, duplicates, and write-down candidates.
metadata:
  sources:
    - path: companies/legal-operations/skills/prebill-review-checklist/SKILL.md
      kind: local-file
      usage: vendored
      license: Apache-2.0
      attribution: PossibLaw
---

# Prebill Review Checklist

Use this skill to review a draft prebill before it becomes a client invoice. The output is an edit-recommendation table the billing partner or operator can act on row by row. The review recommends edits; it never applies them, finalizes an invoice, or sends anything to a client.

## Review Steps

1. Scope intake. Record the prebill under review, the client and matter, the billing period, the timekeepers and their approved rates, and any outside-counsel billing guidelines supplied with the issue. If the prebill itself is absent and no acceptable default applies, gate with `missing-info-gate` instead of guessing. If no billing guidelines were supplied, note `[NO GUIDELINES SUPPLIED]` and run the baseline checks only.
2. Narrative hygiene pass. Read every entry and flag:
   - Vague narratives that do not describe the work (for example "attention to file", "work on matter", "review documents").
   - Block-billed entries that combine multiple distinct tasks into one time amount.
   - Clerical or administrative tasks billed at attorney rates.
   - Internal shorthand, transient notes, or tone unsuitable for a client-facing invoice.
3. Privilege and confidentiality pass. Flag narratives that would reveal privileged or sensitive content on an invoice — legal strategy, the substance of attorney-client communications, witness identities, settlement positions, or investigation targets — and recommend a neutral rewording for each.
4. Guideline-compliance pass. Where billing guidelines were supplied, check each entry against them: staffing and timekeeper-level restrictions, non-billable task categories (for example intra-office conferences or training), travel-time caps, billing-increment and rounding rules, and billed rates versus approved rates. Cite the guideline provision in each finding.
5. Duplicate and consistency pass. Flag duplicate or near-duplicate entries, the same task billed by multiple timekeepers without explanation, entries dated outside the billing period, and arithmetic that does not tie (hours times rate versus amount).
6. Write-down candidate pass. Flag entries where the hours appear excessive for the described task, time attributable to training or timekeeper turnover, and rework of the firm's own deliverables. Frame each as a candidate for the billing partner's decision, not as a decided write-down.
7. Produce the edit-recommendation table and summary in the format below.

## Edit-Recommendation Table Format

| Entry (date / timekeeper) | Issue type | Severity | Issue | Recommended edit |
|---|---|---|---|---|
| Entry date and timekeeper initials or name | Narrative / Privilege / Guideline / Duplicate / Write-down candidate | High / Medium / Low | One- or two-sentence issue statement, citing the guideline provision where applicable | Concrete replacement narrative, correction, or `[BILLING PARTNER DECISION]` where the fix is a judgment call |

Rate privilege-leakage findings `High`. Every `High` and `Medium` row must include a specific recommended edit.

## Summary and Next Actions

Close the review with:

- Finding counts by issue type and severity.
- The list of entries flagged as write-down candidates, without computing a final adjusted invoice total — amount decisions belong to the billing partner.
- Entries or pages not reviewed and why.
- A short ordered list of next actions for the operator, starting with privilege-leakage findings.

## Boundaries

- Do not edit the prebill or any billing-system record directly; deliver recommendations for the billing partner's decision.
- Do not finalize, approve, send, or submit an invoice, and do not compute a final adjusted invoice total.
- Do not opine on the legal sufficiency of privilege protection; flag the narrative and route the determination to the operator or responsible attorney.
- Do not transmit the prebill or the review to any external party or system; the review is a work product pending operator approval.
