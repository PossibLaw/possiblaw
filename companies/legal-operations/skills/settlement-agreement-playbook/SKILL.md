---
name: settlement-agreement-playbook
description: Draft a settlement-agreement skeleton when a settlement-documentation matter arrives, producing recitals, payment-term placeholders, release-scope options flagged for decision, confidentiality, non-disparagement, and dismissal mechanics as an internal work product.
metadata:
  sources:
    - path: companies/legal-operations/skills/settlement-agreement-playbook/SKILL.md
      kind: local-file
      usage: vendored
      license: Apache-2.0
      attribution: PossibLaw
---

# Settlement Agreement Playbook

Use this skill to draft a settlement-agreement skeleton documenting terms the operator has stated or placeholdered. Every draft is an internal work product requiring explicit operator approval before any use. The skeleton organizes terms for decision; it never decides release scope, settlement amounts, or dismissal posture itself.

## Drafting Steps

1. Gather from the issue: the settling parties, the dispute being resolved (case name and docket number if filed), the settlement amount and payment terms if the operator has recorded authority, release-scope instructions, confidentiality and non-disparagement preferences, and the dismissal posture if stated. If the parties or the dispute description are absent and no acceptable default applies, gate with `missing-info-gate` instead of guessing.
2. Draft the skeleton sections in order:
   - Title and parties block with defined short names.
   - Recitals: the background of the dispute as stated in the issue, the pending action if filed, and a statement that the agreement is a compromise of disputed claims and not an admission of liability.
   - Definitions for terms used more than once.
   - Payment terms: amount, payor and payee, method, schedule, and tax-reporting placeholder. Use `[SETTLEMENT AMOUNT — REQUIRES OPERATOR AUTHORITY]` unless operator-provided authority is recorded in the issue; operator silence is not authority.
   - Release: the release-scope skeleton with every scope decision presented under the release-scope gate below.
   - Confidentiality: scope of confidential terms, permitted disclosures (legal and tax advisors, as required by law or court order), and a remedy placeholder.
   - Non-disparagement: covered parties, covered statements, and carve-outs for truthful testimony and legally protected speech.
   - Dismissal mechanics: the instrument (for example a stipulation of dismissal), the with- or without-prejudice posture as `[WITH/WITHOUT PREJUDICE — CONFIRM WITH COUNSEL]`, timing relative to payment, and who prepares and files it marked `[OPERATOR/COUNSEL ACTION]`.
   - No-admission clause, representations of authority to sign, entire agreement, governing law placeholder, severability, counterparts, and signature blocks with date placeholders.
3. Apply the release-scope gate to every scope decision.
4. Produce the defaults table entries used and the operator-decision list in the `Assumptions and open items` section.

## Release-Scope Gate

Release scope is a legal and business decision for the operator or responsible attorney; never select a scope silently. For each decision below, present the options with a one-line tradeoff and mark the clause `[RELEASE SCOPE — OPERATOR/ATTORNEY DECISION]`:

- Mutual or unilateral release.
- General release or release limited to the claims in the dispute.
- Treatment of unknown claims, noting that waivers of unknown-claims protections are jurisdiction-dependent and must be confirmed by the responsible attorney.
- Released parties: named parties only, or extended to affiliates, officers, directors, employees, agents, and insurers.
- Carve-outs: obligations under the agreement itself, claims that cannot be released by law, and any operator-identified surviving claims.

## Defaults

| Field | Default |
|---|---|
| Parties | `[PARTY A LEGAL NAME]` and `[PARTY B LEGAL NAME]` placeholders |
| Case caption and docket number | `[CAPTION]` and `[CASE NUMBER]`, or `not filed` when the issue says so |
| Settlement amount | `[SETTLEMENT AMOUNT — REQUIRES OPERATOR AUTHORITY]`; issue marked blocked until authority is recorded |
| Payment schedule | Single lump sum within `[PAYMENT WINDOW]` of the effective date |
| Payment method | `[PAYMENT METHOD AND PAYEE INSTRUCTIONS]` placeholder |
| Release scope | Skeleton with every scope decision marked `[RELEASE SCOPE — OPERATOR/ATTORNEY DECISION]` |
| Confidentiality | Mutual, covering terms and amount, with standard permitted-disclosure carve-outs |
| Non-disparagement | Mutual, with truthful-testimony and protected-speech carve-outs |
| Dismissal posture | `[WITH/WITHOUT PREJUDICE — CONFIRM WITH COUNSEL]` placeholder |
| Governing law | `[GOVERNING LAW]` placeholder |

## Output Format

A single well-structured markdown document:

1. An `Assumptions and open items` section listing every placeholder, default used, release-scope decision pending, and operator follow-up.
2. The full skeleton in the section order above, with bracket placeholders inline where decisions or facts are pending.
3. Signature blocks marked `[DO NOT EXECUTE — OPERATOR ACTION]`.

## Boundaries

- Never send, file, or transmit the agreement to the counterparty, their counsel, a court, or any external party or system, and never present the skeleton as an executed or agreed document; it is an internal work product pending operator approval.
- Do not decide release scope, settlement amounts, payment terms, or dismissal posture; present options with tradeoffs and route every decision to the operator or responsible attorney.
- Do not opine on enforceability, tax treatment, or how a court would treat any clause; flag jurisdiction-dependent provisions for the responsible attorney and organize tax items without computing liability.
