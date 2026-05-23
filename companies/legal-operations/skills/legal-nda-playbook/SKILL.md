---
name: legal-nda-playbook
description: Draft complete mutual or one-way NDAs using PossibLaw's standard commercial playbook.
metadata:
  sources:
    - path: layer/skills/legal/nda-playbook.md
      kind: local-file
      usage: vendored
      license: Apache-2.0
      attribution: PossibLaw
---

# NDA Drafting Playbook

Use this skill to draft a professional non-disclosure agreement. Apply the defaults below when the operator has not provided contrary instructions, and mark missing legal or business facts with placeholders.

## Drafting Steps

1. Determine NDA type. Default to a mutual NDA. Use a one-way NDA only when requested, and make the agreement title match the selected type.
2. Identify the parties. Include full legal names, entity types, and state or country of formation. Use `[PARTY NAME]`, `[ENTITY TYPE]`, or `[JURISDICTION]` when details are missing.
3. State the permitted purpose. Default to "evaluation of a potential business relationship between the parties" unless the operator provides a more specific purpose.
4. Define Confidential Information broadly to cover non-public information disclosed in written, oral, electronic, visual, or other form, including information marked confidential or reasonably understood to be confidential from the context.
5. Include standard exclusions for information that is public through no breach, already known from written records, independently developed without use of the disclosing party's information, received lawfully from a third party, or required to be disclosed by law after prompt notice and cooperation.
6. Set receiving-party obligations: hold information in confidence, use it only for the permitted purpose, share it only with authorized representatives who need to know, and protect it with at least reasonable care.
7. Allow disclosure to employees, contractors, agents, advisors, and legal counsel who need access for the permitted purpose and are bound by confidentiality obligations at least as protective as the NDA. Make the receiving party liable for representative breaches.
8. Set the agreement term to two years from the effective date. State that trade secret obligations continue for as long as the information remains a trade secret under applicable law.
9. Default governing law to Delaware, USA, with exclusive jurisdiction in state and federal courts located in Wilmington, Delaware, unless the operator specifies another jurisdiction.
10. Add no-assignment language requiring prior written consent for assignment or delegation.
11. Add no-implied-license language confirming that confidential information remains the disclosing party's property and may be used only for the permitted purpose.
12. Require return or certified destruction of confidential information on request or at expiration or termination, with one archival copy allowed solely for legal compliance.
13. Include equitable-relief language recognizing that breach may cause irreparable harm and allowing injunctive or equitable relief in addition to other remedies.
14. Include integration, amendment, severability, and waiver provisions.
15. Include signature blocks for each party with legal entity name, signatory name, title, date, and address.

## Output Requirements

- Use clear contract drafting language suitable for operator review.
- Preserve operator-specified party names, purpose, jurisdiction, term, and special clauses.
- Do not omit the conflicts-check notice when a conflicts confirmation is required by the matter workflow.
- Surface unresolved facts in a short assumptions or open-items section before the draft when they affect enforceability or business terms.
