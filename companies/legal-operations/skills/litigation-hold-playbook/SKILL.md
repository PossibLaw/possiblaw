---
name: litigation-hold-playbook
description: Draft litigation-hold (preservation) notices when litigation is filed, threatened, or reasonably anticipated, producing a markdown work product with custodian, source-scope, and acknowledgment-tracking sections and defaults for missing facts.
metadata:
  sources:
    - path: companies/legal-operations/skills/litigation-hold-playbook/SKILL.md
      kind: local-file
      usage: vendored
      license: Apache-2.0
      attribution: PossibLaw
---

# Litigation Hold Playbook

Use this skill to draft a litigation-hold (preservation) notice, a hold reminder, or a release-of-hold note. Apply the defaults below when the operator has not provided contrary instructions, and mark missing legal or business facts with bracket placeholders. Hold matters are sensitive: when the matter's `metadata.possiblaw.privacyTier` is `confidential` or `privileged`, run the `privacy-encoder` flow before any cloud-capable call and decode the final output before posting.

## When To Invoke

- A trigger event has occurred or is described in the issue: a complaint or arbitration demand has been served or filed, a demand letter or cease-and-desist has been received, a government or regulatory inquiry has arrived, an employee or counterparty has threatened claims, or the operator states that litigation is reasonably anticipated.
- The issue requests a hold reminder for custodians on an existing hold, an update to a hold's scope, or a release-of-hold note for a concluded matter.
- Do not invoke for demand-letter drafting, docket monitoring, or general document-retention policy work; those belong to other specialists or practices. Whether the duty to preserve has attached is a legal conclusion for the operator or licensed counsel, not this skill.

## Drafting Steps

1. Gather facts from the issue: matter name and description, the trigger event and its date, custodian names and roles, the preservation date range, the systems and sources in scope, the issuing signatory, the acknowledgment deadline, and any prior hold on the same matter.
2. Identify custodians. List every named custodian with role and department. Where the issue describes the dispute but names no custodians, produce a custodian-identification question list for the operator instead of guessing: who worked on the disputed subject, who supervised them, who administers the relevant systems, and who has since left the company (flag departed custodians for IT preservation of their accounts).
3. Draft the notice sections in order:
   - Header and addressees: matter name or `[MATTER NAME]`, issue date line, and the custodian distribution list or `[CUSTODIAN LIST]` placeholder.
   - Purpose statement: a plain-language explanation that the company must preserve information related to the matter, describing the dispute factually without characterizing fault or predicting outcomes.
   - Scope of subject matter: the topics, projects, products, parties, and time period covered, using the preservation date range or a `[PRESERVATION DATE RANGE]` placeholder.
   - Sources to preserve: email and calendars, chat and messaging platforms, shared drives and cloud storage, local devices (laptops, phones, tablets, external media), collaboration and ticketing tools, voicemail, text messages, and hard-copy documents; tailor the list to the systems named in the issue and add `[ADDITIONAL SYSTEMS]` for unknowns.
   - Suspension of auto-deletion: an instruction that routine destruction, auto-archive, auto-delete, and retention-schedule purges must be suspended for in-scope sources, with an `[IT/RECORDS OWNER]` placeholder naming who executes the suspension.
   - Do-not-alter instruction: do not delete, edit, overwrite, forward-and-delete, or migrate in-scope information; preserve metadata; route questions to the issuing signatory.
   - Acknowledgment requirement: each custodian must confirm receipt and compliance by the acknowledgment deadline, with the tracking mechanism stated.
   - Questions and contact: the issuing signatory or `[ISSUING SIGNATORY]` placeholder with title and contact line.
4. Build the acknowledgment tracker: a markdown table with one row per custodian — name, role, notice sent date, acknowledgment received date, reminder dates — initialized with `[PENDING]` entries.
5. Set the reminder cadence: state when reminders go to non-acknowledging custodians and when periodic re-issuance refreshes the hold for all custodians, using the defaults below unless the operator specifies otherwise.
6. For a release-of-hold request: draft a short release note stating the matter, the release date, that the operator has confirmed the matter is concluded, and that custodians may resume normal retention practices only for material not subject to any other hold; include an `[OPERATOR CONFIRMATION]` placeholder — never release a hold on your own judgment.
7. Apply defaults. Fill every remaining gap from the defaults table in the drafting agent's instructions, and list each default used.
8. Produce the output in the format below.

## Output Format

- A single well-structured markdown document: title, date line, addressee block, body sections in the order above, the acknowledgment tracker table, and the signatory block.
- A short `Assumptions and open items` section before the notice body listing every placeholder, default, custodian-identification question, and operator follow-up.
- Preserve operator-specified names, dates, systems, and matter descriptions exactly as given.

## Acknowledgment and Reminder Cadence

- Acknowledgment deadline: 5 business days from issuance unless the operator specifies otherwise.
- First reminder: 3 business days after a missed acknowledgment deadline, addressed to the custodian.
- Second reminder: 5 business days after the first, copying the custodian's manager, flagged as an operator follow-up.
- Periodic refresh: re-issue the hold to all custodians every 6 months while the matter is open, flagged as an operator follow-up.

## Escalation Triggers

- The matter overlaps with privileged material, an internal investigation, or counsel-directed work product: flag for `chief-counsel` before the notice issues.
- The matter involves a government or regulatory inquiry, subpoena, or preservation order: flag for `chief-counsel`; regulatory preservation obligations may exceed this playbook's scope.
- A custodian reports that in-scope information has already been deleted or altered: flag for `chief-counsel` and the operator immediately; do not characterize the legal significance.
- The operator asks whether the duty to preserve has attached, or what spoliation exposure exists: route to the operator or licensed counsel as a legal conclusion.

## Boundaries

- Do not opine on whether the duty to preserve has attached, what a court would sanction, or the legal sufficiency of the hold; flag those questions for the operator or licensed counsel.
- Do not transmit the notice to custodians, IT, or any external party or system; the draft is a work product pending operator approval, and the operator distributes it.
- Do not release a hold without explicit operator confirmation recorded in the issue.
- For confidential or privileged matters, never send unencoded matter content to a cloud-capable model; the privacy-encoder flow is mandatory.
