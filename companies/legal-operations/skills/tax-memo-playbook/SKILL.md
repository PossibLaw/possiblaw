---
name: tax-memo-playbook
description: Draft issue-spotting tax research memos when a tax research matter arrives, producing a question presented, statement of facts, authorities to verify, analysis framework, and open questions without concluding liability or settling a filing position.
metadata:
  sources:
    - path: companies/legal-operations/skills/tax-memo-playbook/SKILL.md
      kind: local-file
      usage: vendored
      license: Apache-2.0
      attribution: PossibLaw
---

# Tax Memo Playbook

Use this skill to draft an issue-spotting tax research memo. The memo organizes the question, the facts, the authorities that need verification, and the analytical framework — it never concludes liability, settles a filing position, or computes an amount due. Every determination is reserved for the operator or responsible tax professional.

## When To Invoke

- The issue asks a tax question, requests research on the tax treatment of a transaction or structure, or asks for framing of a potential tax position.
- The issue asks for an update or expansion of an existing tax memo with new facts or new questions.
- Do not invoke for contract tax-clause review or filing-calendar work; those belong to other tax specialists. Do not invoke to compute a liability, prepare a return, or respond to a taxing authority — those are operator and responsible-tax-professional actions.

## Drafting Steps

1. Gather facts from the issue: taxpayer name and entity type, tax type, jurisdictions as stated, tax periods or years, the transaction or position in question, amounts as stated, deadlines, and any prior advice referenced. If the question itself or the transaction cannot be identified and no acceptable default applies, gate with `missing-info-gate` instead of guessing.
2. Frame the question presented. Make each question narrow and answerable; split compound asks into separate numbered questions. A question that depends on an unstated jurisdiction or entity classification gets that dependency stated inside the question.
3. Draft the statement of facts. Use only facts from the issue, in neutral language, with `[FACT NEEDED]` placeholders for gaps that change the analysis. Do not infer facts from silence.
4. Build the authorities-to-verify table. List each statute, regulation, administrative ruling, or case that plausibly bears on each question, what it bears on, and a `Verification status` of `Unverified`. Never fabricate an authority, never assume an authority's current text or status, and never present an authority as controlling until the operator or a citation check confirms it.
5. Draft the analysis framework per question: the applicable tests, elements, or factors; the arguments each way; which facts or authorities would change the picture; and where the analysis turns on jurisdiction or entity classification. Frame everything as a framework to be verified, not a conclusion.
6. List open questions and reserved determinations: every conclusion, election, characterization, filing position, and computation that belongs to the operator or responsible tax professional. This section is mandatory and is never empty.
7. Apply defaults. Fill every remaining gap from the defaults table in the drafting agent's instructions, and list each default used.
8. Produce the output in the format below.

## Output Format

A single well-structured markdown memo, in this order:

1. Header: matter reference, `[MEMO DATE]` or stated date, prepared-for line naming the operator and responsible tax professional.
2. Question(s) presented — numbered.
3. Statement of facts.
4. Authorities to verify — a table with columns `Authority`, `Type`, `Bears on`, `Verification status`.
5. Analysis framework — one subsection per question.
6. Open questions and reserved determinations.
7. Assumptions and defaults used — every placeholder and default, listed.

## Escalation Triggers

- The issue describes a notice, audit, examination, or inquiry from a taxing authority: flag for `chief-counsel` and the operator before drafting; response deadlines and procedure exceed this playbook's scope.
- The issue asks for a liability amount, a return position to file, or a signature on anything: route to the operator or responsible tax professional as a reserved determination.
- The analysis appears to depend on a treaty, a pending law change, or an election with a deadline: state the dependency, flag the deadline, and route the determination.

## Boundaries

- Do not conclude tax liability, settle a filing position, or present any tax treatment as settled; the memo frames issues for the operator or responsible tax professional to determine.
- Do not give jurisdiction-specific advice as settled or predict how a court or taxing authority would rule.
- Do not compute final tax amounts; reproduce figures only as the issue states them and flag computations as operator follow-ups.
- Do not fabricate or paraphrase authorities as verified; every authority stays `Unverified` until confirmed outside this skill.
- Do not transmit the memo to any external party or system; the memo is a work product pending operator approval.
