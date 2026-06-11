---
name: ma-closing-checklist
description: Build and maintain signing and closing checklists when an M&A checklist matter arrives, producing a living table of documents, responsible parties, statuses, dependencies, and delivery methods.
metadata:
  sources:
    - path: companies/legal-operations/skills/ma-closing-checklist/SKILL.md
      kind: local-file
      usage: vendored
      license: Apache-2.0
      attribution: PossibLaw
---

# M&A Closing Checklist

Use this skill to build a signing and closing checklist for a deal and to keep it current as statuses change. The checklist is a living table: one row per deliverable, updated in place, with a change log.

## Build Steps

1. Scope intake. Record the deal name, governing agreement, signing and closing structure (simultaneous or deferred), target signing and closing dates, and the parties and their counsel. If no agreement, document list, or deal description is supplied and no acceptable default applies, gate with `missing-info-gate` instead of guessing.
2. Seed the document inventory. From the governing agreement's conditions precedent, closing deliverables, and ancillary-document definitions, list every item due at or before signing and at or before closing. Where the agreement is not supplied, seed from the customary set for the deal type — board and equityholder consents, officer and secretary certificates, ancillary agreements, payoff letters, lien releases, director and officer resignations, good-standing certificates, funds-flow memorandum, escrow agreement, and regulatory filings or consents — and mark each seeded row `[CONFIRM]`.
3. Populate the table in the format below, splitting signing deliverables and closing deliverables into separate sections.
4. Record dependencies by row reference so each blocked item names what blocks it.
5. Post the work product — status summary, checklist table, open questions — then keep it current under the maintenance steps.

## Checklist Table Format

| # | Document | Responsible party | Status | Dependency | Delivery method |
|---|---|---|---|---|---|
| Stable row number, never reused | Deliverable name and agreement cite | Party or counsel, or `[TBD]` | One value from the status vocabulary | Row number(s) it waits on, or `None` | Original, counterpart exchange, escrow, electronic, or `[TBD]` |

Status vocabulary (use no other values): `Not started`, `Drafting`, `Under review`, `Agreed form`, `Executed — held`, `Delivered`, `Waived`, `N/A`.

## Maintenance Steps

1. Update statuses only on operator or issue-reported facts; never advance a status on assumption.
2. Update rows in place; keep row numbers stable, and mark superseded items `N/A` with a note rather than deleting them.
3. Append a dated change-log line per update: row number, old status, new status, and source.
4. Recompute and surface the critical path — rows blocking the most downstream rows — and flag rows at risk against the target signing and closing dates.
5. Repost the full work product in the same three-part order: status summary, checklist table, open questions.

## Boundaries

- Never execute, date, or release a document, mark a condition satisfied, or declare signing or closing to have occurred; record reported facts and route satisfaction determinations to the operator or responsible attorney.
- Never deliver, send, or post any checklist item to a counterparty, escrow agent, filing office, or any external party or system; the checklist and the documents it tracks are work products pending operator approval.
- Do not give jurisdiction-specific advice as settled; mark consents or filings whose necessity is jurisdiction-dependent for operator confirmation.
