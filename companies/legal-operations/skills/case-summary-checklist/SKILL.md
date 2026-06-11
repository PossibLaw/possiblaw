---
name: case-summary-checklist
description: Summarize a supplied judicial opinion into a structured case brief when a case-summarization matter arrives, producing citation, court, posture, facts, holding, reasoning, disposition, and treatment-flag sections with jurisdiction and currency verification flagged for the operator.
metadata:
  sources:
    - path: companies/legal-operations/skills/case-summary-checklist/SKILL.md
      kind: local-file
      usage: vendored
      license: Apache-2.0
      attribution: PossibLaw
---

# Case Summary Checklist

Use this skill to brief a judicial opinion whose text is in hand. Summarize only what the opinion states, record identifying fields character for character, and flag jurisdiction and currency verification as an operator follow-up in every brief. A case is never characterized as controlling, binding, or current.

## Briefing Steps

1. Confirm the opinion text in hand. Brief only from text that is operator-supplied or connector-retrieved; never reconstruct a case from memory, and never brief a case whose text could not be obtained — record the unavailable lookup instead.
2. Extract the caption and citation. Record the case name and citation exactly as the source states them, character for character.
3. Extract the court and date. Record the deciding court and decision date exactly as the source states them.
4. Extract the procedural posture. State how the case reached the deciding court — the rulings below and the question on review — as the opinion describes it.
5. Extract the facts. State the facts the opinion recites that bear on the holding; do not import facts from outside the opinion or fill gaps with inference.
6. Extract the holding. State the question the court answered and its answer, as the opinion states them; do not extend the holding beyond the question the court answered.
7. Extract the reasoning. State the court's stated grounds in the order the opinion presents them. Quote sparingly and exactly, marking every alteration and ellipsis in quoted text.
8. Extract the disposition. Record the outcome (affirmed, reversed, remanded, vacated, or as otherwise stated) exactly as the opinion states it.
9. Record the treatment flags. Record treatment signals only as they appear on the face of the supplied materials: subsequent history noted in the source, overrulings or abrogations the opinion itself mentions, splits the opinion acknowledges, and concurrences or dissents and what they would have decided.
10. Attach the verification follow-ups, in every brief: citator (currency and treatment) verification for the case and for every authority quoted from it, plus confirmation that the case's jurisdiction applies to the matter at hand. Pair any jurisdictional observation in the brief with this flag.

## Output: Case Brief

Structured sections in this order:

1. Caption and citation.
2. Court and date.
3. Procedural posture.
4. Facts.
5. Holding.
6. Reasoning.
7. Disposition.
8. Treatment flags.

## Output: Source Note

- The opinion text used (operator-supplied or the connector lookup run), with any unavailable lookups recorded rather than guessed around.

## Output: Operator Follow-Ups

- Citator verification for the case and every authority quoted from it.
- Jurisdiction-applicability confirmation for the matter at hand.

## Boundaries

- Never characterize a case as controlling, binding, current, or good law; jurisdiction and currency verification is an operator follow-up in every brief.
- Do not assess the strength of any party's position, predict outcomes, or recommend reliance on a case.
- Do not transmit a brief or the underlying opinion to any external party or system; the brief is a work product pending operator action.
