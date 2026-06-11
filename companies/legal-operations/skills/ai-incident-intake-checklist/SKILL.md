---
name: ai-incident-intake-checklist
description: Extract reported AI-incident facts into a structured record when an incident matter arrives, producing a gap list and escalation-path flags for the privacy practice and regulator-facing questions.
metadata:
  sources:
    - path: companies/legal-operations/skills/ai-incident-intake-checklist/SKILL.md
      kind: local-file
      usage: vendored
      license: Apache-2.0
      attribution: PossibLaw
---

# AI Incident Intake Checklist

Use this skill to convert raw reports of an AI incident into a structured incident record. Capture facts exactly as the source states them, mark every gap, and frame every escalation as a flag or question for the operator — never as a conclusion about fault, legality, or reporting obligations.

## Checklist Fields

Work through every field. Record `[NOT PROVIDED]` when the source has no answer; never silently skip a field.

1. **Incident description** — what happened, as reported, without characterizing fault or legality.
2. **AI system involved** — the system's name, whether it is vendor-supplied or internal, the version if stated, and the deployment context.
3. **Harm category** — in the reporter's terms (for example incorrect output relied on, biased or discriminatory result, confidential or personal data exposed, unauthorized automated action, safety or security issue), without reclassifying or scoring.
4. **Affected parties** — who is affected (employees, customers, end users, third parties) and the count, marked `confirmed` or `estimated` per the source.
5. **Data involved** — the data categories input to or exposed by the system, noting personal data explicitly when the source states it.
6. **Occurrence timeline** — when the incident is believed to have started and ended, recorded separately from discovery.
7. **Discovery** — when and how the incident was discovered, and by whom.
8. **Containment status** — actions taken (system disabled, access revoked, output retracted or corrected), with dates, as reported.
9. **Ongoing exposure** — whether the source states the exposure is contained, ongoing, or unknown.
10. **Human-review posture** — whether the output or action was subject to human review before use, as stated.
11. **Third parties involved** — vendors, model providers, customers, or processors named in the source, recorded verbatim.
12. **Evidence-preservation status** — what prompts, outputs, logs, model and configuration versions, and communications have been preserved and where, and whether anything has been altered or deleted.

## Evidence-Preservation Note

Restate this note in every incident record: relevant prompts, outputs, logs, model and configuration versions, and communications should be preserved in place and not altered, rotated, or deleted while the matter is open; preservation decisions and forensic steps belong to the operator and responsible counsel. The skill records preservation status; it does not direct forensic or remediation work.

## Escalation-Path Flags

Raise each applicable flag in the record and in the follow-up list; never act on a flag yourself:

- **Privacy-practice flag** — when personal data was input to or exposed by the system, state: `Escalation: privacy practice — personal data involved; recommend a privacy-practice handoff via ai-governance-lead`.
- **Regulator-facing flag** — possible reporting obligations, regulator inquiries, or public statements, each phrased as a question for the operator (for example `Does any reporting obligation apply? — operator/counsel to determine`). Never state an obligation, deadline, or clock start as a conclusion.
- **Vendor-notice flag** — contractual notice questions to or from the AI vendor, routed to the operator.
- **Privileged-content escalation** — if the source material appears privileged (embeds legal advice, is addressed to or from counsel, or states it was prepared at counsel's direction), pause extraction, leave a durable comment flagging the privilege question, and escalate to `chief-counsel`.

## Output: Structured Incident Record

Produce a markdown table with one row per checklist field:

| Field | Value | Source |
|---|---|---|
| Incident description | [value or `[NOT PROVIDED]`] | [issue description / operator comment / parent issue] |

Repeat for all twelve fields, then append the evidence-preservation note.

## Output: Gap List

After the table, list every `[NOT PROVIDED]` or ambiguous field with:

- What is missing and why it matters for the operator's response.
- Who can supply it (operator, engineering or security team, vendor, counsel).
- Whether it blocks the rest of the record or only later follow-ups.

## Output: Escalation and Follow-Up List

Close with the escalation-path flags raised and the follow-ups the operator or responsible attorney must resolve, each framed as a question or handoff — never as a conclusion or a step the skill takes.

## Boundaries

- No determinations. Do not conclude fault, legal exposure, whether the event violates any law or contract, or whether any reporting obligation exists; those determinations belong to the operator and responsible counsel.
- No notifications. This skill produces an incident record and follow-up list; it never drafts or sends a notice to a vendor, regulator, affected party, or any external party or system.
- No privacy analysis. When personal data is involved, raise the privacy-practice flag; the analysis belongs to the privacy practice.
