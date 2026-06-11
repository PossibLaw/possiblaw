---
name: dsr-playbook
description: Convert an incoming data subject request into a structured intake and tracking record when a DSR matter arrives, producing a request record, identity-verification checklist, systems-to-search list, response-clock table with deadline flags, and operator follow-ups.
metadata:
  sources:
    - path: companies/legal-operations/skills/dsr-playbook/SKILL.md
      kind: local-file
      usage: vendored
      license: Apache-2.0
      attribution: PossibLaw
---

# DSR Intake and Tracking Playbook

Use this skill to convert a data subject request into a structured tracking record the operator can run the response from. Capture facts exactly as the source states them, mark every gap, and frame every deadline, validity, and exemption question as an operator follow-up — never as a conclusion. DSR matters carry personal data by default: when the matter's `metadata.possiblaw.privacyTier` is `confidential` or `privileged`, run the `privacy-encoder` flow before any cloud-capable call and decode the final output before posting.

## Intake and Tracking Steps

1. Build the request record. One row per field, with `[NOT PROVIDED]` marking gaps; never silently skip a field:
   - Requester name and stated relationship to the data (customer, employee, end user, authorized agent), exactly as stated.
   - Channel received and date received.
   - Request type — access, deletion, correction, portability, opt-out or restriction, objection, or other — classified only from the requester's own words. If the words support more than one type, record each candidate and flag the ambiguity for operator clarification instead of guessing.
   - Verbatim request text or its location in the issue.
   - Privacy regimes the operator names as potentially applicable, recorded as named.
2. Build the identity-verification checklist. List the verification evidence received and the evidence outstanding, each as its own line, and record the verification status exactly as the operator states it. Never declare identity verified, and never propose accepting weaker evidence than the operator requested.
3. Build the systems-to-search table. List each system named in the issue or in company records the issue references, with the system owner and a search status of `not started`, `in progress`, or `complete as reported`. Do not add systems from general knowledge of what companies typically run.
4. Build the response-clock table. Record the received date, the acknowledgment date if any, and one row per regime the operator names as potentially applicable. Mark every statutory deadline `[DEADLINE — operator or counsel to determine]`; never state a deadline, a clock start date, or an extension as settled.
5. Compile the gap list and operator follow-ups. List every missing fact with who can supply it, and every deadline, validity, exemption, and regime-applicability question framed for the operator or responsible attorney.
6. On later updates, update the existing record rather than starting a new one, and date each update.

## Output: Request Record

| Field | Value | Source |
|---|---|---|
| Requester name | [value or `[NOT PROVIDED]`] | [issue description / operator comment / parent issue] |

Repeat for every field in step 1.

## Output: Identity-Verification Checklist

- `Evidence received`: one line per item, as stated.
- `Evidence outstanding`: one line per item the operator's verification approach still requires.
- `Verification status`: exactly as the operator states it, or `[NOT STATED BY OPERATOR]`.

## Output: Systems-to-Search Table

| System | Owner | Search status |
|---|---|---|

## Output: Response-Clock Table

| Regime (as named by operator) | Date received | Acknowledgment date | Statutory deadline |
|---|---|---|---|
| [regime] | [date] | [date or `[NOT PROVIDED]`] | `[DEADLINE — operator or counsel to determine]` |

## Output: Gap List and Operator Follow-Ups

- Each missing fact, why it matters to the response, and who can supply it.
- Each deadline, validity, exemption, or regime question, phrased as a question routed to the operator or responsible attorney.

## Boundaries

- Never respond to, acknowledge, or contact the data subject, and never transmit the record or any response to an external party or system; the record is a work product pending operator action.
- Do not determine whether the request is valid, which regime applies, whether an exemption applies, or when any response clock expires; those determinations belong to the operator and responsible counsel.
- Do not search systems yourself or add systems, dates, or facts the source does not state.
