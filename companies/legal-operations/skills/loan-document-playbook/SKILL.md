---
name: loan-document-playbook
description: Draft promissory-note, guaranty, and security-agreement skeletons when a loan-document drafting matter arrives, producing placeholder-marked instruments with stated defaults and assumptions.
metadata:
  sources:
    - path: companies/legal-operations/skills/loan-document-playbook/SKILL.md
      kind: local-file
      usage: vendored
      license: Apache-2.0
      attribution: PossibLaw
---

# Loan Document Playbook

Use this skill to draft skeletons for three instruments — promissory note, guaranty, and security agreement — with placeholders for deal-specific terms. Draft one instrument per skeleton; every skeleton ships with an assumptions section and unexecuted signature blocks.

## Drafting Steps

1. Scope intake. Record the instrument requested, parties, principal amount, interest rate and basis, maturity, payment schedule, governing agreement reference, collateral description, and governing law. Apply the drafting agent's defaults where facts are missing; if the instrument type or the parties are absent and no acceptable default applies, gate with `missing-info-gate` instead of guessing.
2. Select the matching skeleton below and keep its section order; mark any section the operator strikes as intentionally omitted rather than silently dropping it.
3. Fill operator-supplied terms exactly as given; use bracketed placeholders for everything else and list each one in `Assumptions and open items`.
4. Mark every jurisdiction-dependent term — interest-rate and usury limits, default-interest and late-charge caps, guaranty-waiver enforceability, self-help remedies — with a placeholder and an operator flag; never state these as settled.
5. Assemble the work product in the output format below.

## Promissory Note Skeleton

1. Promise to pay: borrower, lender, principal `[PRINCIPAL AMOUNT]`, for value received.
2. Interest: rate `[INTEREST RATE]`, basis `[RATE BASIS]`, computation convention, default interest `[DEFAULT RATE — OPERATOR TO CONFIRM]`.
3. Payments: schedule, maturity `[MATURITY DATE]`, application order, business-day convention.
4. Prepayment: permitted with or without premium `[PREPAYMENT TERMS]`.
5. Events of default and remedies: nonpayment, insolvency, cross-default `[CROSS-DEFAULT SCOPE]`, acceleration.
6. Waivers: presentment, demand, protest, notice of dishonor.
7. Costs of collection and attorneys'-fees placeholder.
8. Miscellaneous: governing law `[GOVERNING LAW]`, notices, amendments in writing, successors and assigns.

## Guaranty Skeleton

1. Guaranty: guarantor, guaranteed obligations `[GUARANTEED OBLIGATIONS]`, continuing guaranty of payment (default) or of collection `[OPERATOR TO CONFIRM]`.
2. Obligations absolute and unconditional; no impairment by amendments, releases, or extensions.
3. Waivers and consents: suretyship defenses `[JURISDICTION-DEPENDENT — OPERATOR TO CONFIRM]`, subrogation deferral until obligations are satisfied.
4. Guarantor representations: capacity, benefit received, solvency placeholder.
5. Reinstatement if any payment is avoided or recovered.
6. Limitations: cap `[GUARANTY CAP, IF ANY]`, fraudulent-transfer savings clause.
7. Miscellaneous: governing law `[GOVERNING LAW]`, notices, successors and assigns.

## Security Agreement Skeleton

1. Grant of security interest: debtor, secured party, secured obligations `[SECURED OBLIGATIONS]`.
2. Collateral description `[COLLATERAL DESCRIPTION — OPERATOR TO CONFIRM]`, choosing one option: all-assets description, category list (accounts, inventory, equipment, general intangibles, deposit accounts, investment property), or a specific-asset schedule reference.
3. Perfection cooperation: authorization to file financing statements and further assurances, drafted as obligations of the parties — the drafter never performs any filing.
4. Debtor representations: title, no other liens `[PERMITTED LIENS SCHEDULE]`, accuracy of name and location for filing purposes.
5. Covenants: maintenance, insurance, no disposition outside the ordinary course, notice of name or location change.
6. Events of default (cross-reference to the note or credit agreement) and remedies placeholder `[REMEDIES — JURISDICTION-DEPENDENT, OPERATOR TO CONFIRM]`.
7. Miscellaneous: governing law `[GOVERNING LAW]`, notices, termination on satisfaction `[RELEASE MECHANICS — OPERATOR TO CONFIRM]`.

## Output Format

1. Header: instrument name, parties, date placeholder, and governing agreement reference if any.
2. `Assumptions and open items`: every default applied, placeholder used, and operator follow-up.
3. Numbered sections per the instrument's skeleton, with placeholders inline.
4. Signature blocks with `[NAME]` and `[TITLE]` placeholders; no signature is ever applied.

## Boundaries

- Never perfect a security interest, file or cause the filing of a financing statement, or release collateral; perfection and release are operator actions outside this skill.
- Do not opine on enforceability, usury compliance, or remedies availability, and do not give jurisdiction-specific advice as settled; flag and route to the operator or responsible attorney.
- Do not transmit a skeleton to a borrower, lender, filing office, or any external party or system; skeletons are unexecuted work products pending operator approval.
