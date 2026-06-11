---
name: aml-kyc-intake-checklist
description: Organize operator-supplied know-your-customer intake materials when a customer-intake screening matter arrives, producing a document completeness table, a beneficial-ownership chain, a list of screening checks to run, and gap and risk-indicator flags without clearing or onboarding anyone.
metadata:
  sources:
    - path: companies/legal-operations/skills/aml-kyc-intake-checklist/SKILL.md
      kind: local-file
      usage: vendored
      license: Apache-2.0
      attribution: PossibLaw
---

# AML KYC Intake Checklist

Use this skill to organize operator-supplied KYC intake materials into completeness tables with flagged gaps and risk indicators. Record every value exactly as the supplied materials state it with a source cite. This is organizing and flagging only: no customer is cleared, approved, onboarded, or rejected, and no party is ever declared cleared against any government, sanctions, or watch list.

## Intake Steps

1. Build the document inventory. List the expected intake items for the customer type and mark each `received`, `outstanding`, or `[NOT PROVIDED]`, with a source cite for every received item:
   - For individuals: government-issued identification, proof of address, and source-of-funds information as supplied.
   - For entities: formation documents, ownership register or equivalent, registry extract or good-standing evidence as supplied, authorized-signatory list, and beneficial-ownership declarations.
   - Any additional items the operator's intake instructions name.
2. Map the beneficial-ownership chain. Apply these mapping rules:
   - Record each ownership layer as stated, with the stated percentages verbatim, until the chain reaches named natural persons or the supplied materials stop.
   - Mark every unresolved layer `[NOT PROVIDED]`.
   - Flag nominee arrangements, bearer shares, and circular structures as gaps or risk indicators rather than resolving them.
3. Build the screening-check list. For the customer entity and each named beneficial owner and authorized signatory, list the checks still to be run: sanctions-list screening, PEP screening, and adverse-media screening. Record any operator-supplied screening results verbatim; never run a clearance determination and never characterize a screening result as cleared.
4. Flag risk indicators factually. List each indicator present in the supplied materials with its factual basis and source cite — for example inconsistent names or addresses across documents, a recently formed entity with no operating history, or unexplained ownership changes. Do not rate overall customer risk or recommend acceptance or rejection.
5. Check the escalation triggers. Flag prominently and escalate to the operator through the lead when the supplied materials report any of:
   - An operator-supplied screening result reporting a potential list or watch-list match — never act on or resolve the match.
   - A stated refusal to provide beneficial-ownership information.
   - Supplied documents that contradict each other on identity or ownership.
6. Compile the gap list: every missing item, who can supply it, and whether it blocks the rest of the intake organization or only later follow-ups.

## Output: Document Completeness Table

| Expected item | Status | Source |
|---|---|---|

One row per expected item, with status `received`, `outstanding`, or `[NOT PROVIDED]`.

## Output: Beneficial-Ownership Chain

| Layer | Owner (as stated) | Ownership % (as stated) | Source |
|---|---|---|---|

One row per ownership layer, with `[NOT PROVIDED]` marking unresolved layers.

## Output: Screening Checks

| Subject | Sanctions check | PEP check | Adverse-media check |
|---|---|---|---|
| [entity or named person] | To be run / [operator-supplied result, verbatim] | To be run / [operator-supplied result, verbatim] | To be run / [operator-supplied result, verbatim] |

## Output: Gaps and Risk-Indicator Flags

- Each missing item, who can supply it, and whether it blocks the intake organization.
- Each risk indicator with its factual basis and source cite, and any escalation trigger present.

## Boundaries

- Never clear, approve, onboard, or reject a customer, and never declare a party cleared against any government, sanctions, or watch list; screening determinations belong to the operator and responsible counsel.
- Never transmit intake materials, screening requests, or findings to any external party or system; the tables are work products pending operator action.
- Work from operator-supplied inputs only; never look up a customer in any external registry, list, or media source on your own initiative.
- Do not opine on whether the operator's AML or KYC program satisfies any regulator's requirements; route program-adequacy questions to the operator or responsible attorney.
