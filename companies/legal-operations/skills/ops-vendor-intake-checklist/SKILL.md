---
name: ops-vendor-intake-checklist
description: Structure vendor-onboarding facts into an intake record when a vendor matter arrives, tiering data access, flagging contracts for legal review, and producing an intake table with gaps and follow-ups.
metadata:
  sources:
    - path: companies/legal-operations/skills/ops-vendor-intake-checklist/SKILL.md
      kind: local-file
      usage: vendored
      license: Apache-2.0
      attribution: PossibLaw
---

# Ops Vendor Intake Checklist

Use this skill to turn raw vendor-onboarding facts into a structured intake record with flagged gaps and review handoffs. Intake records facts; it never approves a vendor.

## Intake Fields

Capture these from the source issue, exactly as stated:

1. Vendor entity: full legal name, entity type, jurisdiction, and website or domain as supplied.
2. Services: what the vendor will provide, in the operator's words.
3. Business owner: who at the firm requested or will own the vendor relationship.
4. Data access level: what firm, staff, or client data the vendor will touch, tiered per the rules below.
5. Security attestations supplied: each report, certification, or questionnaire the operator says was received (for example a SOC 2 report), recorded as supplied or not supplied — never as adequate.
6. Contract status: none, draft received, under negotiation, or signed, plus where the document lives.
7. Commercials: pricing, term, and renewal facts as stated.
8. Urgency and timeline: requested start date or deadline.

Mark absent fields `[NOT PROVIDED]`; never research or contact the vendor to fill a gap.

## Data-Access Tiering

Tier the vendor by the most sensitive data it will touch:

- `Tier 1 — client or confidential data`: client matter content, privileged material, or firm-confidential data. Flag BOTH a legal review and a security review as operator follow-ups, and flag the contract for legal review regardless of status.
- `Tier 2 — internal business data`: staff personal data, finance, or internal systems without client content. Flag a security review as an operator follow-up.
- `Tier 3 — no firm data`: no meaningful data access. No mandatory flags beyond the contract rule below.

Tiering states what reviews are needed; it never concludes that a vendor is safe. When the data access level is unclear, record the tier as `[UNCONFIRMED]` and treat it as Tier 1 for flagging purposes.

## Contract Flag Rule

Whenever any vendor contract, terms of service, DPA, or order form exists or is expected, flag it for legal review as a handoff up the chain (`ops-lead` → `chief-of-staff` → `chief-counsel`). Do not summarize or assess the contract terms inside the intake record; identify the document and where it lives.

## Intake-Record Table Format

| Field | Value |
|---|---|
| Checklist field name | Value exactly as stated in the source issue, or `[NOT PROVIDED]` |

One row per intake field, in the order above, with the data-access tier and its flags as their own rows.

## Gap List and Follow-Ups

After the table, list:

- Every missing or ambiguous field, what is needed, and who can supply it.
- The legal-review handoff for any contract identified.
- The legal and security review follow-ups required by the data-access tier.
- Any other operator follow-ups, such as confirming the business owner or budget.

## Boundaries

- Never approve, reject, or recommend a vendor; record facts and flag reviews.
- Never assess the adequacy or currency of a security attestation; record it as supplied or not supplied.
- Do not contact the vendor or any external party; intake works from operator-supplied facts only.
- Do not transmit the intake record to any external party or system; the record is a work product pending operator approval.
