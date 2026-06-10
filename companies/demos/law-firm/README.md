# Harbor & Finch LLP — Law Firm Demo

Harbor & Finch LLP is a fictional 12-lawyer boutique firm serving technology and consumer-brand clients with commercial contracts, employment counseling, and outside-GC subscription work. The firm runs lean: AI agents prepare drafts, reviews, billing summaries, and BD material, and the firm's lawyers review and own every deliverable. This demo profile shows a small firm exercising both the legal delegation chain (chief-of-staff → chief-counsel → practice leads → specialists) and the business-side chain (chief-of-staff → BD, finance, and ops leads).

## Use at Launch

- Org name: `Harbor & Finch LLP`
- Mission: `Harbor & Finch LLP is a 12-lawyer boutique firm serving technology and consumer-brand clients with commercial, employment, and outside-GC work. AI agents prepare drafts and operational work product; our lawyers review and own every deliverable.`

## Run the Demo

All tasks import into the backlog assigned to `chief-of-staff`. Move tasks from backlog to todo to start them. Suggested first pair: `draft-brightline-nordwind-nda` (full legal chain) and `brightline-invoice-summary` (business-side chain). Expected routing per task:

- `draft-brightline-nordwind-nda` → chief-of-staff → chief-counsel → commercial-lead → nda-drafter
- `review-cloudpier-msa` → chief-of-staff → chief-counsel → commercial-lead → contract-reviewer
- `karst-offer-letter` → chief-of-staff → chief-counsel → employment-lead → employment-offer-letter-drafter
- `veldt-separation-intake` → chief-of-staff → chief-counsel → employment-lead → employment-separation-drafter
- `saltgrass-rfp-response` → chief-of-staff → bd-lead → bd-proposal-drafter
- `hubspot-crm-hygiene` → chief-of-staff → bd-lead → bd-crm-coordinator
- `brightline-invoice-summary` → chief-of-staff → finance-lead → billing-prep
- `intake-conflicts-sop` → chief-of-staff → ops-lead → ops-sop-curator

Several tasks intentionally omit facts (signature blocks, candidate names, document uploads) so you can watch agents surface operator follow-ups instead of inventing details.

## Synthetic Data Notice

Every client, company, person, matter, amount, and fact in this profile is synthetic and exists only for demonstration. Do not reuse any of it as real legal work product. The practice of law is regulated; to the extent an operator is practicing law with this workflow, the operator needs to involve a lawyer.
