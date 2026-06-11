---
name: ucc-filing-checklist
description: Build and maintain UCC-1 and UCC-3 tracking tables when a filing-tracking matter arrives, producing a living table with lapse dates, continuation windows, and deadline flags.
metadata:
  sources:
    - path: companies/legal-operations/skills/ucc-filing-checklist/SKILL.md
      kind: local-file
      usage: vendored
      license: Apache-2.0
      attribution: PossibLaw
---

# UCC Filing Checklist

Use this skill to build and maintain a tracking table for UCC-1 financing statements and UCC-3 amendments, continuations, assignments, and terminations, and to flag rows approaching lapse. The table is a living work product: facts in, flags out, no filings ever made.

## Tracking Steps

1. Scope intake. Record the matter or portfolio covered, the source of filing facts (filed copies, search results, loan documents, or operator statements), and the review date used for flag computation. If no filing details or source documents are supplied and no acceptable default applies, gate with `missing-info-gate` instead of guessing.
2. Build or update the tracking table in the format below, one row per filing. Record facts exactly as supplied; mark each missing field `[NOT FOUND]` rather than guessing.
3. Compute lapse and continuation dates as defaults pending confirmation: the lapse date defaults to five years after the file date, and the continuation window defaults to the six months before lapse. Mark every computed value `[COMPUTED]`, note that the filing office's records control, and mark filings that may carry a non-standard duration (for example manufactured-home or public-finance filings) `[CONFIRM DURATION]`.
4. Link each UCC-3 row to its initial financing statement's row and update the parent row's status — amended, continued, assigned, or terminated — from the supplied facts only.
5. Apply lapse-window flags using the review date:
   - `LAPSED`: the lapse date has passed with no continuation recorded.
   - `WINDOW OPEN`: the review date is inside the continuation window.
   - `WINDOW SOON`: the continuation window opens within 90 days of the review date.
6. Post the work product in this order: flag report, tracking table, coverage notes (filings referenced but undocumented, missing fields, and sources used). On later updates, change rows in place, keep row numbers stable, and append a dated change-log line per change.

## Tracking Table Format

| # | Type | Debtor | Secured party | Jurisdiction | File number | File date | Lapse date | Continuation window | Status | Flag |
|---|---|---|---|---|---|---|---|---|---|---|
| Stable row number | UCC-1 or UCC-3 (amendment, continuation, assignment, termination) | Exact name as filed | Exact name as filed | Filing office and state | As filed or `[NOT FOUND]` | As filed | Date or `[COMPUTED]` | Open and close dates or `[COMPUTED]` | Active / Amended / Continued / Assigned / Terminated / Lapsed | `LAPSED` / `WINDOW OPEN` / `WINDOW SOON` or blank |

## Flag Report Format

Lead the work product with one line per flagged row: flag, row number, debtor, jurisdiction, lapse date, and the recommended operator action — for example, confirm continuation instructions with the responsible attorney before the window closes.

## Boundaries

- Never file, continue, amend, terminate, or instruct any party or service to file a financing statement; flags are notices for operator action only.
- Do not opine on perfection, priority, sufficiency of a collateral description, or debtor-name correctness as a legal matter; record the facts and route determinations to the operator or responsible attorney.
- Treat computed lapse dates and continuation windows as provisional until confirmed against the filed copy or the filing office's records, and do not give jurisdiction-specific advice as settled.
- Do not transmit the table or any filing detail to any external party or system; the table is a work product pending operator approval.
