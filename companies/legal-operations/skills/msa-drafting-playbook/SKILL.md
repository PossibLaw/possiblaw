---
name: msa-drafting-playbook
description: Draft a complete master services agreement skeleton — services framework, ordering mechanics, payment, IP ownership and licenses, confidentiality, warranties, indemnities, limitation of liability, and term and termination — when an MSA drafting matter arrives, applying stated defaults and placeholders for missing facts.
metadata:
  sources:
    - path: companies/legal-operations/skills/msa-drafting-playbook/SKILL.md
      kind: local-file
      usage: vendored
      license: Apache-2.0
      attribution: PossibLaw
---

# MSA Drafting Playbook

Use this skill to draft a master services agreement skeleton in well-structured markdown. The MSA is a framework agreement: project-specific scope, fees, and schedules live in statements of work or order forms executed under it, never in the MSA body. The draft is a work product for operator and responsible-attorney review; it is never sent to a counterparty.

## Drafting Steps

1. Scope intake. Record the parties, the general nature of the services, the ordering model (statements of work, order forms, or both), and every operator-specified term. Use `[COUNTERPARTY NAME]` when only one party is named and `[EFFECTIVE DATE]` when no effective date is given. If the request is too vague to identify even the general services relationship and no acceptable default applies, gate with `missing-info-gate` instead of guessing.
2. Frame the agreement. Open with a title and parties block, then recitals stating that the parties intend a framework agreement under which services will be scoped and ordered through ordering documents executed by both parties. Keep project-specific scope out of the MSA body; if the operator asks to fold it in, flag the request as an open item instead.
3. Draft the services framework and ordering mechanics article. Define the ordering document, require execution by both parties before work begins, state that each ordering document incorporates the MSA, and state the order of precedence: the MSA controls unless an ordering document expressly amends a cited MSA section for that ordering document only. Mark any operator-requested deviation from this precedence `[OPERATOR DECISION]`.
4. Draft the payment article. Default to fees and invoicing schedules as stated in each ordering document, payment net 30 from invoice date, good-faith fee disputes raised in writing within 15 days, and expenses reimbursable only when pre-approved in the ordering document.
5. Draft the intellectual property article. Each party retains its pre-existing intellectual property and general-purpose tools. For deliverable ownership, insert `[IP OWNERSHIP — OPERATOR DECISION]` and present both standard options in the draft: assignment to the customer on payment, or provider ownership with a license to the customer. License pre-existing IP to the extent embedded in deliverables.
6. Draft the confidentiality article. Define confidential information broadly with standard exclusions (public through no breach, already known, independently developed, lawfully received from a third party, or compelled by law after prompt notice). Set the confidentiality term to 3 years after termination, with trade secrets protected for as long as they remain trade secrets.
7. Draft the warranties and disclaimers article. Include mutual authority warranties and a services warranty (performed in a professional and workmanlike manner by qualified personnel) with a re-performance remedy, followed by a disclaimer of implied warranties.
8. Draft the indemnities article. Default to a provider indemnity for third-party IP-infringement claims arising from the deliverables and mutual indemnities for third-party claims arising from gross negligence, willful misconduct, or breach of confidentiality, each with notice, control, and cooperation mechanics. Mark any additional or asymmetric indemnity `[OPERATOR DECISION]`.
9. Draft the limitation of liability article. Cap each party's aggregate liability at fees paid or payable in the 12 months preceding the claim and mutually exclude indirect and consequential damages. List candidate carve-outs — confidentiality, indemnity obligations, gross negligence or willful misconduct — marked `[OPERATOR DECISION]`.
10. Draft the term and termination article. Default to an initial term of 2 years from the Effective Date, renewing for successive 1-year terms unless either party gives 60 days' written notice of non-renewal; termination for material breach uncured 30 days after written notice; and termination for convenience by either party on 60 days' written notice, with statements of work in flight continuing unless also terminated. State the effect of termination and which articles survive.
11. Draft the general provisions article. Governing law (default: State of Delaware, USA), notices, assignment only with prior written consent, independent-contractor status, force majeure, severability, waiver, entire agreement, amendment only in a signed writing, and counterparts.
12. Assemble the deliverable in the output format below. List every placeholder, default used, and operator-excluded article in the assumptions section, and close with signature blocks.

## Output Format

Produce the skeleton with this structure:

1. Title and parties block with placeholders for unknown party details.
2. `Assumptions and open items` section listing every placeholder, default used, excluded article, and operator follow-up.
3. Recitals or background.
4. Numbered substantive articles in step order: services framework and ordering mechanics, payment, intellectual property ownership and licenses, confidentiality, warranties and disclaimers, indemnities, limitation of liability, term and termination, and general provisions.
5. Signature block with placeholder names, titles, and dates.

## Boundaries

- Use operator-specified terms exactly as given; the defaults in this playbook apply only when the operator is silent.
- Do not fold project-specific scope, fees, or schedules into the MSA body; they belong in ordering documents.
- Do not resolve legal determinations — enforceability, jurisdiction-specific requirements, regulatory constraints — in the draft; flag them for the operator or responsible attorney.
- Do not transmit the draft or any matter document to a counterparty or any external party or system; the draft is a work product pending operator approval.
