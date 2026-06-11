---
name: ip-assignment-playbook
description: Draft IP assignment agreements, work-for-hire provisions, and invention-assignment clauses when an assignment matter arrives, producing a complete instrument draft with jurisdiction-dependent points flagged and recordation steps reserved for the operator.
metadata:
  sources:
    - path: companies/legal-operations/skills/ip-assignment-playbook/SKILL.md
      kind: local-file
      usage: vendored
      license: Apache-2.0
      attribution: PossibLaw
---

# IP Assignment Playbook

Use this skill to draft an IP assignment agreement, a work-for-hire provision, or an invention-assignment clause set. Apply the defaults in the drafting agent's instructions when the operator has not provided contrary terms, flag every jurisdiction-dependent point for the operator, and list recordation steps as operator follow-ups without ever performing one.

## Drafting Steps

1. Classify the instrument. Determine from the issue whether the request is a standalone assignment agreement, a work-for-hire provision for inclusion in another agreement, an invention-assignment clause set (typically for employment or contractor contexts), or a combination, and record the classification with the issue facts that support it.
2. Gather facts. Record the parties, the IP to be assigned, the consideration, the relationship context (employment, contractor, acquisition, settlement), the governing-law preference, and the effective date, exactly as the issue states them.
3. Draft the operative grant. Use present-tense assignment language (`hereby assigns`) for the operative grant. Where work-for-hire treatment is intended, include the work-for-hire acknowledgment plus a backup assignment rather than relying on either alone.
4. Draft the full agreement structure when the instrument is a standalone agreement:
   - Recitals identifying the parties and the context of the assignment.
   - Definitions, including the assigned IP defined by reference to the schedule.
   - Assignment grant per step 3, with the scope-carve-outs placeholder.
   - Work-for-hire acknowledgment with backup assignment, where applicable.
   - Schedules: the assigned-IP schedule and, for invention-assignment contexts, the prior-inventions schedule.
   - Further assurances, including cooperation with future registrations and recordations, with the recordation steps themselves flagged as operator follow-ups.
   - Moral-rights waiver-to-the-extent-permitted language with its jurisdiction-dependent flag.
   - Governing-law placeholder and effective-date placeholder.
   - Signature blocks for each party with name, title, and date placeholders.
   When the issue requests a standalone provision or clause set instead, draft only the matching sections in self-contained form.
5. Flag jurisdiction-dependent points. Statutory limits on employee invention assignments and the effect of moral-rights waivers are jurisdiction-dependent: include the employee-invention carve-out placeholder marked jurisdiction-dependent for the operator to confirm, keep the moral-rights flag attached to the waiver language, and never resolve either in the draft.
6. Apply the recordation-flag rules. List recordation steps — for example assignment recordation with the patent and trademark registry, and copyright-recordation steps — as operator follow-ups stating what would be recorded and where. Never perform, prepare for filing, or schedule a recordation.
7. Apply defaults. Fill every remaining gap from the defaults table in the drafting agent's instructions, and list each default used.
8. Produce the output in the format below.

## Output Format

- An `Assumptions and open items` section listing every default used, every jurisdiction-dependent flag, and every recordation follow-up.
- The complete instrument body in well-structured markdown following the step 4 structure, or the standalone provision or clause set when the issue requests one; never a fragment or outline.
- A closing list of operator follow-ups, with recordation steps stated as actions reserved for the operator.

## Boundaries

- Never file, record, send, submit, or transmit the instrument to any registry, counterparty, or other external party or system; drafts are work products pending operator approval.
- Do not opine on whether an assignment or covenant is enforceable, or how a court or registry would treat it; those determinations belong to the operator and responsible counsel.
- Do not state the adequacy of consideration or resolve any jurisdiction-dependent point in the draft; flag each for the operator.
