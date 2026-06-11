---
name: trading-window-checklist
description: Build insider-trading window calendars, blackout-period tables, and 10b5-1 plan intake logs when a trading-window matter arrives, producing structured tables with conflict flags routed to the operator.
metadata:
  sources:
    - path: companies/legal-operations/skills/trading-window-checklist/SKILL.md
      kind: local-file
      usage: vendored
      license: Apache-2.0
      attribution: PossibLaw
---

# Trading Window Checklist

Use this skill to maintain the structured tables behind an insider-trading compliance program: the window calendar, the blackout-period table, and the 10b5-1 plan intake log. The output is mechanical tracking with explicit conflict flags; clearance decisions belong to the operator.

## Tracking Steps

1. Scope intake. Record the company, the insider list with roles, the company's stated window policy terms (when windows open and close relative to earnings releases), the fiscal calendar with planned earnings dates, and any event-driven blackouts the operator has flagged. If the insider list, the policy terms, or the fiscal calendar is absent and no acceptable default applies, gate with `missing-info-gate` instead of guessing.
2. Build the window calendar. For each fiscal period, compute the open and close dates exactly as the stated policy and the supplied earnings dates produce them, and record the policy basis for each row. Never invent policy terms; a missing policy is a gate, not a default.
3. Build the blackout-period table. Record each event-driven blackout with the triggering event as the operator described it, the persons or groups affected, the start and end dates (or `[OPEN]` when the end is undetermined), and the source of the entry.
4. Build the 10b5-1 intake log. Record each plan with the insider, role, plan adoption date, broker, stated first-trade date, cooling-off status as an operator-confirmed item, and any modification or termination history supplied.
5. Detect conflicts. Compare the tables against each other and against any trade requests in the issue, and record a `Conflict flag` row for each of:
   - A trade request dated inside a closed window or an active blackout.
   - A 10b5-1 plan adopted or modified during a blackout or closed window.
   - Overlapping active plans for the same insider.
   - A first-trade date earlier than the operator-confirmed cooling-off item allows.
6. Produce the tables and conflict flags in the format below.

## Output Format

Produce three tables in this order, followed by the conflict flags:

| Table | Columns |
|---|---|
| Window calendar | `Period`, `Window opens`, `Window closes`, `Policy basis` |
| Blackout periods | `Triggering event`, `Affected persons`, `Start`, `End`, `Source` |
| 10b5-1 intake log | `Insider`, `Role`, `Adoption date`, `Broker`, `First-trade date`, `Cooling-off (operator-confirmed)`, `History` |

Close with a `Conflict flags` list: one row per conflict with the persons involved, the dates, the tables that conflict, and `Routed to operator` as the disposition. If there are no conflicts, state that explicitly.

## Boundaries

- Do not approve, clear, or confirm any trade, and do not state that an insider may trade; every clearance request is recorded as a conflict-review item for the operator.
- Do not determine whether information is material or public, or whether a cooling-off period is legally sufficient; record those as operator-confirmed items or flags.
- Do not invent window policy terms, earnings dates, or plan details; gate on missing inputs.
- Do not transmit the calendar, tables, or any trade instruction to a broker, exchange, or other external party or system; the tables are work products pending operator approval.
