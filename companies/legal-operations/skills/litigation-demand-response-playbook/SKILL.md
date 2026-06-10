---
name: litigation-demand-response-playbook
description: Intake incoming demand letters and draft outgoing demands or responses as internal work products, with stated deadlines flagged for the operator, posture options, tone rules, and a settlement-authority gate.
metadata:
  sources:
    - path: companies/legal-operations/skills/litigation-demand-response-playbook/SKILL.md
      kind: local-file
      usage: vendored
      license: Apache-2.0
      attribution: PossibLaw
---

# Demand and Demand-Response Playbook

Use this skill to intake an incoming demand letter and draft a response, or to draft an outgoing demand letter the operator has requested. Every draft is an internal work product requiring explicit operator approval before any use. Apply the defaults below when the operator has not provided contrary instructions, and mark missing legal or business facts with bracket placeholders. Demand matters are sensitive: when the matter's `metadata.possiblaw.privacyTier` is `confidential` or `privileged`, run the `privacy-encoder` flow before any cloud-capable call and decode the final output before posting.

## When To Invoke

- The issue contains or describes a demand letter the company received and requests intake, triage, or a draft response.
- The issue requests an outgoing demand letter asserting the company's position in a dispute, or revisions to a prior PossibLaw demand draft.
- Do not invoke for cease-and-desist letters grounded in IP rights (use `legal-cease-and-desist` for that fact pattern), litigation-hold work, or docket monitoring; those belong to other skills or specialists.

## Incoming Demand Intake

Before drafting any response, extract the incoming demand into a structured intake record:

1. Parties: the demanding party, its counsel if represented, and the company entity addressed, captured exactly as stated.
2. Claims asserted: each claim or legal theory the letter states, listed verbatim or closely paraphrased with a verbatim quote of the operative sentence; do not assess merit.
3. Amounts and remedies demanded: dollar figures, conduct demanded (stop, retract, comply, pay), and any non-monetary terms, exactly as stated.
4. Stated deadlines: every date or response window the letter states, recorded verbatim and flagged as `OPERATOR FOLLOW-UP: confirm deadline and any legal effect with licensed counsel`. Never compute, extend, or validate a deadline as a legal conclusion, and never derive a limitations or cure period yourself.
5. Evidence referenced: contracts, invoices, communications, or exhibits the letter cites, and whether the company holds copies.
6. Preservation flag: note that receipt of a demand may be a litigation-hold trigger event and recommend the operator open a hold issue for `litigation-hold-drafter`; do not decide whether the duty has attached.

Post the intake record before any response draft, and cite it as the factual basis for the draft.

## Response Postures

Present the posture options below to the operator when no posture is stated, with one-line tradeoffs; draft only the posture the operator selects, or default to a request for clarification when the demand is too vague to answer substantively.

- Request for clarification: acknowledges receipt without admitting anything, asks for the specific factual and documentary basis of each claim, and reserves all rights. Lowest commitment; buys time without conceding facts.
- Substantive response: answers the demand's factual assertions point by point from operator-confirmed facts, states the company's position, and reserves all rights. Use only when the operator has confirmed the facts relied on; never assert a fact the operator has not confirmed.
- Escalation to outside counsel: a short internal memo (not a letter) recommending referral, summarizing the intake record, the apparent stakes, and the open questions outside counsel should resolve. Use when claims involve filed or imminent litigation, regulatory exposure, criminal allegations, insurance-notice questions, or amounts material to the company.

## Outgoing Demand Drafting

1. Gather facts from the issue: the counterparty, the underlying obligation or conduct, the operator-confirmed factual basis, the remedy sought, the response window the operator wants to offer, and the desired tone.
2. Draft the letter sections in order: sender and recipient blocks with placeholders, a factual background limited to operator-confirmed facts, the basis of the demand with `[SUPPORTING DOCUMENTS]` references, the specific demand and remedy, the response window as `[RESPONSE WINDOW]` unless the operator set one, a reservation-of-rights paragraph, and a signature block placeholder.
3. State consequences of non-response in conditional, non-threatening terms ("may pursue available remedies"); never threaten criminal referral or regulatory complaint to gain advantage in a civil dispute, and never state that litigation will be filed — filing decisions belong to the operator and licensed counsel.

## Tone Rules

- Default tone is measured and professional: firm on facts, free of insults, sarcasm, bluster, and inflammatory characterizations.
- Escalated tone (sharper framing, shorter response window) only on explicit operator instruction, and never beyond the conditional-consequences rule above.
- Conciliatory tone (preserving the relationship, inviting discussion) when the operator says the counterparty relationship continues.
- State the tone used and why in the completion comment when the operator did not specify one.

## Settlement-Authority Gate

Never state, imply, or draft a settlement position — an amount the company would pay or accept, a willingness to settle, a payment plan, or a release commitment — without explicit operator-provided authority recorded in the issue. If a draft needs a settlement figure and no authority exists, insert `[SETTLEMENT POSITION — REQUIRES OPERATOR AUTHORITY]`, mark the issue blocked with the operator as unblock owner, and state exactly what authority is needed. Operator silence is not authority.

## Output Format

- A single well-structured markdown document per draft: intake record, response letter, demand letter, or escalation memo, with placeholders for address blocks, signatures, and send dates.
- A short `Assumptions and open items` section before the body listing every placeholder, default, flagged deadline, tone decision, and operator follow-up.
- Preserve operator-specified names, figures, dates, and quoted demand language exactly as given.

## Boundaries

- Every draft is an internal work product requiring explicit operator approval before any use. Do not send, transmit, file, or serve any draft to the counterparty, their counsel, a court, or any external party or system, and do not draft as if it has been sent.
- Do not assess the merit, strength, or settlement value of any claim; present posture options with tradeoffs and route the decision to the operator.
- Do not compute deadlines, limitations periods, or cure periods as legal conclusions; record stated deadlines verbatim and flag them for the operator.
- For confidential or privileged matters, never send unencoded matter content to a cloud-capable model; the privacy-encoder flow is mandatory.
