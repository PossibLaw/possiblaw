---
name: i9-audit-checklist
description: Audit operator-supplied I-9 records and E-Verify case histories when an internal audit matter arrives, producing a risk-rated findings table with a remediation flag on every row.
metadata:
  sources:
    - path: companies/legal-operations/skills/i9-audit-checklist/SKILL.md
      kind: local-file
      usage: vendored
      license: Apache-2.0
      attribution: PossibLaw
---

# I-9 Audit Checklist

Use this skill to run a structured internal audit of I-9 records and E-Verify case histories supplied in the matter. The output is a findings table the operator can act on row by row. The audit works only on records provided; it never touches a government system, and its timing and retention checkpoints are audit checkpoints, not settled legal conclusions — confirmation of current requirements routes to the operator or responsible immigration attorney.

## Audit Steps

1. Scope intake. Record the record population as the issue defines it, the audit date range, the records actually received, and any records identified but not provided. If the population, date range, or the records themselves are absent and no acceptable default applies, gate with `missing-info-gate` instead of guessing.
2. Section 1 review, per record. Check that Section 1 exists, is signed and dated by the employee, that the completion date does not fall after the recorded first day of employment (timing checkpoint), and that required fields — name, address, date of birth, attestation checkbox, preparer/translator certification where used — are complete and internally consistent.
3. Section 2 review, per record. Check that Section 2 is completed and signed by the employer representative, that the completion date falls within the employer's documented completion window relative to the start date (timing checkpoint), and that document title, issuing authority, number, and expiration are recorded for an acceptable-list combination as stated on the form version used. Record document-combination anomalies as findings; do not adjudicate whether a specific document is genuine or sufficient.
4. Reverification review. For records showing expiring employment authorization, check whether reverification (Section 3 or Supplement B, per the form version) was completed before the recorded expiration (timing checkpoint), and flag expired authorizations with no reverification recorded.
5. Retention review. Against the roster supplied, flag current employees with no I-9 on file, former employees whose records appear to have been purged early against the retention checkpoint the operator states, and records retained without a stated basis. Where the operator has not stated a retention rule, mark the checkpoint `[VERIFY — COUNSEL]` rather than assuming one.
6. E-Verify review, against supplied case histories only. Flag hires in the stated E-Verify population with no case record, cases opened outside the employer's documented window (timing checkpoint), unresolved tentative nonconfirmations, and cases never closed.
7. Rate each finding:
   - `High`: missing form or section, no employment-authorization documentation recorded, expired authorization with no reverification, current employee with no I-9 on file, unresolved tentative nonconfirmation.
   - `Medium`: late completion against a timing checkpoint, correctable field errors or omissions, document-recording inconsistencies, E-Verify case not closed.
   - `Low`: clerical or formatting issues that do not obscure the record's content.
8. Pair every finding with a remediation flag — the specific step the operator or responsible attorney should take; the audit never corrects records. Where a finding suggests possible penalty exposure, note the exposure as a flag and route quantification to the responsible attorney.
9. Produce the findings table and summary in the format below.

## Findings Table Format

| Record | Category | Risk | Issue | Remediation flag |
|---|---|---|---|---|
| Record identifier as supplied | Missing fields / Late completion / Document issues / Retention gaps / E-Verify gaps | High / Medium / Low | One- or two-sentence issue statement with rationale | Specific step for the operator or responsible attorney |

Sort `High` findings first. Use the category labels above so findings can be counted by category.

## Summary and Next Actions

Close the audit with:

- Audit scope statement: population, date range, records received, records identified but not provided.
- Finding counts by risk level and by category.
- Timing and retention checkpoints used and which need confirmation by the responsible attorney.
- An ordered list of remediation flags starting with `High` findings, each naming the operator or responsible attorney as the actor.

## Boundaries

- Do not contact, query, or transmit anything to E-Verify, USCIS, ICE, or any other government system or external party; the audit works only on records provided in the matter.
- Do not conclude whether any employee is work-authorized or whether the employer is compliant; findings flag issues for the operator or responsible immigration attorney to resolve.
- Do not correct, annotate, or rewrite the underlying I-9 records; remediation steps are flagged for the operator to execute.
- Do not compute fines or penalties; note possible exposure as a flag and route quantification to the responsible attorney.
- Do not state timing or retention requirements as settled law; they are audit checkpoints pending counsel confirmation.
