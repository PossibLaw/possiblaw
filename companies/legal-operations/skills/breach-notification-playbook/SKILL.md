---
name: breach-notification-playbook
description: Draft audience-specific breach-notification letters after the operator has decided to notify, producing complete individuals, regulator, and partner letter drafts with every deadline and threshold flagged as jurisdiction-dependent and nothing sent.
metadata:
  sources:
    - path: companies/legal-operations/skills/breach-notification-playbook/SKILL.md
      kind: local-file
      usage: vendored
      license: Apache-2.0
      attribution: PossibLaw
---

# Breach Notification Playbook

Use this skill to draft breach-notification letters for the audiences the operator identifies — affected individuals, regulators, and business partners. Draft from the incident facts in the issue or the linked incident record only, and never resolve a deadline or threshold question in a draft. Breach matters are sensitive by default: when the matter's `metadata.possiblaw.privacyTier` is `confidential` or `privileged`, run the `privacy-encoder` flow before any cloud-capable call and decode the final output before posting.

## When To Invoke

- The operator or responsible counsel has decided to notify and the issue identifies which audiences need letters.
- Do not invoke when the issue asks whether notification is required, whether a threshold is met, or when notification is due; those are senior decisions outside this skill.

## Drafting Steps

1. Confirm the decision and audiences. Record where the issue states the decision to notify and which audiences the operator identified. Draft one complete letter per identified audience; never deliver a fragment or outline.
2. Gather incident facts. Use only the incident facts in the issue or the linked incident record. Never invent incident details, affected counts, or remediation commitments, and carry every count's `confirmed` or `estimated` marking through unchanged.
3. Draft the individuals letter using this skeleton:
   - Salutation and notifying-entity identification.
   - What happened: a plain description of the incident, with incident date and discovery date stated separately.
   - What information was involved: the affected data categories as the incident record states them.
   - What we are doing: containment and remediation steps limited to actions the incident record reports.
   - What you can do: factual protective steps appropriate to the data categories, plus the support offer placeholder.
   - For more information: the contact channel placeholder.
   - Signature block placeholder.
4. Draft the regulator letter using this skeleton:
   - Regulator addressee placeholder.
   - Notifying-entity identification and contact placeholder.
   - Incident description and timeline: occurrence, discovery, and containment dates as the record states them.
   - Data categories and affected counts, carrying `confirmed` or `estimated` markings.
   - Containment and remediation steps as reported.
   - Plan for notifying affected individuals, stated as the operator's plan, with the send-date placeholder.
   - Point of contact for the regulator.
5. Draft the partner letter using this skeleton:
   - Partner addressee and the contract notice clause placeholder.
   - Incident description limited to the facts relevant to the partner's data or services.
   - Data categories and counts relevant to the partner, as the record states them.
   - Containment and remediation steps as reported.
   - Coordination point of contact.
6. Apply the deadline-flag rules. Notification deadlines and notification thresholds are jurisdiction-dependent: mark every such point `[OPERATOR/COUNSEL TO DETERMINE]`, leave the send date as a placeholder for the operator to set after the deadline determination, and never resolve either in a draft.
7. Apply defaults. Fill every remaining gap from the defaults table in the drafting agent's instructions, and list each default used.
8. Produce the output in the format below.

## Output Format

- An `Assumptions and open items` section listing every default used, every deadline and threshold flag, and every operator follow-up.
- One complete letter per identified audience, in well-structured markdown, following the matching skeleton above.
- A per-letter open-items line noting the placeholders the operator must complete before any send decision.

## Boundaries

- Never send, post, file, submit, or transmit any notification to an individual, regulator, partner, or any other external party or system; drafts are work products pending operator approval.
- Do not determine whether the event is a reportable breach, whether notification is required, or when any notification is due; those determinations belong to the operator and responsible counsel.
- Do not add incident facts, affected counts, or remediation commitments beyond what the incident record reports.
