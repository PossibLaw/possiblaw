---
name: ma-diligence-playbook
description: Draft tailored due-diligence request lists or summarize data-room documents when an M&A diligence matter arrives, producing workstream request tables or per-document findings tables with red flags.
metadata:
  sources:
    - path: companies/legal-operations/skills/ma-diligence-playbook/SKILL.md
      kind: local-file
      usage: vendored
      license: Apache-2.0
      attribution: PossibLaw
---

# M&A Diligence Playbook

Use this skill in one of two modes. Request-list mode drafts a due-diligence request list tailored to the deal; document-summary mode summarizes supplied data-room documents into per-document findings tables. Run exactly one mode per work product: a matter asking what to request from the other side is request-list mode; a matter supplying documents to digest is document-summary mode.

## Request-List Mode Steps

1. Scope intake. Record deal type and structure, side (buyer or seller), target name and industry, deal size, jurisdictions, lookback period, and materiality threshold. Where a fact is absent, apply the requesting agent's defaults; if no acceptable default applies, gate with `missing-info-gate` instead of guessing.
2. Select workstreams. Include each of the following sections in this order, cutting only those that cannot apply to the target: corporate, contracts, IP, employment, litigation, regulatory, tax, and data privacy.
3. Tailor to industry. When the industry is known, add the matching module requests: regulated industries — licenses, permits, and regulator correspondence; software and technology — open-source usage, source-code escrow, and key technical dependencies; healthcare and life sciences — clinical, payor, and health-data compliance materials; financial services — examinations, enforcement history, and AML program documents. When the industry is unknown, mark industry-specific requests `[CONFIRM INDUSTRY]`.
4. Scale to deal size. Trim low-priority requests for small or asset-only deals, and state in the assumptions section what was scaled down and why.
5. Write each request so the responding party knows exactly which documents satisfy it: document type, counterparty or subject, lookback period, and materiality threshold where one applies. Avoid catch-all requests except the closing catch-all in step 6.
6. Assemble the request list in the format below, ending with a single catch-all request for material documents not otherwise requested and an instructions block for the responding party covering format, organization, indexing, and update cadence.

## Request-List Format

1. Header: deal name or `[DEAL NAME]`, deal type, side, target, and date.
2. `Assumptions and open items`: every default applied, placeholder used, and operator follow-up.
3. One section per workstream, in the step 2 order, each a numbered table:

| # | Request | Priority | Lookback |
|---|---|---|---|
| Sequential within the workstream | Specific document request | High / Medium / Low | Period or `N/A` |

4. Closing catch-all request and the responding-party instructions block.

## Document-Summary Mode Steps

1. Inventory the supplied documents in data-room index order. Note documents that are illegible or truncated and exhibits or schedules referenced but not supplied. If no documents are supplied at all, gate with `missing-info-gate`.
2. For each document, extract the standard fields: parties; document type and date; term and renewal; key economic terms; change-of-control provisions; assignment and consent requirements; exclusivity or non-compete restrictions; termination rights and notice periods; and governing law.
3. Quote decision-relevant language verbatim with a location cite (section, page, or heading) precise enough that a reviewer can find it without searching.
4. Mark every standard field with no matching language in the document as `[NOT FOUND]`. Absence is recorded, not judged.
5. Apply the red-flag triggers below. State each red flag as a one-line factual trigger; do not assess likelihood, severity, or how a court would treat it.
6. Assemble the work product in this order: per-document findings tables in data-room index order, then a red-flag summary grouped by trigger type with each flag's document and location cite, then coverage notes (documents not reviewed and why, missing exhibits or schedules, and data-room portions not supplied).

## Per-Document Findings Table Format

| Field | Finding | Location | Red flag |
|---|---|---|---|
| Standard field from step 2 | Verbatim quote or `[NOT FOUND]` | Section, page, or heading cite | Trigger name or blank |

## Red-Flag Triggers

- Consent, notice, or termination right tripped by a change of control or by the deal structure described in the issue.
- Assignment prohibited or conditioned on counterparty consent.
- Exclusivity, non-compete, most-favored-nation, or right-of-first-refusal provision binding the target.
- Termination for convenience held by the counterparty.
- Evergreen renewal with a notice window that closes before the expected closing date.
- Missing signatures, missing referenced exhibits, or an unsigned or undated amendment.

## Boundaries

- Do not send a request list, summary, or any underlying document to the target, the counterparty, opposing counsel, or any external party or system; both outputs are work products pending operator approval.
- Do not rate overall deal risk, recommend whether to proceed, or resolve red flags; second-pass risk review belongs to the operator or responsible attorney.
- Keep the tax workstream to document collection and organization; never compute tax exposure or liability.
- Do not give jurisdiction-specific advice as settled; mark jurisdiction-dependent requests and findings for operator confirmation.
