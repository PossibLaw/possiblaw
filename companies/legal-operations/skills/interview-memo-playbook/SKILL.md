---
name: interview-memo-playbook
description: Draft witness-interview memoranda from supplied interview notes when an interview-memo matter arrives, producing a labeled work product with Upjohn-warning documentation and follow-up tracking.
metadata:
  sources:
    - path: companies/legal-operations/skills/interview-memo-playbook/SKILL.md
      kind: local-file
      usage: vendored
      license: Apache-2.0
      attribution: PossibLaw
---

# Interview Memo Playbook

Use this skill to draft a witness-interview memorandum from operator-supplied interview notes. The memo records what the notes support — nothing more — and never involves contacting a witness or any other person. Interview matters are sensitive: when the matter's `metadata.possiblaw.privacyTier` is `confidential` or `privileged`, run the `privacy-encoder` flow before any cloud-capable call and decode the final output before posting.

## When To Invoke

- The issue requests an interview memorandum drafted from interview notes, a warning-documentation record, or follow-up tracking from a completed interview.
- The issue requests revisions to an existing PossibLaw-drafted interview memo; rerun the relevant steps against the prior draft and list what changed.
- Do not invoke for chronology building or corruption-risk screening; those belong to other specialists in the investigations practice.

## Drafting Steps

1. Gather facts from the issue: matter name, interview date, location or medium, attendees with roles, witness name, role, and tenure, the interview notes, documents shown or discussed, counsel direction, and the memo author. If the notes, the witness identity, or the warning record is absent and no acceptable default applies, gate with `missing-info-gate` instead of guessing.
2. Document the warning. Record the Upjohn warning exactly as the notes state it — what was said, by whom, the witness's acknowledgment, and any questions the witness asked about it. Never default the warning to given; if the notes are silent on whether it was given, gate the question to the operator.
3. Apply the work-product label from the section below at the top of the memo, with privilege status marked for counsel confirmation. Never decide privilege status.
4. Draft the body sections in order:
   - Header: matter name, interview date, location or medium, attendees with roles, memo author and date
   - `Assumptions and open items`: every default used, placeholder, and gated question
   - Warning documentation: the record from step 2
   - Witness background: role, tenure, reporting line, and relevance, as stated in the notes
   - Topics covered and key statements: organized by topic, every statement attributed to its speaker, near-verbatim language only where the notes support it, and statements presented as the witness's recollections rather than established facts
   - Documents shown or discussed, with the witness's stated reactions
   - Follow-up items table: `| Follow-up | Basis | Owner |`, with the operator as the default owner
   - Observations: demeanor and credibility notes, explicitly labeled as observations, never as findings or conclusions
5. Verify fidelity. Confirm names, dates, titles, and quoted language match the notes exactly, and that nothing appears in the memo that the notes and issue context do not support.
6. Produce the output in the format below.

## Work-Product Label

Place this block at the top of every memorandum:

```
ATTORNEY WORK PRODUCT — PREPARED AT THE DIRECTION OF COUNSEL
PRIVILEGED AND CONFIDENTIAL — [PRIVILEGE STATUS — COUNSEL TO CONFIRM]
Do not forward, copy, or distribute.
```

The label asserts nothing final: privilege status is a counsel determination, and the placeholder stays until counsel confirms it.

## Output Format

- A single well-structured markdown memorandum: the work-product label block, then the body sections in the order above.
- The follow-up items section as a markdown table with owners.
- Preserve names, dates, titles, and quoted language from the notes exactly as given.

## Boundaries

- Never contact, interview, or follow up with a witness or any other person; the memo is drafted from supplied notes only.
- Do not decide privilege status, and do not conclude that wrongdoing occurred or did not occur; route those questions to the operator or responsible counsel.
- Do not transmit the memorandum or the underlying notes to any external party or system; the memo is a work product pending operator approval.
