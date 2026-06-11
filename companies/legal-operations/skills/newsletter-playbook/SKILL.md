---
name: newsletter-playbook
description: Assemble a newsletter issue draft from the items supplied in the issue when a newsletter matter arrives, producing an ordered markdown draft with per-item summaries and call-to-action placeholders.
metadata:
  sources:
    - path: companies/legal-operations/skills/newsletter-playbook/SKILL.md
      kind: local-file
      usage: vendored
      license: Apache-2.0
      attribution: PossibLaw
---

# Newsletter Playbook

Use this skill to assemble a newsletter issue from the items supplied in the issue. The job is ordering, summarizing, and packaging supplied content — not sourcing new content. The assembled draft is a work product that is never sent or published.

## Assembly Steps

1. Inventory the supplied items. List each item with its supplied title, text, link, and date. If no items are supplied and no acceptable default applies, gate with `missing-info-gate` instead of inventing content.
2. Classify each item into a section: lead story, practice updates, firm news, events, or other. Use the operator's section assignments when given; otherwise classify by content and record the classification in the open-items list.
3. Order the sections. Use the operator-specified order when given; otherwise use the default order — lead story, practice updates, firm news, events, closing call to action. Pick the lead story the operator designated; if none is designated, pick the most time-sensitive item and record the choice.
4. Summarize each item in two to three sentences using only the supplied text. Preserve supplied titles, names, links, and dates exactly; do not add claims, outcomes, or commentary the supplied text does not contain.
5. Flag legal-development claims. Any item asserting a change in law, regulation, or court position gets an `[ATTORNEY VERIFY]` flag in the open-items list; the newsletter does not present legal claims as verified.
6. Insert placeholders. Add `[CTA — operator to confirm]` for each section that needs a call to action, and `[NEWSLETTER NAME]`, `[ISSUE DATE]`, `[FIRM NAME]`, and `[EDITOR NAME, CONTACT]` placeholders for masthead and sign-off details not supplied.
7. Assemble the draft in the skeleton below and close with the open-items list: every placeholder, every `[ATTORNEY VERIFY]` flag, and every supplied item not used with the reason.

## Issue Skeleton

1. Masthead: newsletter name, issue date, audience line.
2. Table of contents, one line per section.
3. Lead story: title, summary, preserved link.
4. Practice updates: each item with title, summary, preserved link.
5. Firm news: each item with title, summary, preserved link.
6. Events: supplied events with dates, locations, and registration details exactly as given.
7. Closing call-to-action placeholder and sign-off block.
8. Open-items list.

## Item Summary Format

| Section | Item title as supplied | Summary (2–3 sentences) | Link and date as supplied | Flags |
|---|---|---|---|---|
| Lead story / practice updates / firm news / events | Exactly as supplied | Restates supplied text only | Preserved verbatim, or `None supplied` | `[ATTORNEY VERIFY]`, placeholder notes, or `None` |

Build this table first as the working inventory, then render the skeleton from it; include the table in the work product so the operator can audit item handling row by row.

## Boundaries

- Do not send, schedule, publish, post, or upload the newsletter to any mailing list, email platform, website, or external system; the draft is a work product pending operator approval.
- Do not source, invent, or import items, links, dates, events, or quotes from outside the issue; supplied items are the entire content base.
- Do not present legal-development claims as verified or add legal advice; flag them for attorney verification instead.
