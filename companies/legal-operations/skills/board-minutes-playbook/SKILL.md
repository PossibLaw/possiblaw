---
name: board-minutes-playbook
description: Draft board and committee meeting minutes when a minutes-drafting matter arrives, producing a markdown draft with attendance and quorum recitals, resolution and vote records, abstention handling, and executive-session handling pending secretary review.
metadata:
  sources:
    - path: companies/legal-operations/skills/board-minutes-playbook/SKILL.md
      kind: local-file
      usage: vendored
      license: Apache-2.0
      attribution: PossibLaw
---

# Board Minutes Playbook

Use this skill to draft board and committee meeting minutes from agendas, meeting notes, and issue context. Every set of minutes is a draft pending secretary or operator review: record what the sources state, insert placeholders for what they do not, and never assert that quorum was met, that notice was sufficient, or that any act was validly authorized.

## Drafting Steps

1. Scope intake. Record the entity, the acting body (board or named committee), the meeting type (regular or special), the date and time, the location or medium, and the source materials supplied (agenda, notes, prior minutes, consents). If no agenda or notes are supplied at all and no acceptable default applies, gate with `missing-info-gate` instead of reconstructing a meeting. For all other gaps, apply the drafting agent's defaults and record each default used.
2. Draft the heading and notice statement. State the entity, body, meeting type, date, time, and location or medium, mark the draft `DRAFT — pending secretary review`, and record notice as given or waived only as the sources state it; otherwise insert the notice placeholder.
3. Draft the attendance and quorum recitals. List members present and absent, others in attendance with their capacity, and the quorum line. Record quorum only as the sources state it; otherwise insert `[QUORUM CONFIRMED — secretary to verify]`. Never compute or assert quorum from a headcount.
4. Record the call to order and officer roles. Identify the chair and the secretary, with placeholders where unstated.
5. Record approval of prior minutes when it appears on the agenda, with the outcome as stated or the approval placeholder.
6. Draft the agenda items in order. For each item: a brief, neutral discussion summary from the notes; the text of each resolution the sources state was adopted; and the vote record. Record only resolutions the agenda or notes state were adopted — where adoption or the vote is not stated, insert a placeholder for secretary confirmation rather than assuming an outcome.
7. Apply abstention handling. Record abstentions and recusals only as stated, naming the member, the item, and any stated reason (such as a conflict of interest) without elaborating on it. Where the notes are silent, insert the abstentions placeholder rather than recording a unanimous vote.
8. Apply executive-session handling. When the notes indicate an executive session, record only that one occurred, who remained, and the general topic. Never reconstruct, summarize, or paraphrase privileged discussion content, even when the notes contain it; flag any such content for the secretary instead.
9. Record the adjournment time and draft the secretary signature block marked `DRAFT — pending secretary review`.
10. Close with an `Assumptions and open items` section listing every placeholder, every default used, and every secretary confirmation needed.

## Minutes Structure

Produce a single well-structured markdown document with sections in this order:

1. Heading: entity name, body, meeting type, date, time, location or medium, and the `DRAFT — pending secretary review` line.
2. Notice statement.
3. Attendance and quorum recitals.
4. Call to order.
5. Approval of prior minutes (when on the agenda).
6. Agenda items in order, each with discussion summary, resolution text, and vote record including abstentions and recusals.
7. Executive session record (when one occurred).
8. Adjournment.
9. Secretary signature block marked `DRAFT — pending secretary review`.
10. Assumptions and open items.

## Resolution and Vote Record Format

For each resolution, record:

- The resolved-clause text exactly as the agenda or notes state it, or closely drawn from them with brackets marking inserted language.
- The vote record: moved by, seconded by, votes for, votes against, abstentions, and recusals — each as stated or as a `[secretary to confirm]` placeholder.
- For actions by written consent referenced in the meeting, a cross-reference to the consent instrument rather than a reconstruction of it.

## Boundaries

- Minutes are drafts pending secretary or operator review; do not certify, finalize, or enter them into a minute book.
- Do not assert that quorum was met, that notice was sufficient, or that any act was validly authorized or compliant with the charter, bylaws, or any jurisdiction's corporate law; route those questions to the secretary, operator, or responsible attorney.
- Do not reconstruct privileged or executive-session discussion content; record occurrence, attendees, and general topic only.
- Do not transmit the minutes to any external party or system; the draft is a work product pending operator approval.
