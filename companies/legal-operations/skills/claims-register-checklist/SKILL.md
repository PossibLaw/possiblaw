---
name: claims-register-checklist
description: Organize claims registers into priority and class tables when a claims-analysis matter arrives, producing structured claim rows with summary totals and duplicate and discrepancy flags routed to the operator.
metadata:
  sources:
    - path: companies/legal-operations/skills/claims-register-checklist/SKILL.md
      kind: local-file
      usage: vendored
      license: Apache-2.0
      attribution: PossibLaw
---

# Claims Register Checklist

Use this skill to turn an operator-supplied claims register into structured priority and class tables with explicit flags. The output is mechanical organization; allowance, valuation, and priority determinations belong to the operator or responsible attorney.

## Analysis Steps

1. Scope intake. Record the register source and its as-of date, the case caption and number, any schedules supplied for comparison, and any subset of claims the operator scoped the analysis to. If no register is supplied and no acceptable default applies, gate with `missing-info-gate` instead of guessing.
2. Build the claims table. Record one row per register entry with the claim number, claimant name, amount asserted, class, secured or unsecured status, priority asserted, and objection status, exactly as the register states them. Mark fields the register does not state as `[NOT STATED]`; never infer a class or status.
3. Detect duplicates. Flag as `Duplicate flag` rows, with the basis for each:
   - Entries with the same claimant and the same asserted amount.
   - Amended or superseding claims where the earlier claim still appears.
   - Transferred claims appearing under both transferor and transferee.
   Record duplicates; do not delete or merge entries.
4. Detect discrepancies. Flag as `Discrepancy flag` rows, with the basis for each:
   - Arithmetic errors within an entry or totals that do not reconcile.
   - Amounts that conflict with the supplied schedules.
   - Entries missing a class, status, or amount.
5. Compute summary totals. Total claim counts and asserted amounts by class and by secured or unsecured status, totaling `[NOT STATED]` entries separately so gaps stay visible.
6. Produce the tables and flags in the format below.

## Output Format

| Claim no. | Claimant | Amount asserted ($) | Class | Secured / Unsecured | Priority asserted | Objection status |
|---|---|---|---|---|---|---|

Follow the claims table with:

- Summary totals — counts and asserted-amount totals by class and by secured/unsecured status, with `[NOT STATED]` totals listed separately.
- `Duplicate flag` rows — claim numbers involved and the basis for each flag.
- `Discrepancy flag` rows — the entry, the discrepancy, and the comparison source.

Every flag row ends with `Routed to operator` as the disposition. If there are no duplicates or discrepancies, state that explicitly.

## Boundaries

- Do not recommend allowing, disallowing, or objecting to any claim, and do not value claims or decide priority entitlement; flag and route those determinations to the operator or responsible attorney.
- Do not normalize, merge, or delete register entries; record what the register states and flag what conflicts.
- Do not compute distributions or final liability figures; organize asserted amounts and flag open calculations.
- Do not transmit the tables or the register to a court, trustee, claims agent, or other external party or system; the tables are work products pending operator approval.
