---
name: bd-proposal-playbook
description: Draft complete pitches, proposals, RFP responses, and capability statements from operator-supplied facts when a business-development matter arrives, producing a markdown work product with placeholders for anything not supplied.
metadata:
  sources:
    - path: companies/legal-operations/skills/bd-proposal-playbook/SKILL.md
      kind: local-file
      usage: vendored
      license: Apache-2.0
      attribution: PossibLaw
---

# BD Proposal Playbook

Use this skill to draft a pitch, proposal, RFP response, or capability statement. Every substantive claim about the firm comes from operator-supplied facts; everything not supplied becomes a bracket placeholder. The draft is a work product that is never sent to the prospect.

## Required Inputs

Gather these from the issue before drafting; each is an operator-supplied fact, never inferred:

1. Prospect: name, organization, contact, and how the opportunity arose.
2. Scope: the services requested or proposed, the operator's stated objective, and any exclusions.
3. Team: the people the operator intends to staff, with the bios and credentials the operator supplied.
4. Pricing: the fee structure and amounts the operator supplied, with any alternative-fee notes.
5. Format constraints: RFP question lists, page limits, required sections, and submission deadlines where stated.

Where an input is missing, insert its placeholder and continue; gate with `missing-info-gate` only when the gap blocks the document entirely (for example no scope of any kind).

## Conflicts-Check Reminder

Before any pitch that names a counterparty or adverse party, a conflicts check is a prerequisite. Surface it as an operator follow-up routed via `bd-lead` to `chief-of-staff`, so the legal practice can run `legal-conflicts-check` before the pitch proceeds. Do not run the conflicts check inside the BD practice, and do not treat its absence as a drafting blocker — flag it prominently in the open items instead.

## Proposal Structure

Draft the required sections in order, adapting to any RFP-mandated format:

1. Cover note or executive summary: the prospect's need, the proposed response, and why this firm — using only supplied facts.
2. Understanding of the need: the prospect's situation as the operator described it; do not speculate about the prospect's legal position.
3. Scope of services: the work proposed, deliverables, and exclusions, with `[SCOPE OF SERVICES]` placeholders for unspecified portions.
4. Approach and staffing: how the work will run and who will do it, with `[TEAM MEMBER — name, role, bio]` placeholders for unsupplied bios.
5. Relevant experience: only operator-supplied matters and credentials, anonymized as the operator directs; otherwise `[REPRESENTATIVE EXPERIENCE]`.
6. Pricing: only operator-supplied fees; otherwise `[PRICING — fee structure and amounts]`.
7. References: only operator-supplied and operator-approved references; otherwise `[REFERENCES — supplied and approved by operator]`.
8. Assumptions, conflicts note, and next steps: every placeholder and default used, the conflicts-check follow-up where applicable, and the single next step the operator should take.

## No-Invented-Credentials Rule

Never invent or embellish experience, representative matters, credentials, bar admissions, rankings, metrics, testimonials, or references — not even plausible-sounding ones. A placeholder is always the correct substitute for a missing fact. Remove unsupported superlatives unless the operator supplied evidence behind them.

## Output Format

- A single well-structured markdown document in the order above, or in the RFP-mandated order when one is supplied.
- A short `Assumptions and open items` section before the body listing every placeholder, default, conflicts-check follow-up, and operator follow-up.
- Preserve operator-specified names, figures, dates, and special terms exactly as given.

## Never-Send Rule

The draft is a work product gated on operator approval. Do not send, transmit, upload, or submit the document to the prospect, a procurement portal, an RFP system, or any other external party or system; if asked, refuse and mark the issue blocked pending operator approval.

## Boundaries

- Do not give legal advice inside a proposal or characterize the prospect's legal position.
- Do not commit the firm to fees, staffing, timelines, or outcomes beyond operator-supplied facts.
- Do not contact the prospect or any third party to fill gaps; gaps become placeholders and operator follow-ups.
