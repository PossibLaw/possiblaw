---
name: corporate-formation-playbook
description: Draft entity formation and governance documents when a corporate formation matter arrives, producing markdown work products with official-form placeholders and recorded defaults for missing facts.
metadata:
  sources:
    - path: companies/legal-operations/skills/corporate-formation-playbook/SKILL.md
      kind: local-file
      usage: vendored
      license: Apache-2.0
      attribution: PossibLaw
---

# Corporate Formation Playbook

Use this skill to draft entity formation and governance documents: certificate and articles preparation sheets, bylaws, LLC operating agreements, and board or shareholder resolutions and written consents. Apply the defaults in the drafting agent's instructions when the operator has not provided contrary instructions, and mark missing legal or business facts with bracket placeholders.

## When To Invoke

- The issue requests new formation or governance documents — a certificate or articles preparation sheet, bylaws, an LLC operating agreement, or board or shareholder resolutions or written consents.
- The issue requests revisions to an existing PossibLaw-drafted formation or governance document; rerun the relevant steps against the prior draft and list what changed.
- Do not invoke for governance-document review or due-diligence intake; those belong to other specialists in the corporate practice.

## Required Inputs

Gather these facts from the issue before drafting. If a required input is absent and no acceptable default applies, gate with `missing-info-gate`; otherwise apply the drafting agent's defaults and record each default used.

1. **Entity type** — corporation, LLC, or other form as the operator states it; never recommend one.
2. **Jurisdiction of formation** — the state or country where the entity will be formed.
3. **Entity name** — the exact proposed name, including the required entity designator.
4. **Registered agent** — name and address in the jurisdiction of formation.
5. **Governance structure** — board-managed corporation, member-managed LLC, or manager-managed LLC, as the operator states it.
6. **Ownership** — initial stockholders or members and their share counts, units, or percentages.
7. **Officers and directors** — names and titles for initial directors, officers, or managers.
8. **Authorized shares or units** — counts, classes, and par value if any; never invent these figures.

## Document Structures

### Bylaws

Draft sections in this order: offices; stockholders (meetings, notice, quorum, voting, action by written consent); board of directors (number, election, term, vacancies, meetings, quorum, action without a meeting); committees; officers (titles, appointment, duties, removal); stock provisions (certificates, transfers, record dates); indemnification; general provisions (fiscal year, books and records, amendments).

### LLC Operating Agreement

Draft sections in this order: formation and purpose; members and capital contributions; units or percentage interests, with `[TAX TREATMENT AND ALLOCATIONS — operator/tax-advisor follow-up]` for capital accounts and tax allocations; management (member-managed or manager-managed per the operator's choice); distributions, with tax-driven terms left as flagged placeholders; transfer restrictions; withdrawal and dissociation; dissolution and winding up; books and records; amendments; signature blocks.

### Board and Shareholder Resolutions and Written Consents

Draft in this order: title identifying the acting body and instrument type (resolutions adopted at a meeting, or action by written consent); preamble identifying the body and its authority; recitals stating the background facts the operator supplied; resolved clauses, one action per clause; an omnibus further-assurances clause; effective date; signature blocks with name, title, and date. For written consents, state the consent standard as `[UNANIMOUS/MAJORITY CONSENT — confirm against charter, bylaws, and applicable law]` unless the operator specified it.

## Official-Form Placeholder Rules

- Many jurisdictions prescribe official forms for certificates of formation or incorporation, articles of organization, and amendments. Never fabricate, reconstruct, or approximate official form text.
- Where an official form applies, produce an internal preparation sheet instead: a markdown document headed `[OFFICIAL FORM: <jurisdiction> <document> — obtain the current form from the filing office; this sheet is preparation material, not the form]`, listing each expected field and the value to enter or its placeholder.
- Where a jurisdiction permits free-form articles, draft them in markdown with required-content placeholders and flag the requirement list for operator confirmation against the filing office's current checklist.
- Never state filing fees, processing times, or filing-office procedures as fact; record them as `[CONFIRM WITH FILING OFFICE]`.

## Escalation Triggers

Stop drafting the affected element, name the trigger in a durable comment, and route the decision to the operator or `chief-counsel` when the issue involves:

- Multi-jurisdiction structures — foreign qualifications, multiple entities, or cross-border ownership.
- Regulated industries — for example banking, insurance, healthcare, or money transmission — where formation intersects a licensing regime.
- Tax elections or tax-driven structuring — for example S-corporation elections, partnership tax provisions, or profits interests.
- Any request to file, sign, or submit a document on the company's behalf.

## Output Format

- A single well-structured markdown document per requested instrument: title, date line, body sections in the order above, and signature blocks.
- A short `Assumptions and open items` section before the document body listing every placeholder, default used, official-form placeholder, and operator follow-up.
- Preserve operator-specified names, figures, dates, and special terms exactly as given.

## Boundaries

- Do not provide entity-choice, tax, or securities advice; flag those topics as operator follow-ups when they surface.
- Do not file anything with a Secretary of State or any other government office; every output is an internal draft for operator or licensed-counsel action.
- Do not transmit the document to any external party or system; the draft is a work product pending operator approval.
