---
name: ops-sop-playbook
description: Draft or revise internal standard-operating-procedure documents from operator-described processes when an SOP matter arrives, producing a versioned markdown work product with owner and review-cadence fields.
metadata:
  sources:
    - path: companies/legal-operations/skills/ops-sop-playbook/SKILL.md
      kind: local-file
      usage: vendored
      license: Apache-2.0
      attribution: PossibLaw
---

# Ops SOP Playbook

Use this skill to draft a new standard operating procedure or revise an existing one. The SOP documents how the operator says the process works; it never invents how the process should work.

## When To Invoke

- The issue requests a new SOP for an operator-described internal process.
- The issue requests revision of an existing SOP; rerun the relevant steps against the prior version and record the changes in the version history.
- Do not invoke for vendor intake records, HR checklists, or policy documents whose content turns on what the law requires; those belong to other specialists or the legal practice.

## SOP Document Structure

Draft the required sections in order:

1. Title and metadata block: SOP title, version number, effective date, owner, and review cadence.
2. Purpose: one or two sentences on why the process exists and what outcome it produces.
3. Scope: who and what the SOP covers, and what is explicitly out of scope.
4. Owner: the named role or person accountable for the process; default to `[OWNER — confirm]` when not specified.
5. Steps: numbered steps in execution order, each with the actor, the action, the tool or system used, and the expected result. Only steps the operator described; mark gaps with `[STEP NOT DESCRIBED — confirm with process owner]`.
6. Exceptions: the operator-described variations, escalation paths, and what to do when a step fails.
7. Review cadence: how often the SOP is reviewed and by whom; default to annual review by the owner with a bracketed note when not specified.
8. Version history: the table defined below, newest entry first.

## Version History Format

| Version | Date | Author | Changes |
|---|---|---|---|
| Semantic or simple incrementing version | Effective date of the change | Operator or agent acting on operator instruction | What changed and why, in one or two sentences |

## Revision Rules

- Bump the version and add a dated version-history entry on every revision; never silently rewrite an existing SOP.
- Show what changed: the version-history entry names the sections touched and the reason, and the completion note lists the substantive before/after for each changed step.
- Preserve the prior version's content for everything the operator did not ask to change; do not opportunistically rewrite untouched sections.
- When a revision request conflicts with the existing document (for example renumbering steps the operator still relies on), flag the conflict as an operator follow-up instead of resolving it silently.

## Never-Invent-Steps Rule

Every step, actor, tool, approval, and exception in the SOP must come from the operator's description, the prior version, or the issue context. Plausible-sounding gap filling is the failure mode this rule exists to prevent: when the description skips from step 3 to step 5, the SOP shows the gap with a `[STEP NOT DESCRIBED — confirm with process owner]` placeholder, never a guessed step 4.

## Boundaries

- Do not decide how the firm should operate; document the described process and flag inconsistencies as operator follow-ups.
- Do not resolve legal or compliance questions inside an SOP; flag legally regulated processes for legal review as an operator follow-up.
- Do not include credentials, keys, or system secrets; replace with `[CREDENTIAL — stored in approved secrets manager]` and flag the follow-up.
- Do not transmit the SOP to any external party or system; the document is a work product pending operator approval.
