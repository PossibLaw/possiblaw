---
name: regulatory-filing-playbook
description: Draft license applications, renewals, registrations, and regulator correspondence as internal work products when a regulatory-filing matter arrives, with official-form placeholders and stated deadlines flagged as operator follow-ups.
metadata:
  sources:
    - path: companies/legal-operations/skills/regulatory-filing-playbook/SKILL.md
      kind: local-file
      usage: vendored
      license: Apache-2.0
      attribution: PossibLaw
---

# Regulatory Filing Playbook

Use this skill to draft license applications, renewal filings, registration packages, and regulator correspondence. Every output is an internal draft for operator or licensed-counsel action: nothing is ever submitted or transmitted to a regulator or government portal, and no deadline is ever computed or certified.

## When To Invoke

- The issue requests a new license application, renewal, registration, notice, or report addressed to a regulator or agency.
- The issue requests correspondence with a regulator — status inquiries, deficiency responses, or information requests — as internal drafts for operator review.
- Do not invoke for compliance-policy review or regulatory-change intake; those belong to other specialists in the regulatory practice.

## Required Inputs

Gather these facts from the issue before drafting. If a required input is absent and no acceptable default applies, gate with `missing-info-gate`; otherwise apply the drafting agent's defaults and record each default used.

1. **Entity** — the legal name and form of the filing entity.
2. **Regulator** — the agency or body the draft is addressed to, with its jurisdiction.
3. **License or registration type** — the specific authorization sought, renewed, or maintained, as the operator states it.
4. **Jurisdiction** — where the filing applies.
5. **Prior filings** — the most recent prior application, renewal, or report this draft should reference, when one exists.
6. **Stated deadlines** — any deadline the source materials state, recorded exactly as stated and flagged as an operator follow-up; never computed, extended, or confirmed.

## Draft Structure

### Applications, Renewals, and Registrations

Draft in this order: cover summary identifying the entity, regulator, authorization type, and jurisdiction; entity background facts as supplied; responses organized by the regulator's expected subject areas (ownership and control, financial condition, business plan or activities, compliance program, personnel), each populated only from supplied facts; exhibits list with `[NOT PROVIDED]` placeholders for missing items; an `Assumptions and open items` section listing every placeholder, default used, and operator follow-up; signature block placeholders with no certification language unless the operator supplies the exact required text.

### Regulator Correspondence

Draft in this order: addressee block with `[REGULATOR CONTACT]` placeholders where unknown; reference line citing the matter, license, or file number as supplied; body stating the purpose, the facts as supplied, and the specific request or response; closing with signatory placeholders. Keep the tone factual, respectful, and concise; make no representations beyond supplied facts, no commitments to deadlines, and no characterizations of the entity's compliance status.

## Official-Form Placeholder Rules

- Many regulators prescribe official forms or portal questionnaires. Never fabricate, reconstruct, or approximate official form text, form numbers, question numbering, field names, fee amounts, or certification language.
- Where an official form applies, produce an internal preparation sheet instead: a markdown document headed `[OFFICIAL FORM: <regulator> <form/portal> — obtain the current form from the regulator; this sheet is preparation material, not the form]`, listing each expected subject area and the value to enter or its placeholder.
- Never state filing fees, processing times, or portal procedures as fact; record them as `[CONFIRM WITH REGULATOR]`.

## Escalation Triggers

Stop drafting the affected element, name the trigger in a durable comment, and route the decision to `chief-counsel` immediately when the issue involves:

- Enforcement contact, an examination, an investigation, or a subpoena.
- An admission, certification, or attestation of past compliance or non-compliance.
- A self-report or disclosure of a suspected violation.
- Any request to submit, e-file, or upload a document to a regulator on the company's behalf.

## Output Format

- A single well-structured markdown document per requested filing or letter: title, date line, body sections in the order above, and signature placeholders.
- A short `Assumptions and open items` section before the document body listing every placeholder, default used, official-form placeholder, stated-deadline flag, and operator follow-up.
- Preserve operator-specified names, figures, dates, and license identifiers exactly as given.

## Boundaries

- Do not submit, transmit, e-file, or upload anything to any regulator, agency, or government portal; every output is an internal draft for operator or licensed-counsel action.
- Do not compute filing deadlines, advise whether a filing obligation applies, or certify the accuracy or completeness of any filing content.
- Do not state or imply that the entity is or will be in compliance once a filing is made.
