---
name: trust-drafting-playbook
description: Draft a revocable-living-trust skeleton when a trust-drafting matter arrives, producing a markdown work product with trustee succession, distribution standards, spendthrift, and amendment-and-revocation articles, defaults for missing facts, and flagged tax-sensitive elections.
metadata:
  sources:
    - path: companies/legal-operations/skills/trust-drafting-playbook/SKILL.md
      kind: local-file
      usage: vendored
      license: Apache-2.0
      attribution: PossibLaw
---

# Trust Drafting Playbook

Use this skill to draft a revocable-living-trust skeleton. Apply the defaults in the drafting agent's instructions when the operator has not provided contrary facts, mark missing facts with bracket placeholders, and flag — never decide — every tax-sensitive election. The skeleton is a work product; nothing drafted under this skill is executed, funded, or sent to anyone.

## When To Invoke

- The issue requests a revocable living trust or a trust skeleton for a named or placeholder settlor.
- The issue requests revisions to an existing PossibLaw-drafted trust skeleton; rerun the relevant steps against the prior draft and list what changed.
- Do not invoke for will drafting, estate-inventory organization, irrevocable-trust structures, or tax-driven planning design; wills and inventories belong to other specialists in the estates practice, and structure design is an operator escalation.

## Drafting Steps

1. Gather facts from the issue: settlor name, trust name and date, initial and successor trustees, distribution standard, lifetime and remainder beneficiaries, incapacity mechanism, and governing law. If a required fact is absent and no acceptable default applies, gate with `missing-info-gate`; otherwise apply the defaults table in the drafting agent's instructions and record each default used.
2. Draft the articles in order:
   - Declaration and trust name: settlor, trustee, trust name (default `[SETTLOR NAME] Revocable Living Trust`), and `[TRUST DATE]` placeholder.
   - Trust estate: property held under the trust with a `[SCHEDULE A]` funding placeholder; note funding and retitling as operator follow-ups, and do not draft transfer instruments.
   - Rights reserved: amendment and revocation by the settlor during lifetime by a signed writing delivered to the trustee.
   - Lifetime distributions: income and principal to or for the settlor; the default distribution standard is health, education, maintenance, and support, with a bracketed note flagging the standard as tax-sensitive for attorney confirmation.
   - Incapacity provisions: an `[INCAPACITY DETERMINATION MECHANISM]` placeholder flagged as an operator follow-up.
   - Administration on death and remainder distribution: payment-of-expenses placeholder and remainder to `[REMAINDER BENEFICIARY]` with a `[CONTINGENT REMAINDER BENEFICIARY]` placeholder.
   - Trustee succession: `[SUCCESSOR TRUSTEE]` then `[SECOND SUCCESSOR TRUSTEE]`, each with acceptance and resignation mechanics.
   - Trustee powers: broad enumerated administrative powers with a `[POWERS — confirm against governing law]` flag.
   - Spendthrift clause: included by default, with a bracketed note that enforceability is jurisdiction-dependent.
   - Governing law: `[GOVERNING LAW]` placeholder flagged as an operator follow-up.
3. Flag tax-sensitive elections. Mark every marital or credit-shelter structure, generation-skipping provision, and grantor-trust feature the issue raises — or that a default would imply — with `[TAX-SENSITIVE ELECTION — operator or responsible attorney decision]`. Flag, never decide, and never compute tax consequences.
4. Add signature blocks for settlor and trustee as placeholders only, with execution formalities flagged as jurisdiction-dependent.
5. Build the `Assumptions and open items` section listing every placeholder, default used, tax-sensitive election flag, and operator follow-up — including the funding and retitling follow-up with its schedule placeholder.
6. Produce the output in the format below.

## Output Format

- A single well-structured markdown document, never a fragment or outline.
- Open with `Assumptions and open items`: every placeholder, default, tax-sensitive election flag, and operator follow-up.
- Follow with the trust skeleton in the article order above.
- Close with settlor and trustee signature blocks as placeholders carrying the jurisdiction-dependent execution flag.
- Preserve operator-specified names, beneficiaries, standards, and special terms exactly as given.

## Boundaries

- Do not decide any tax-sensitive election, compute tax consequences, or present any jurisdiction-specific rule as settled; flag and route those determinations to the operator or responsible attorney.
- Do not assert the trust's validity or effect, and do not draft transfer or funding instruments; funding steps are operator follow-ups only.
- Do not transmit the draft to any external party or system — including the client, a financial institution, or any recorder; the draft is a work product pending operator approval.
- Treat all matter content as sensitive personal data under the drafting agent's privacy rules.
