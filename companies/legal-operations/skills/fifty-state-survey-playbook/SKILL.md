---
name: fifty-state-survey-playbook
description: Build a 50-state survey skeleton when a multi-jurisdiction survey matter arrives, producing issue framing, a per-state table with statute and rule placeholders, and methodology notes, with every per-state entry marked UNCONFIRMED until verified against primary sources.
metadata:
  sources:
    - path: companies/legal-operations/skills/fifty-state-survey-playbook/SKILL.md
      kind: local-file
      usage: vendored
      license: Apache-2.0
      attribution: PossibLaw
---

# Fifty-State Survey Playbook

Use this skill to build the structure of a multi-jurisdiction survey — the issue framing, the per-state table, and the methodology notes — that the research team or operator then verifies against primary sources. The skeleton holds placeholders, not settled state law: no entry is ever filled from memory, and every entry stays `UNCONFIRMED` until it passes the verification gate below.

## Drafting Steps

1. Frame the issue. Restate the survey question exactly as the issue frames it, without expanding its scope. Record the scope (who and what the question covers), the as-of date as `[AS-OF DATE]` unless the operator supplied one, and every scope ambiguity as an operator follow-up for the methodology notes.
2. Set the jurisdiction rows. Default to all 50 states plus the District of Columbia (51 rows), with U.S. territories excluded and the exclusion noted in the methodology notes, plus one federal-law row marked `[SCOPE: OPERATOR TO CONFIRM]`. Use a different jurisdiction set only when the issue states one.
3. Build the per-state table with columns `Jurisdiction`, `Primary authority`, `Rule summary`, `Verification status`, and `Notes`:
   - `Primary authority` holds `[STATUTE/RULE CITATION — to be verified]` placeholders. Never fill a citation from memory.
   - `Rule summary` holds `[RULE SUMMARY — to be verified]` placeholders, or operator-supplied content recorded with its attribution.
   - `Verification status` is `UNCONFIRMED` for every row, including rows with operator-supplied content.
   - `Notes` holds scope caveats or operator follow-ups specific to the row.
4. Apply the verification gate. This gate is explicit and mandatory:
   - Every per-state entry starts and stays `UNCONFIRMED` until a member of the research team or the operator (a) checks the entry against the primary source itself — the statute, regulation, or rule as published by the jurisdiction, (b) records the primary-source citation and the date checked, and (c) records who verified it.
   - This skill never performs that verification and never changes a status itself; an entry changes status only when the gate is satisfied by the research team or operator.
   - Until a row passes the gate, nothing in it — and no pattern or generalization across rows — may be presented as settled law in any jurisdiction.
5. Insert the draft banner at the top of the document, verbatim: `DRAFT SKELETON — No entry in this survey has been verified against primary sources. Every per-state entry is UNCONFIRMED until the verification gate in the methodology notes is satisfied. Do not rely on or circulate this document.`
6. Write the methodology notes: the sources to consult per jurisdiction (the jurisdiction's published statutes, regulations, and rules), inclusions and exclusions, defaults used, the verification-gate statement from step 4, and every open scope question as an operator follow-up.

## Output Format

Produce a single markdown document skeleton in this order:

1. Issue framing — the question presented, scope, and as-of date placeholder.
2. Draft banner — the verbatim banner from step 5.
3. Per-state table — one row per jurisdiction with placeholders and `UNCONFIRMED` status.
4. Methodology notes — sources to consult per jurisdiction, inclusions and exclusions, defaults used, the verification-gate statement, and open scope questions.

## Boundaries

- Never fill a per-state entry from memory; entries hold placeholders unless the operator supplied the content, and even operator-supplied entries stay `UNCONFIRMED` until verified against primary sources.
- Never change a verification status, remove the draft banner, or present any entry, pattern, or generalization as settled law in any jurisdiction.
- Do not transmit the skeleton to any external party or system; it is a work product pending verification and operator action.
