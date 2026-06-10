---
name: corporate-diligence-intake-checklist
description: Extract due-diligence document sets into a structured diligence record when a diligence-intake matter arrives, producing a document inventory, cited field table, red-flag signal log, and operator follow-up list.
metadata:
  sources:
    - path: companies/legal-operations/skills/corporate-diligence-intake-checklist/SKILL.md
      kind: local-file
      usage: vendored
      license: Apache-2.0
      attribution: PossibLaw
---

# Corporate Diligence Intake Checklist

Use this skill to turn a due-diligence document set into a structured diligence record with flagged gaps. This is mechanical extraction and structuring: every value carries a source cite, every signal is a cited observation, and every action item is an operator follow-up. No deal conclusions, valuations, or materiality judgments.

## Privacy Gate

Diligence materials are confidential by default. When the matter is marked `metadata.possiblaw.privacyTier: confidential` or `privileged`, run the `privacy-encoder` flow before any cloud-capable call and decode the final output before posting, exactly as that skill defines.

## Field List

Capture each field exactly as the source documents state it, with a document name and section cite for every value. Mark absent fields `[NOT PROVIDED]`.

1. **Entity facts** — legal name, entity type, jurisdiction of formation, formation date, good-standing evidence supplied, registered agent.
2. **Organizational documents** — charter or articles (as amended), bylaws or operating agreement, equity incentive plans, stockholder or member agreements.
3. **Capitalization** — authorized and outstanding shares or units by class, option and warrant overhang, convertible instruments, the cap table as supplied, and any side letters.
4. **Material contracts** — title, parties, effective date, term, renewal mechanics, exclusivity, and termination rights, one row per contract.
5. **Change-of-control and assignment provisions** — record change-of-control, anti-assignment, and consent-to-assignment provisions verbatim with the document name and section cite.
6. **Consents required** — every third-party or governmental consent the documents condition the transaction on, with its source cite.
7. **Litigation and disputes** — pending or threatened matters as disclosed, with the disclosing document cited.
8. **Indebtedness and liens** — credit agreements, guarantees, and lien disclosures as stated; note where lien searches would confirm.
9. **Intellectual property** — registered IP schedules, assignment chains, and license grants as disclosed.
10. **Employment and benefits** — key-employee agreements, severance and change-of-control benefits, and plan documents as supplied.

## Document Inventory Format

| Document | Source / location | Date | Review status | Notes |
|---|---|---|---|---|
| Document title as supplied | Data-room path or issue attachment | Document date or `[UNDATED]` | Reviewed / Partially reviewed / Listed only | One-line note, including privileged-stop notes |

List every document received, including documents recorded but not extracted from.

## Red-Flag Signals

Record each of the following as a cited observation when it appears; never score, weigh, or characterize signals as conclusions:

- Cap table and instruments disagree on counts, classes, or holders (record both statements).
- Missing amendments referenced by other documents.
- Change-of-control or anti-assignment provisions in material contracts.
- Consents required from counterparties or government bodies.
- Expired, undated, or unsigned instruments in the chain.
- Disclosed litigation, investigations, or regulator correspondence.
- Guarantee or lien language without corresponding disclosure elsewhere.

## Privileged-Document Rule

If a document appears privileged — counsel communications, legal-advice memos, litigation strategy — stop extracting from it, record only its existence and source in the document inventory, and escalate to `chief-counsel` in a durable comment.

## Gap List and Operator Follow-Ups

Close the record with:

- Gap list — every missing or ambiguous item, why it matters, and who can supply it.
- Operator follow-ups — actions for the operator to commission (for example lien searches, good-standing certificates, consent outreach), framed as requests; never perform or promise the follow-up.

## Boundaries

- Do not state deal conclusions, valuations, materiality judgments, or deal/no-deal views.
- Do not transmit the record or any underlying document to any external party or system; the record is a work product pending operator approval.
- Route registrability, enforceability, and compliance questions to the operator or responsible attorney as follow-ups.
