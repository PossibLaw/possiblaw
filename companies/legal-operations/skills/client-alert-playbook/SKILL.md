---
name: client-alert-playbook
description: Draft a client-alert article on an operator-identified legal development when an alert matter arrives, producing a markdown draft covering what changed, who is affected, deadlines, and recommended actions with every legal-development fact marked for attorney verification.
metadata:
  sources:
    - path: companies/legal-operations/skills/client-alert-playbook/SKILL.md
      kind: local-file
      usage: vendored
      license: Apache-2.0
      attribution: PossibLaw
---

# Client Alert Playbook

Use this skill to draft a client-alert article on a legal development the operator identified. The alert explains what changed, who is affected, the key dates, and what readers should consider doing. Every legal-development fact carries an `[ATTORNEY VERIFY]` marker, and the draft is never publication-ready until a responsible attorney has verified each marked fact and the operator approves publication.

## Drafting Steps

1. Scope intake. Record the legal development the operator identified, the source materials supplied, the intended audience, the jurisdictions in scope, and any publication deadline. If no development is identified and no acceptable default applies, gate with `missing-info-gate` instead of guessing.
2. Extract the development facts from the supplied materials only: what changed, the issuing authority (legislature, agency, or court as supplied), effective dates and compliance deadlines, and who is affected. Mark each of these facts `[ATTORNEY VERIFY]`; never invent developments, citations, dates, or enforcement positions.
3. Draft the headline and a one-sentence summary that states the change and who it touches, in plain language.
4. Draft the body in order: what changed, who is affected, key dates and deadlines, recommended actions. Explain terms of art on first use and keep the alert at the operator's length target or the 600–900 word default.
5. Build the key-dates table in the format below, recording each date exactly as the supplied materials state it.
6. Draft recommended actions as numbered considerations for affected readers to take up with their counsel — review, assess, calendar, consult. Do not state jurisdiction-specific positions as settled, do not predict how a court or regulator would rule, and route legal determinations to the operator or responsible attorney.
7. Assemble the attorney-verification list: every `[ATTORNEY VERIFY]` fact collected in one place, plus placeholders and open items, so sign-off can proceed row by row.

## Key-Dates Table Format

| Date | Event | Who must act | Source as supplied |
|---|---|---|---|
| Date exactly as the materials state it, or `[EFFECTIVE DATE]` | Effective date, compliance deadline, comment period close, or similar | Affected category from the alert | The supplied document or citation, marked `[ATTORNEY VERIFY]` |

## Alert Skeleton

1. Headline and one-sentence summary.
2. What changed — with `[ATTORNEY VERIFY]` markers on every legal-development fact.
3. Who is affected — operator-identified categories of clients or organizations.
4. Key dates and deadlines — the table above.
5. Recommended actions — numbered considerations.
6. Author and contact block — `[AUTHOR NAME, TITLE, CONTACT]` unless supplied.
7. Attorney-verification list — every marked fact, placeholder, and open item.

## Boundaries

- Do not publish, post, email, or transmit the alert to any external party, mailing list, or platform; the draft is a work product pending attorney verification and operator approval.
- Do not give jurisdiction-specific legal advice as settled or predict how a court or regulator would rule; the alert informs, the reader's counsel advises.
- Do not invent or embellish developments, citations, effective dates, statistics, or enforcement positions; facts come from the supplied materials or remain placeholders.
