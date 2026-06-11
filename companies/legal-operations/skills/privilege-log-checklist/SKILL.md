---
name: privilege-log-checklist
description: Build a privilege-log table from document metadata supplied in the issue when a privilege-log matter arrives, producing entries with date, author, recipients, a content-safe description, and the privilege asserted, plus waiver-risk flags for attorney review.
metadata:
  sources:
    - path: companies/legal-operations/skills/privilege-log-checklist/SKILL.md
      kind: local-file
      usage: vendored
      license: Apache-2.0
      attribution: PossibLaw
---

# Privilege Log Checklist

Use this skill to convert document metadata supplied in the issue into a privilege-log table with waiver-risk flags. The log records the privilege basis stated or marks it for attorney confirmation; it never determines that a document is privileged as a legal conclusion, and it never reveals document content.

## Log-Building Steps

1. Scope intake. Record the document metadata set supplied in the issue (identifier, date, author, recipients including copy lines, document type, and subject or description source per document), the privilege-group roster (attorneys and their agents) if provided, and the claims context. If no metadata set is supplied and no acceptable default applies, gate with `missing-info-gate` instead of guessing; never pull metadata from any source outside the issue.
2. Build one log row per document. Carry over the identifier, date, author, recipients, and document type exactly as the metadata states them; mark absent fields `[NOT PROVIDED]` rather than inferring them.
3. Write the description. State the document's general subject and the purpose supporting the privilege claim — for example `Email seeking legal advice regarding [TOPIC]` or `Memorandum prepared at direction of counsel concerning anticipated litigation` — sufficient for an opposing party to assess the claim without revealing the substance of the advice or work product. Never quote, paraphrase, or summarize the document's content. Where a sufficient description cannot be written without revealing content, enter `[ATTORNEY REVIEW — DESCRIPTION]`.
4. Record the privilege asserted. Enter the basis stated in the metadata or the issue (attorney-client privilege, work-product protection, or both); where no basis is stated, enter `[ATTORNEY TO CONFIRM]` — never assign a privilege basis yourself.
5. Apply the waiver-risk screen. Flag, never resolve, each signal below in the row's Flags column and in the waiver-risk flag table:
   - A recipient outside the privilege-group roster, or any recipient when no roster was provided.
   - Broad distribution lists or group aliases among recipients.
   - Forwarding chains extending beyond the original privileged exchange.
   - Apparent mixed business and legal purpose in the stated subject.
   - Attachments with no independent privilege basis stated.
6. Close with counts (rows built, `[ATTORNEY TO CONFIRM]` entries, `[ATTORNEY REVIEW — DESCRIPTION]` entries, waiver-risk flags) and operator follow-ups, starting with the flagged rows.

## Log Table Format

| No. | Date | Author | Recipients | Document type | Description | Privilege asserted | Flags |
|---|---|---|---|---|---|---|---|
| Identifier from the metadata set | As stated | As stated | As stated, copy lines included | As stated | Content-safe description per step 3 | Stated basis or `[ATTORNEY TO CONFIRM]` | `Waiver-risk flag` entries or `None` |

Waiver-risk flag table:

| No. | Signal | Why flagged | Action for attorney |
|---|---|---|---|
| Row identifier | The signal from step 5 | One-line factual basis from the metadata | Review and confirm, narrow, or withdraw the entry |

## Boundaries

- Do not determine that a document is privileged, protected, or waived as a legal conclusion; record stated bases, mark the rest `[ATTORNEY TO CONFIRM]`, and route every flag to the operator or responsible attorney.
- Do not reveal, quote, or summarize document content anywhere in the log; descriptions state subject and purpose only.
- Build the log only from metadata supplied in the issue; do not open document contents or pull metadata from external systems.
- Do not serve, produce, or transmit the log or any underlying document to any external party or system; the log is a work product pending operator approval.
