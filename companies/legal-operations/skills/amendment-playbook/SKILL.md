---
name: amendment-playbook
description: Draft an amendment or change order to an existing agreement — recitals tying to the original, numbered section-by-section edits, and a ratification clause — when an amendment matter arrives, applying stated defaults and flagging every amendment-procedure requirement in the underlying contract.
metadata:
  sources:
    - path: companies/legal-operations/skills/amendment-playbook/SKILL.md
      kind: local-file
      usage: vendored
      license: Apache-2.0
      attribution: PossibLaw
---

# Amendment Drafting Playbook

Use this skill to draft an amendment or change order that modifies an existing agreement section by section. The amendment changes only the sections it cites; everything else is ratified. The draft is a work product for operator and responsible-attorney review; it is never sent to a counterparty.

## Drafting Steps

1. Scope intake. Record the underlying agreement (title, parties, date), every prior amendment by number and date, and the specific changes requested. If the requested changes themselves are not identified and no acceptable default applies, gate with `missing-info-gate` instead of guessing. Use `[ORIGINAL AGREEMENT — TITLE AND DATE]` when the underlying agreement is not identified and `[PRIOR AMENDMENTS]` when the amendment history is unknown, flagging each as an open item.
2. Run the amendment-procedure check. When the underlying contract is supplied, locate its amendment clause and record every procedural requirement — signed writing, authorized signatories, required consents or approvals, notice prerequisites — in the `Amendment-procedure flags` section. Flag the requirements for the operator; never certify that they are satisfied. When the contract is not supplied, state that the check is pending the document.
3. Number the instrument. Use the next sequential amendment number when prior amendments are known; otherwise `[AMENDMENT NUMBER]`. Title the instrument a change order when the underlying contract uses that convention.
4. Draft the title block and recitals. Identify the original agreement by title, parties, and date; list prior amendments by number and date; state the parties' intent to amend; and recite consideration (default: mutual covenants and other good and valuable consideration).
5. Draft the numbered edits. Write each edit as its own numbered item that cites the original section and uses an explicit convention — `Section X is deleted and replaced in its entirety with the following:` or `Section X is amended by adding/deleting the following:` — never describe an edit loosely. Default convention: affected sections deleted and replaced in their entirety.
6. Check for ripple effects. If a requested change touches defined terms, cross-references, or sections outside the requested scope, flag the ripple as an open item; do not silently expand the edit.
7. Draft the ratification clause: all terms of the original agreement not amended remain in full force and effect, and conflicts between the amendment and the original agreement resolve in favor of the amendment.
8. Draft the general provisions: amendment effective date (`[AMENDMENT EFFECTIVE DATE]` when unknown), counterparts, and governing law following the underlying agreement.
9. Assemble the deliverable in the output format below. List every placeholder, default used, and ripple flag in the assumptions section, and close with signature blocks.

## Amendment-Procedure Flags Format

| Requirement | Source provision | Operator action |
|---|---|---|
| The procedural requirement as the contract states it | Section reference | What the operator must confirm or obtain before execution |

State `None identified` when the amendment clause imposes no requirements, plus the pending-document caveat when the underlying contract was not supplied.

## Output Format

Produce the draft with this structure:

1. Title block: amendment or change-order number, underlying agreement reference, and parties, with placeholders for unknowns.
2. `Assumptions and open items` section listing every placeholder, default used, ripple flag, and operator follow-up.
3. Recitals tying to the original agreement: identity of the original, prior amendments, and the parties' intent to amend.
4. Numbered section-by-section edits under the conventions in step 5.
5. Ratification clause and general provisions.
6. `Amendment-procedure flags` section in the format above.
7. Signature block with placeholder names, titles, and dates.

## Boundaries

- Amend only the sections in scope; flag ripple effects as open items instead of expanding the edit.
- Do not re-draft the entire agreement; if the requested changes amount to a restatement, flag that for the operator instead of drafting one.
- Do not certify that amendment-procedure requirements are satisfied; flag them and route the determination to the operator or responsible attorney.
- Do not resolve legal determinations — enforceability, whether procedural prerequisites are met, jurisdiction-specific requirements — in the draft; flag them for the operator or responsible attorney.
- Do not transmit the draft or any matter document to a counterparty or any external party or system; the draft is a work product pending operator approval.
