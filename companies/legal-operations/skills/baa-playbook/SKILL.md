---
name: baa-playbook
description: Draft business associate agreements and subcontractor BAAs when a BAA matter arrives, producing a complete markdown agreement with timing placeholders and defaults for missing facts.
metadata:
  sources:
    - path: companies/legal-operations/skills/baa-playbook/SKILL.md
      kind: local-file
      usage: vendored
      license: Apache-2.0
      attribution: PossibLaw
---

# Business Associate Agreement Playbook

Use this skill to draft a business associate agreement, a subcontractor BAA, or revisions to a prior PossibLaw BAA draft. Apply the drafting agent's defaults when the operator has not provided contrary instructions, and mark missing legal or business facts with bracket placeholders. The draft organizes obligations; whether it satisfies any privacy law is a determination for the operator or responsible healthcare counsel.

## Required Inputs

Gather these facts from the issue before drafting. Gate with `missing-info-gate` only when a fact below has no acceptable default in the drafting agent's instructions:

- Parties: the covered entity and business associate — or, for a subcontractor BAA, the business associate and subcontractor — exactly as the issue allocates the roles. If the chain of roles is unclear, gate rather than assume.
- Underlying agreement: the services agreement the BAA attaches to or supports.
- Services: the functions or services involving protected health information.
- Information categories: the protected health information categories as stated, including any electronic-only scope.
- Subcontractors: known subcontractors and whether flowdown agreements exist.
- Term: the BAA's duration and its relationship to the underlying agreement.

## Drafting Steps

1. Confirm roles. State the covered entity, business associate, and (where applicable) subcontractor roles in the recitals exactly as the issue allocates them.
2. Draft the agreement structure in order:
   - Title, parties block, and recitals: the parties, their roles, and the `[UNDERLYING AGREEMENT]` reference.
   - Definitions reference: a clause giving defined terms the meanings in the applicable privacy regulations as the operator's counsel confirms; do not reproduce regulatory definitions verbatim.
   - Permitted uses and disclosures: limited to the services under the underlying agreement, with a minimum-necessary commitment placeholder; list any additional permitted uses only as the issue states them.
   - Prohibited uses: uses and disclosures outside the permitted scope, with sale and marketing limitations framed as placeholders for counsel confirmation.
   - Safeguards: a `[SAFEGUARDS DESCRIPTION]` placeholder referencing the business associate's documented administrative, physical, and technical safeguards.
   - Reporting and breach notice: a duty to report security incidents, breaches, and impermissible uses or disclosures with a `[BREACH NOTICE WINDOW]` placeholder per the timing rules below.
   - Subcontractors: flowdown language requiring equivalent obligations on every subcontractor, with an advance-notice placeholder.
   - Individual-rights assistance: assistance with access, amendment, and accounting requests using `[RESPONSE WINDOW]` placeholders.
   - Covered entity obligations: notice-of-privacy-practices, restriction, and permission-change notifications as stated or as placeholders.
   - Regulator-access clause: books-and-records availability to the regulator for compliance determination purposes.
   - Term and termination: the term per the defaults, termination for material breach with a cure-period placeholder.
   - Return or destruction: return or destroy at termination with a `[RETENTION CARVE-OUT]` placeholder for legally required retention, and survival of obligations for retained information.
   - Order of precedence: how the BAA interacts with the underlying agreement.
   - Signature blocks: signatory name, title, and date for each party.
3. For a subcontractor BAA, keep the same structure with the upstream business associate in the covered-party position and the subcontractor undertaking the equivalent obligations; say so in the recitals.
4. Apply defaults. Fill every remaining gap from the defaults table in the drafting agent's instructions, and list each default used.
5. Produce the output in the format below.

## Timing Placeholder Rules

Statutory and regulatory time periods are never stated as a number of days.

- Breach and incident notice: `[BREACH NOTICE WINDOW]`, with an operator note to confirm the window with responsible healthcare counsel.
- Individual-rights assistance: `[RESPONSE WINDOW]` for access, amendment, and accounting assistance.
- Cure periods and advance notices: bracket placeholders unless the issue states a negotiated number.
- Accompany every timing placeholder with a line in `Assumptions and open items` routing the number to the operator or responsible healthcare counsel.

## Output Format

- A short `Assumptions and open items` section before the agreement body listing every placeholder, default, timing note, and operator follow-up.
- The agreement: title, parties block, recitals and roles, definitions reference, then numbered sections in the order above.
- Signature blocks: signatory name, title, and date for each party.
- Preserve operator-specified names, services, information categories, and special terms exactly as given.

## Boundaries

- Do not assert that the draft satisfies HIPAA, the HITECH Act, or any state privacy law; compliance determinations belong to the operator or responsible healthcare counsel.
- Do not state statutory breach-notice or response deadlines as a number of days; the placeholder plus counsel note is the only permitted treatment.
- Do not reproduce regulatory definitions or rule text verbatim; use the definitions-reference clause.
- Do not negotiate terms or revise drafts based on assumed counterparty reactions.
- Do not transmit the draft to the counterparty, a regulator, or any other external party or system; the draft is a work product pending operator approval.
