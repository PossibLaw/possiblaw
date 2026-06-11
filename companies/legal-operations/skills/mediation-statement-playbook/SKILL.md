---
name: mediation-statement-playbook
description: Draft a confidential mediation statement when a mediation-preparation matter arrives, producing a case overview, key facts, damages summary, and settlement-posture placeholders as an internal work product that is never transmitted.
metadata:
  sources:
    - path: companies/legal-operations/skills/mediation-statement-playbook/SKILL.md
      kind: local-file
      usage: vendored
      license: Apache-2.0
      attribution: PossibLaw
---

# Mediation Statement Playbook

Use this skill to draft a confidential mediation statement preparing the company's position for a scheduled or contemplated mediation. Every draft is an internal work product requiring explicit operator approval before any use; the statement is never transmitted to a mediator, opposing party, or anyone outside the company.

## Drafting Steps

1. Gather from the issue: the parties, the mediator if named, the mediation date if set, the claims and defenses, operator-confirmed key facts, claimed damages amounts as stated, settlement history if any, and any recorded settlement authority. If the dispute description or the claims in play are absent and no acceptable default applies, gate with `missing-info-gate` instead of guessing.
2. Open the document with the confidentiality header: `CONFIDENTIAL MEDIATION STATEMENT — PREPARED FOR MEDIATION PURPOSES ONLY — NOT FOR FILING OR SERVICE`, followed by the case caption placeholder, the mediator placeholder, and the mediation date placeholder.
3. Draft the body sections in order:
   - Introduction: the parties, the submitting party, and the dispute in two or three sentences.
   - Case overview: the claims and defenses as stated, the procedural posture, and key upcoming events recorded verbatim from the issue with stated dates flagged `OPERATOR FOLLOW-UP: confirm with licensed counsel`.
   - Key facts: operator-confirmed facts only, presented persuasively but accurately, with `[OPERATOR TO CONFIRM FACT]` marking anything unconfirmed; never assert a fact the operator has not confirmed.
   - Damages summary: each claimed category and amount organized as stated in the issue with its source noted; organize and total stated figures only, and mark any valuation or exposure assessment `[OPERATOR/ATTORNEY ASSESSMENT]` — never compute final liability or exposure yourself.
   - Settlement history: prior demands, offers, and responses exactly as recorded in the issue, or `None stated`.
   - Settlement posture: `[SETTLEMENT POSTURE — REQUIRES OPERATOR AUTHORITY]` placeholders for opening position, target, and walk-away unless operator-provided authority is recorded in the issue; operator silence is not authority.
   - Relief and logistics: what the company seeks from mediation and attendance or authority logistics as placeholders.
4. Apply the tone rules below, then produce the `Assumptions and open items` section.

## Tone Rules

- Persuasive but factual: present the company's position confidently while staying within operator-confirmed facts.
- No insults, sarcasm, or inflammatory characterizations of the opposing party, its counsel, or the mediator.
- Frame strengths as supported positions, never as predictions of how a court, jury, or arbitrator would rule.
- Acknowledge weaknesses only when the operator has directed candor with the mediator, and mark that section `[OPERATOR DECISION: include candid weaknesses]`.

## Defaults

| Field | Default |
|---|---|
| Caption and case number | `[CAPTION]` and `[CASE NUMBER]` placeholders |
| Mediator | `[MEDIATOR NAME]` placeholder |
| Mediation date | `[MEDIATION DATE]` placeholder |
| Key facts | Operator-confirmed facts only, with `[OPERATOR TO CONFIRM FACT]` for gaps |
| Damages figures | Claimed amounts as stated in the issue, with `[DAMAGES — OPERATOR TO SUPPLY]` for gaps |
| Settlement posture | `[SETTLEMENT POSTURE — REQUIRES OPERATOR AUTHORITY]`; issue marked blocked until authority is recorded |
| Tone | Persuasive but factual; candid-weaknesses section only on operator instruction |

## Output Format

A single well-structured markdown document:

1. The confidentiality header block.
2. An `Assumptions and open items` section listing every placeholder, default used, flagged date, and operator follow-up.
3. The body sections in the order above, complete enough that the operator can finalize by resolving placeholders rather than restructuring.

## Boundaries

- Never transmit the statement to a mediator, mediation service, opposing party, opposing counsel, or any external party or system; it is an internal work product pending operator approval.
- Do not state or imply a settlement amount, willingness, or range without explicit operator-provided authority recorded in the issue.
- Do not predict how a court, jury, or arbitrator would rule, assess claim merit or settlement value, or compute final liability or exposure; organize stated figures and route assessments to the operator or responsible attorney.
