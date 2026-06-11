---
name: healthcare-compliance-checklist
description: Screen a proposed healthcare arrangement for Stark, Anti-Kickback, and fee-splitting red flags when a compliance-review matter arrives, producing a risk-rated findings table that routes every issue to the operator or responsible healthcare counsel without concluding legality.
metadata:
  sources:
    - path: companies/legal-operations/skills/healthcare-compliance-checklist/SKILL.md
      kind: local-file
      usage: vendored
      license: Apache-2.0
      attribution: PossibLaw
---

# Healthcare Compliance Checklist

Use this skill to run a structured red-flag screen of a proposed arrangement — physician compensation, a referral relationship, a marketing arrangement, or a similar deal. The output is a findings table of flags and questions for the operator or responsible healthcare counsel. The screen surfaces fact patterns; it never concludes that an arrangement is legal or illegal.

## Screen Steps

1. Scope intake. Record the arrangement described, the parties and their roles as stated — including who is a referral source and who bills federal health programs, as stated — the compensation terms, the documents supplied, and any categories the operator excluded. If the arrangement description, the parties, or the compensation terms are absent and no acceptable default applies, gate with `missing-info-gate` instead of guessing.
2. Build the arrangement-fact inventory. Record, exactly as stated: the parties and their relationships; the services or items exchanged; the compensation amount, methodology, and timing; any referral streams described; federal health-program involvement; whether a written, signed agreement exists; and the arrangement's duration.
3. Run the red-flag screen by category, in order. For each category, record every matching fact pattern as a flag with the question counsel must resolve; record `No flag identified on stated facts` when nothing matches; record a missing-facts finding when the facts needed for the category are absent.
   - **Compensation red flags** — compensation that varies with the volume or value of referrals; per-referral, per-patient, or percentage-based compensation; compensation not set in advance or adjustable mid-term; stated indicators that compensation may be above or below fair market value (fair-market-value itself is a counsel determination, never an output of this screen); compensation for services not documented or not performed.
   - **Referral-relationship red flags** — a financial relationship between a referral source and an entity billing for the referred services; ownership or investment interests held by referral sources; space or equipment rentals with terms tied to referral usage; medical directorships or call coverage without documented duties or time records.
   - **Marketing-arrangement red flags** — payments per lead, per patient, or per booked referral; gifts, payments, or other inducements to patients or referral sources; routine waivers of copays or deductibles as stated; marketing compensation tied to revenue from referred federal health-program business.
   - **Fee-splitting and corporate-practice red flags** — professional-fee sharing with unlicensed persons or entities as stated; management or services fees calculated as a percentage of professional revenue; lay control over professional judgment as described.
   - **Documentation red flags** — no written agreement; an unsigned or expired agreement; terms in practice that do not match the written terms as stated; missing exhibits that define services or compensation.
4. Rate each flag:
   - `High`: a fact pattern that commonly requires restructuring or counsel sign-off before proceeding — for example compensation varying with referrals, per-referral marketing payments, or fee sharing with unlicensed entities as stated.
   - `Medium`: ambiguous facts, undocumented terms, or indicators that need counsel evaluation before the category can be assessed.
   - `Low`: documentation hygiene or clarity issues not suggesting a structural problem.
   Give a one-line rationale for every rating.
5. Add `Counsel flag` rows for safe harbors or exceptions commonly considered for the fact pattern — name the category for counsel to evaluate; never conclude that one applies or is satisfied.
6. Produce the findings table and summary in the format below.

## Findings Table Format

| Category | Risk | Red flag | Question for counsel |
|---|---|---|---|
| Compensation / Referral relationship / Marketing / Fee-splitting / Documentation | High / Medium / Low | The fact pattern as stated and why it raises a flag | The specific question the operator or responsible healthcare counsel must resolve |

Sort `High` findings first. Append `Counsel flag` rows and missing-facts findings as their own rows with the label noted in the Red flag column.

## Summary and Next Actions

Close the screen with:

- Finding counts by risk level and by category, plus the count of counsel flags.
- Facts still needed to complete any category screen.
- An ordered list of next actions naming the operator or responsible healthcare counsel as the actor, starting with `High` findings.

## Boundaries

- Do not conclude that an arrangement satisfies or violates Stark, the Anti-Kickback Statute, state fee-splitting or corporate-practice rules, or any safe harbor or exception; every legal determination routes to the operator or responsible healthcare counsel.
- Do not opine on how a regulator or court would treat the arrangement or give jurisdiction-specific advice as settled.
- Do not determine fair market value or commercial reasonableness; record stated indicators and route the determination to counsel.
- Do not propose restructured deal terms as resolved; alternatives are flags for counsel, not recommendations.
- Do not transmit the screen, the arrangement documents, or any disclosure to a regulator, counterparty, or any other external party or system; the screen is a work product pending operator approval.
