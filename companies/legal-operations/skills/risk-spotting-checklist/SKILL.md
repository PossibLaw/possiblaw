---
name: risk-spotting-checklist
description: Run a second-pass review over another specialist's finished work product when a risk-spotting matter arrives, producing an additive risk register of gaps the primary specialist may have missed.
metadata:
  sources:
    - path: companies/legal-operations/skills/risk-spotting-checklist/SKILL.md
      kind: local-file
      usage: vendored
      license: Apache-2.0
      attribution: PossibLaw
---

# Risk Spotting Checklist

Use this skill to run a structured second pass over a work product another specialist has already produced. The first pass found what the document says; this pass finds what the matter is still exposed to. The output is an additive risk register — advisory input for the operator and the primary specialist, never a rewrite of the work product itself.

## Review Dimensions

Work through every dimension against the primary work product and the matter context. Record findings only; skip nothing because the primary specialist "probably covered it."

1. **Cross-practice interactions** — terms or facts in the work product that implicate another practice area (for example an indemnity that touches employment classification, a license grant with privacy obligations, a separation term with tax consequences). Name the practice and the interaction.
2. **Unstated assumptions** — facts the work product depends on but never states (jurisdiction, which side the operator is on, a counterparty's solvency, an exhibit's content). Cite where the dependency shows up.
3. **Missing escalations** — items that the operator's escalation matrix or ordinary prudence would route to a more senior decision-maker but that the work product treats as settled.
4. **Deadline and follow-up gaps** — dates, notice periods, renewal windows, consideration periods, or promised follow-ups mentioned in the work product with no owner or trigger attached.
5. **Counterparty-incentive blind spots** — readings or moves a motivated counterparty could make that the work product does not address; state the incentive and the language that permits it.
6. **Scope drift** — places where the work product answers a different or broader question than the matter asked, or silently dropped part of the requested scope.

## Risk Register Table Format

Produce a markdown table with one row per finding:

| Risk | Where observed | Why it matters | Suggested owner |
|---|---|---|---|
| One-sentence risk statement | Section, row, or quote from the primary work product | Concrete consequence if unaddressed | Operator, the primary specialist, or a named lead |

Order rows worst first. If a dimension yields no findings, say so in one line below the table (for example `No cross-practice interactions identified`) so silence is never ambiguous.

## Additive-Only Rule

- Never rewrite, redline, or re-issue the primary work product; the register supplements it.
- Never restate the primary specialist's own findings as new risks; the register covers only what the first pass missed.
- Frame every row as advisory input for the operator and the primary specialist; the register decides nothing.

## Boundaries

- Do not give legal advice or predict how a court would rule on any identified risk.
- Do not grade, score, or characterize the primary specialist's overall work quality; the register is about residual risk, not performance.
- Do not transmit the register or the underlying work product to any external party or system; the register is a work product pending operator approval.
