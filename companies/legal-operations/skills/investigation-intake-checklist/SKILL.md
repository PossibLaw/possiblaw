---
name: investigation-intake-checklist
description: Extract workplace-complaint facts into a structured intake record when an investigation-intake matter arrives, producing a gap list and escalation flags for interim measures and routing.
metadata:
  sources:
    - path: companies/legal-operations/skills/investigation-intake-checklist/SKILL.md
      kind: local-file
      usage: vendored
      license: Apache-2.0
      attribution: PossibLaw
---

# Investigation Intake Checklist

Use this skill to convert a raw workplace complaint into a structured intake record. Capture facts exactly as the source states them, mark every gap, and frame every interim measure and escalation path as a flag for the operator or responsible counsel — never as a conclusion, instruction, or outreach. Complaint matters are sensitive: when the matter's `metadata.possiblaw.privacyTier` is `confidential` or `privileged`, run the `privacy-encoder` flow before any cloud-capable call and decode the final output before posting.

## Checklist Fields

Work through every field. Record `[NOT PROVIDED]` when the source has no answer; never silently skip a field.

1. **Complaint description** — what was reported, as stated, without characterizing the conduct as unlawful or the complaint as substantiated.
2. **Complainant** — name, role, and reporting line, or `anonymous` as the source states.
3. **Respondent(s)** — each person the allegations are made against, with role and reporting line as stated.
4. **Other parties affected** — anyone else the source identifies as involved or impacted.
5. **Allegations** — each allegation separately, as reported, with the conduct, who, and where, in the source's terms.
6. **Dates and timeline** — when the alleged conduct occurred or began, recorded separately from the report date; single events and patterns each as stated.
7. **Report date and channel** — when and how the complaint was made (hotline, manager, email, in person) and to whom.
8. **Witnesses named** — each witness the source identifies and what the source says they observed; never contact them.
9. **Evidence locations** — documents, messages, systems, recordings, and physical locations the source identifies, by the names the source uses.
10. **Prior reports or related history** — earlier complaints, warnings, or related matters the source states, recorded verbatim.
11. **Interim-measure flags** — measures the source requests or implicates (separation of the parties, schedule or reporting-line changes, leave, system-access changes), recorded as flags for operator decision, never as directives.
12. **Confidentiality and retaliation concerns** — any request for confidentiality and any stated fear or report of retaliation.
13. **Locations and jurisdictional touchpoints** — the work locations and entities involved, as stated.

## Evidence-Preservation Note

Restate this note in every intake record: relevant documents, messages, access records, recordings, and personnel files should be preserved in place and not altered or deleted while the matter is open; preservation decisions and any litigation-hold question belong to the operator and responsible counsel. The skill records evidence locations; it does not collect, confirm, or preserve anything.

## Escalation Flags

Record — do not act on — the escalation signals the operator and counsel will weigh. List each signal present in the source under `Escalation flags`, citing where the source states it, each framed as a question for the operator or responsible counsel:

- Allegations against an executive, officer, or anyone in the complainant's reporting chain.
- Potential criminal conduct, threats, or safety risks.
- An agency charge, demand letter, or litigation already filed or threatened.
- Possible legal-deadline exposure, phrased as `Does a reporting or response clock apply? — operator/counsel to determine`, never as a stated deadline.
- Retaliation reports or confidentiality requests that constrain routing.
- Media, regulator, or external awareness of the complaint.

## Output: Structured Intake Record

Produce a markdown table with one row per checklist field:

| Field | Value | Source |
|---|---|---|
| Complaint description | [value or `[NOT PROVIDED]`] | [issue description / operator comment / parent issue] |

Repeat for all thirteen fields, then append the `Escalation flags` rows and the evidence-preservation note.

## Output: Gap List

After the table, list every `[NOT PROVIDED]` or ambiguous field with:

- What is missing and why it matters for the operator's next step.
- Who can supply it (operator, reporting manager, HR records, counsel) — never the parties or witnesses directly.
- Whether it blocks the rest of the record or only later follow-ups.

## Output: Escalation-Flag List

Close with the flags the operator or responsible counsel must resolve: each interim-measure flag, each escalation signal, and the routing question — who should investigate (internal HR, counsel, or an external investigator) — phrased as `Operator/counsel to decide`. Never select the investigator, direct an interim measure, or state a legal obligation as a conclusion.

## Escalation for Privileged Content

If the source material appears privileged — it embeds legal advice, is addressed to or from counsel, or states it was prepared at the direction of counsel — pause extraction, leave a durable comment flagging the privilege question, and escalate to `chief-counsel`. Treat the matter as `privileged` tier for the `privacy-encoder` flow from that point on.

## Boundaries

- No interviews and no contact. Do not interview, question, or contact the complainant, respondent, witnesses, or any other party; intake works only from material already in the issue.
- No findings. Do not assess credibility, determine whether any allegation is substantiated or unlawful, or recommend discipline or remedies; those determinations belong to the operator and responsible counsel.
- No notifications. This skill produces an intake record and flag lists; it never sends or transmits the record or any complaint material to any external party or system.
