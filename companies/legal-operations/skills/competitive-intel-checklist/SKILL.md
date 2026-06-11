---
name: competitive-intel-checklist
description: Summarize public-source competitive-intelligence materials supplied in the issue when an intel matter arrives, producing briefing tables of firm moves, client wins, and rate trends with a source citation on every row.
metadata:
  sources:
    - path: companies/legal-operations/skills/competitive-intel-checklist/SKILL.md
      kind: local-file
      usage: vendored
      license: Apache-2.0
      attribution: PossibLaw
---

# Competitive Intel Checklist

Use this skill to turn public-source competitive-intelligence materials supplied in the issue into structured briefing tables. The supplied materials are the entire evidence base: no scraping, no live monitoring, no outreach. Every row cites its source, and facts stay separated from source speculation.

## Briefing Steps

1. Inventory the supplied materials. List each with its title, publisher, and date as supplied, and note any material that is unreadable or incomplete. If no materials are supplied and no acceptable default applies, gate with `missing-info-gate` instead of searching for sources.
2. Classify each item into a category: firm moves (lateral hires, departures, office openings, mergers), client wins (engagements, panel appointments, matter wins as publicly reported), rate trends (published rate, fee, or pricing information), or other.
3. Extract the facts exactly as each source states them. Keep each claim attributed to its source; never merge claims from different sources into one unattributed statement. Record rate and fee figures verbatim — never compute averages, trends, or projections the source does not state.
4. Separate fact from speculation. Label anything the source frames as expectation, rumor, or analysis as that source's speculation, and mark every item supported by only one supplied source `Single-sourced`.
5. Build the briefing tables in the format below, one table per category with items present.
6. Record gaps and follow-ups: questions the supplied materials do not answer, single-sourced items needing corroboration, and materials referenced but not supplied — listed for operator follow-up, not for independent collection.

## Briefing Table Format

One table per category (firm moves, client wins, rate trends), each row sourced:

| Item | Detail as stated | Source (title, publisher) | Date as supplied | Notes |
|---|---|---|---|---|
| Firm or organization concerned | The claim exactly as the source states it | Citation as supplied | As supplied, or `None stated` | `Single-sourced`, `Source speculation`, conflicts between sources, or `None` |

When two supplied sources conflict, record both rows and note the conflict; do not resolve it.

## Source Inventory and Gaps

Close every briefing with:

- A source inventory: every supplied material with title, publisher, date, and whether it was used.
- A gaps list: unanswered questions, single-sourced items, and referenced-but-not-supplied materials, framed as operator follow-ups.

## Boundaries

- Do not scrape, browse, fetch links, subscribe to feeds, or contact any person, firm, or organization; only materials supplied in the issue may be used.
- Do not characterize another firm's confidential strategy, internal finances, or motives beyond what a supplied source states, and do not add disparaging commentary about any firm or lawyer.
- Do not compute rate averages, trends, or projections the sources do not state, and do not recommend BD strategy; the briefing informs, the operator decides.
- Do not transmit the briefing or any source material to any external party or system; the briefing is a work product pending operator approval.
