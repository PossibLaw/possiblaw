---
name: real-estate-purchase-playbook
description: Draft purchase-and-sale agreement skeletons and ancillary transfer documents when a real-estate purchase matter arrives, producing markdown work products with exhibit placeholders and defaults for missing facts.
metadata:
  sources:
    - path: companies/legal-operations/skills/real-estate-purchase-playbook/SKILL.md
      kind: local-file
      usage: vendored
      license: Apache-2.0
      attribution: PossibLaw
---

# Real Estate Purchase Playbook

Use this skill to draft a purchase-and-sale agreement skeleton and the ancillary transfer documents the facts support — an assignment and assumption of leases, a bill of sale. Apply the drafting agent's defaults when the operator has not provided contrary instructions, and mark missing legal or business facts with bracket placeholders. The drafts organize the transaction on paper; recording, escrow, funds, and title work are operator actions.

## Drafting Steps

1. Scope intake. Record the parties, the property as stated, the price and deposit terms, the requested documents, and the leases or personal property identified. Gate with `missing-info-gate` only when a required fact has no acceptable default in the drafting agent's instructions.
2. Draft the purchase-and-sale agreement skeleton in this section order:
   - Title and parties block, with an effective-date placeholder.
   - Recitals: seller's ownership as stated and the parties' intent.
   - Definitions for the defined terms used in the body.
   - Purchase and sale; property description referencing `[EXHIBIT A — LEGAL DESCRIPTION]` — never compose or reconstruct a legal description.
   - Purchase price and deposit: amounts per the issue or defaults, the `[ESCROW AGENT]` placeholder, and deposit credit at closing.
   - Due diligence: inspection rights, the diligence period, and the buyer's termination right during it.
   - Title and survey: commitment delivery, the objection and cure mechanics, and permitted exceptions as an exhibit placeholder.
   - Representations and warranties: seller and buyer sections with a survival-period placeholder; include only facts the issue supports, placeholders elsewhere.
   - Covenants pending closing: operation of the property, leasing restrictions, and no-new-encumbrance language.
   - Conditions to closing for each party.
   - Closing: date per the issue or defaults, and the seller and buyer deliverables lists — list the deed as a deliverable with a `[DEED FORM — OPERATOR DECISION]` placeholder; never draft the deed.
   - Prorations and closing costs: `[ALLOCATION — OPERATOR DECISION]` placeholders noting that local custom varies.
   - Risk of loss, casualty, and condemnation.
   - Default and remedies: liquidated-damages and specific-performance choices as `[OPERATOR DECISION]` items.
   - Brokers: the `[BROKER DISCLOSURE]` placeholder and mutual representations as stated.
   - Notices.
   - Miscellaneous: assignment, `[GOVERNING LAW STATE]`, counterparts, and exchange-cooperation language only if the issue states it.
   - Signature blocks and the exhibits list.
3. Draft ancillaries only for what the issue supports; otherwise note the ancillary as not yet supported by the facts:
   - Assignment and assumption of leases — parties, the assigned leases referenced to a `[SCHEDULE OF ASSIGNED LEASES]` placeholder, assignment and assumption operative language, allocation of pre- and post-closing obligations, and signature blocks.
   - Bill of sale — parties, the transferred property referenced to a `[SCHEDULE OF TRANSFERRED PROPERTY]` placeholder, transfer language with a warranty choice marked `[OPERATOR DECISION]`, and a signature block.
4. Mark every allocation that depends on local custom or jurisdiction — transfer taxes, closing costs, prorations, recording requirements — as `[OPERATOR DECISION]` with the dependency stated; never present a jurisdiction-specific allocation as settled.
5. Apply defaults. Fill every remaining gap from the defaults table in the drafting agent's instructions, and list each default used.
6. Produce the output in the format below.

## Exhibit Placeholder Rules

- The legal description is always `[EXHIBIT A — LEGAL DESCRIPTION]`; it is never composed, reconstructed, or paraphrased from an address.
- Schedules the facts do not yet support — assigned leases, transferred property, permitted exceptions — appear as named placeholders with a collection note in `Assumptions and open items`.
- Every exhibit referenced in the body must appear in the exhibits list, marked `Attached` or `[TO COLLECT]`.

## Output Format

- An `Assumptions and open items` section listing every placeholder, default used, and `[OPERATOR DECISION]` item.
- The purchase-and-sale agreement skeleton in the section order above, ending with signature blocks and the exhibits list.
- Each requested ancillary as its own complete skeleton.
- Preserve operator-specified names, dates, amounts, and special terms exactly as given.

## Boundaries

- Do not record any document, open or instruct escrow, hold or move funds, or order title work; flag those as operator actions.
- Do not compose or reconstruct a legal description; the exhibit placeholder is the only permitted treatment.
- Do not resolve legal determinations — title sufficiency, zoning, permitted use, tax treatment — in the draft; route them to the operator or responsible attorney.
- Do not negotiate terms or revise drafts based on assumed counterparty reactions.
- Do not transmit the documents to any external party or system — including counterparties, escrow agents, title companies, or a recorder's office; the drafts are work products pending operator approval.
