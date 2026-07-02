---
name: legal-conflicts-check
description: Run the manual conflicts-check procedure before substantive legal work begins — automated conflicts screening is not implemented in this package.
metadata:
  sources:
    - path: layer/skills/legal/conflicts-check.md
      kind: local-file
      usage: vendored
      license: Apache-2.0
      attribution: PossibLaw
---

# Conflicts Check

Use this skill before any substantive legal drafting, review, or advice. Automated conflicts screening is not implemented in this package, so conflicts clearance requires operator confirmation — this is the manual procedure.

## Procedure

1. Collect all party, counterparty, affiliate, counsel, and related matter names from matter intake.
2. State that this package cannot automatically verify whether any named party is a current client, former client, adverse party, or otherwise conflicted — automated conflicts screening is not implemented.
3. Require manual operator confirmation that no conflicts of interest exist before proceeding.
4. In an interactive session, ask: "Please confirm that you have performed a conflicts check and that no conflicts of interest exist with the following parties: [list parties]. Type CONFIRMED to proceed."
5. Record the date, time, listed parties, and operator confirmation statement when available.
6. Add a Conflicts Check Notice at the top of any output document until the matter has confirmed clearance.
7. Flag obvious conflict indicators, including the same party on both sides, known competitor sensitivity, adverse-party instructions, or any request to hide or bypass conflicts review.
8. If a potential conflict is detected or confirmation is missing for substantive work, route to human escalation with: "Potential conflict of interest detected; requires operator confirmation before proceeding."
9. Document that the check was operator-confirmed and that automated conflicts screening is not implemented in this package.

## Output Requirements

- Do not proceed with substantive legal work when conflicts confirmation is required and absent.
- Preserve the exact party list used for the check.
- Keep the notice concise, visible, and suitable for operator review.
