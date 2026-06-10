---
name: privacy-dpa-playbook
description: Draft data processing agreements and addenda when a privacy processing matter arrives, producing a markdown work product with SCC/IDTA module placeholders and defaults for missing facts.
metadata:
  sources:
    - path: companies/legal-operations/skills/privacy-dpa-playbook/SKILL.md
      kind: local-file
      usage: vendored
      license: Apache-2.0
      attribution: PossibLaw
---

# Data Processing Agreement Playbook

Use this skill to draft a data processing agreement or addendum. Apply the defaults below when the operator has not provided contrary instructions, and mark missing legal or business facts with bracket placeholders. DPA matters are sensitive: when the matter's `metadata.possiblaw.privacyTier` is `confidential` or `privileged`, run the `privacy-encoder` flow before any cloud-capable call and decode the final output before posting.

## When To Invoke

- The issue requests a new data processing agreement or addendum, subprocessor-flowdown terms, or revisions to a prior PossibLaw DPA draft.
- Run the privacy-tier check before any other step; the encoder decision precedes fact gathering when matter content will reach a cloud-capable model.
- Do not invoke for privacy notice or policy reviews, incident intake, or commercial agreements that merely reference data protection; those belong to other specialists in the privacy practice.

## Required Inputs

Gather these facts from the issue before drafting. Gate with `missing-info-gate` only when a fact below has no acceptable default in the drafting agent's instructions:

- Parties: the legal names of the customer-side and vendor-side entities and any affiliates covered.
- Roles: which party acts as controller and which as processor for each processing activity, and whether any subprocessor or controller-to-controller relationship is involved.
- Data categories: the personal data processed, with special-category data expressly identified.
- Data-subject categories: whose data is processed (for example employees, end users, customer contacts).
- Purposes: the documented processing purposes and any prohibited uses.
- Subprocessors: the known subprocessor list and the authorization model (general or specific).
- Transfer mechanism: the cross-border transfer mechanism the parties intend to rely on, if any.
- Security measures: the technical and organizational measures annex content or its source document.
- Term: the DPA's duration and its relationship to the main services agreement.

## Drafting Steps

1. Confirm roles. State the controller and processor roles in the recitals exactly as the issue allocates them; if roles are unclear or appear to be controller-to-controller, gate rather than assume.
2. Draft the agreement structure in order:
   - Recitals and roles: parties, the main agreement the DPA attaches to or a `[MAIN AGREEMENT]` placeholder, and the controller/processor allocation.
   - Definitions: the defined terms used in the body, referring to `[APPLICABLE DATA PROTECTION LAW]` as the operator defines it; do not copy any statute's definitions verbatim.
   - Processing details: subject matter, duration, nature and purposes, data categories, and data-subject categories, set out in an annex table built from the required inputs above.
   - Processor obligations: a documented-instructions clause, confidentiality commitments for authorized personnel, and assistance-obligation placeholders.
   - Security measures: a `[SECURITY MEASURES ANNEX]` placeholder referencing the processor's documented technical and organizational measures.
   - Subprocessing: the authorization model from the issue, advance-notice and objection-window placeholders, and flowdown language requiring equivalent obligations on every subprocessor.
   - Data-subject requests: a clause routing requests to the controller with processor assistance, using `[RESPONSE WINDOW]` placeholders rather than statutory response windows.
   - Personal-data incidents: a processor duty to notify the controller without undue delay and an `[INCIDENT NOTICE WINDOW]` placeholder; do not state a statutory deadline as a number.
   - Audits: audit and information rights with an `[AUDIT MECHANISM]` placeholder for frequency and method.
   - International transfers: the transfer-mechanism placeholder per the rules below.
   - Return and deletion: an end-of-term return-or-deletion election with a `[RETENTION CARVE-OUT]` placeholder for legally required retention.
   - Term and precedence: duration tied to the main agreement and an order-of-precedence clause.
   - Signature blocks: signatory name, title, and date for each party.
3. Insert transfer-mechanism placeholders per the rules below.
4. Apply defaults. Fill every remaining gap from the defaults table in the drafting agent's instructions, and list each default used.
5. Produce the output in the format below.

## SCC/IDTA Placeholder Rules

Regulator-issued clause text is never drafted, reconstructed, or paraphrased. This covers the EU Standard Contractual Clauses, the UK International Data Transfer Agreement and UK Addendum, and any other module text published by a regulator or supervisory authority.

- Where the parties rely on the EU SCCs, insert `[EU SCC MODULE — operator to attach the official module text and complete the annexes]`, recording the module number only if the issue states it.
- Where the parties rely on the UK IDTA or UK Addendum, insert `[UK IDTA/ADDENDUM — operator to attach the official text and complete the tables]`.
- Where the transfer mechanism is unstated, insert `[TRANSFER MECHANISM — operator to confirm whether a cross-border transfer occurs and select the mechanism]`.
- Accompany every such placeholder with an operator note in `Assumptions and open items` stating that the official text must be attached from the regulator's published source before execution.

## Output Format

- A single well-structured markdown document: title, parties block, recitals, numbered sections in the order above, processing-details annex, and signature blocks.
- A short `Assumptions and open items` section before the agreement body listing every placeholder, default, SCC/IDTA module note, and operator follow-up.
- Preserve operator-specified names, data categories, dates, and special terms exactly as given.

## Escalation Triggers

Return the issue to `privacy-lead` with a durable comment when any of the following appears; do not resolve them in the draft:

- The issue asks whether a transfer mechanism is valid for a given destination or whether the DPA satisfies any regime.
- The counterparty proposes liability, indemnity, or precedence terms that override the main agreement's risk allocation.
- The processing involves special-category data at scale, children's data, or systematic monitoring, and the operator has not confirmed scope.
- The matter content appears privileged.

## Boundaries

- Do not assert that the draft satisfies GDPR, the UK GDPR, any US state privacy statute, or any other regime; compliance determinations belong to the operator or responsible attorney.
- Do not draft, reconstruct, or paraphrase regulator-issued clause text; the placeholder plus operator note is the only permitted treatment.
- Do not transmit the document to the counterparty or any external party or system; the draft is a work product pending operator approval.
- For confidential or privileged matters, never send unencoded matter content to a cloud-capable model; the privacy-encoder flow is mandatory.
