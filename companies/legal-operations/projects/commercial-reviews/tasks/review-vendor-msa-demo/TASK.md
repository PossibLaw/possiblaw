---
name: Review Vendor MSA Demo
slug: review-vendor-msa-demo
assignee: chief-of-staff
project: commercial-reviews
---

Review the attached vendor Master Services Agreement and produce a structured risk report for the operator. The counterparty is a generic SaaS vendor; PossibLaw is the customer (our-side: customer).

Required intake before drafting:
- Vendor name + entity type + state of formation
- Contract value (annual or one-time)
- Service category (SaaS, professional services, data processing, etc.)
- Term length + renewal terms
- Whether the vendor will process personal data on PossibLaw's behalf (drives DPA / privacy review)
- Governing law preferred by PossibLaw

If material facts are missing, use `missing-info-gate` to block with the required fields before substantive review.

Expected outputs:
- Structured findings report in markdown with GREEN / YELLOW / RED classifications per clause
- Risk score (1-5)
- Recommended redlines for each YELLOW / RED finding
- Operator-facing summary at top

The practice of law is regulated; to the extent the operator is practicing law with this workflow, the operator needs to involve a lawyer. Return the review report as work product without adding repeated disclaimer boilerplate.
