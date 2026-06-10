---
name: privacy-incident-intake-checklist
description: Extract potential data-incident facts into a structured record when an incident matter arrives, producing a gap list and an operator follow-up list for notification regimes and deadlines.
metadata:
  sources:
    - path: companies/legal-operations/skills/privacy-incident-intake-checklist/SKILL.md
      kind: local-file
      usage: vendored
      license: Apache-2.0
      attribution: PossibLaw
---

# Privacy Incident Intake Checklist

Use this skill to convert raw reports of a potential data incident into a structured incident record. Capture facts exactly as the source states them, mark every gap, and frame every notification regime and deadline as an operator follow-up — never as a conclusion. Incident matters are sensitive: when the matter's `metadata.possiblaw.privacyTier` is `confidential` or `privileged`, run the `privacy-encoder` flow before any cloud-capable call and decode the final output before posting.

## Checklist Fields

Work through every field. Record `[NOT PROVIDED]` when the source has no answer; never silently skip a field.

1. **Incident description** — what happened, as reported, without characterizing the event as a breach.
2. **Data categories affected** — the kinds of personal data involved (identifiers, financial, health, credentials, special categories), as stated.
3. **Data subjects affected** — whose data (employees, customers, end users) and the count, marked `confirmed` or `estimated` per the source.
4. **Systems and locations involved** — the systems, vendors, applications, or physical locations touched, by the names the source uses.
5. **Occurrence timeline** — when the incident is believed to have started and ended, recorded separately from discovery.
6. **Discovery** — when and how the incident was discovered, and by whom.
7. **Containment actions** — steps already taken (credentials rotated, access revoked, systems isolated), with dates, as reported.
8. **Ongoing exposure** — whether the source states the exposure is contained, ongoing, or unknown.
9. **Third parties involved** — processors, vendors, insurers, forensic firms, or threat actors named in the source, recorded verbatim.
10. **Evidence preservation status** — what logs, images, or artifacts have been preserved and where, and whether anything has been altered or deleted.
11. **Jurisdictional touchpoints** — the locations of affected individuals, systems, and the business entities involved, as stated.

## Evidence-Preservation Note

Restate this note in every incident record: relevant logs, system images, access records, and communications should be preserved in place and not altered, rotated, or deleted while the matter is open; preservation decisions and forensic steps belong to the operator and responsible counsel. The skill records preservation status; it does not direct forensic work.

## Severity Signals

Record — do not score — the signals the operator will weigh: special-category or credential data involved, large or unknown subject counts, ongoing exposure, external threat-actor involvement, processor or vendor origin, and media or complainant awareness. List each signal present in the source under `Severity signals` in the record, citing where the source states it. Do not compute a severity rating or classification.

## Output: Structured Incident Record

Produce a markdown table with one row per checklist field:

| Field | Value | Source |
|---|---|---|
| Incident description | [value or `[NOT PROVIDED]`] | [issue description / operator comment / parent issue] |

Repeat for all eleven fields, then append the `Severity signals` rows and the evidence-preservation note.

## Output: Gap List

After the table, list every `[NOT PROVIDED]` or ambiguous field with:

- What is missing and why it matters for the operator's incident response.
- Who can supply it (operator, IT or security team, processor, vendor, counsel).
- Whether it blocks the rest of the record or only later follow-ups.

## Output: Operator Follow-Up List

Close with the follow-ups the operator or responsible attorney must resolve. Every notification regime and every deadline belongs here, framed as a question:

- **Potentially applicable notification regimes** — regimes that may apply given the jurisdictional touchpoints and data categories (for example state breach-notification statutes, GDPR or UK GDPR supervisory and data-subject notification, sectoral rules), each phrased as `Does [regime] apply? — operator/counsel to determine`.
- **Deadline questions** — any clock the operator may be on, phrased as `If [regime] applies, what is the notification window and when did it start? — operator/counsel to determine`. Never state a deadline, a clock start date, or an obligation as a conclusion.
- **Other follow-ups** — insurer notice questions, contractual notice obligations to customers or partners, and law-enforcement contact questions, each routed to the operator.

## Escalation for Privileged Content

If the source material appears privileged — it embeds legal advice, is addressed to or from counsel, or states it was prepared at the direction of counsel — pause extraction, leave a durable comment flagging the privilege question, and escalate to `chief-counsel`. Treat the matter as `privileged` tier for the `privacy-encoder` flow from that point on.

## Boundaries

- No breach determinations. Do not conclude whether the event is a reportable breach, whether any notification obligation exists, or when any deadline runs; those determinations belong to the operator and responsible counsel.
- No notifications. This skill produces an incident record and follow-up list; it never drafts or sends a notification to data subjects, regulators, insurers, or any external party.
