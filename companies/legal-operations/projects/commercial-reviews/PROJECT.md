---
name: Commercial Reviews
description: Project for reviewing commercial contracts (NDA, SaaS, MSA, vendor agreements, OSS license compliance) via the Contract Reviewer specialist.
slug: commercial-reviews
owner: chief-of-staff
---

Use this project for contract-review matters that route from Chief of Staff to Chief Counsel, then Commercial Lead, then Contract Reviewer. Commercial Lead uses `legal-contract-review-dispatcher` to classify the document, then routes to Contract Reviewer with the matching review skill (`legal-nda-review`, `legal-saas-msa-review`, `legal-oss-compliance`) attached.

The Contract Reviewer produces structured findings with GREEN / YELLOW / RED clause classifications, our-side context, and a 5-point risk score, and writes the review report to the configured deliverables directory via `output-local-markdown`.
