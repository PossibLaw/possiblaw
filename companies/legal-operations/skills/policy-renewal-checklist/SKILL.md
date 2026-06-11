---
name: policy-renewal-checklist
description: Build year-over-year renewal comparison tables when a policy-renewal matter arrives, producing limits, retentions, premium, and exclusion-and-endorsement delta tables with coverage gaps flagged to the operator.
metadata:
  sources:
    - path: companies/legal-operations/skills/policy-renewal-checklist/SKILL.md
      kind: local-file
      usage: vendored
      license: Apache-2.0
      attribution: PossibLaw
---

# Policy Renewal Checklist

Use this skill to compare an expiring insurance policy against its renewal terms in structured year-over-year tables. The output is mechanical extraction and comparison with gaps flagged; binding, acceptance, and placement decisions belong to the operator, broker, or responsible counsel.

## Comparison Steps

1. Scope intake. Record the expiring policy documents, the renewal quote, binder, or policy, the lines of coverage in scope, the policy periods, and any broker materials supplied. If either the expiring terms or the renewal terms are absent and no acceptable default applies, gate with `missing-info-gate`; a one-sided comparison is a gated gap, not a deliverable.
2. Build the policy summary table. Record the insurer, policy form, policy period, and total premium for the expiring and renewal terms side by side, exactly as the documents state them, with absent fields marked `[NOT STATED]`.
3. Build the limits-and-retentions comparison. Record one row per coverage element — each limit, sublimit, retention, and deductible — pairing the expiring value with its renewal counterpart and stating the delta. Record elements present on only one side as their own rows rather than dropping them; never infer a value.
4. Build the premium comparison. Record the premium per line of coverage with the delta shown on supplied figures only; never estimate premiums or assert market-standard pricing.
5. Build the exclusion and endorsement delta table. Record one row per added, removed, or modified exclusion or endorsement, quoting titles or decisive language as supplied and stating what changed; never summarize a modified exclusion without noting the change.
6. Flag coverage gaps. Record one row per narrowed coverage element — a lowered limit, raised retention, new or broadened exclusion, removed endorsement, or gap between policy periods — with status `Flagged — operator/broker determination required`. The significance of any gap is a determination for the operator, broker, or responsible counsel.
7. Produce the tables and summary in the format below.

## Output Format

Limits-and-retentions comparison table:

| Coverage element | Expiring | Renewal | Delta | Source |
|---|---|---|---|---|

Exclusion and endorsement delta table:

| Exclusion / endorsement | Expiring policy | Renewal | Change | Flag |
|---|---|---|---|---|

Follow the tables with:

- Premium comparison per line of coverage with deltas on supplied figures.
- Coverage-gap flag rows, each with status `Flagged — operator/broker determination required`.
- Summary — counts of deltas and flags, fields marked `[NOT STATED]`, and a closing line routing the renewal decision to the operator, broker, or responsible counsel. If there are no deltas or gaps, state that explicitly.

## Boundaries

- Do not recommend binding, accepting, rejecting, or negotiating renewal terms, and do not assess the adequacy of limits, retentions, or pricing; extract, compare, and flag.
- Do not infer, estimate, or normalize values the documents do not state; an absent field is `[NOT STATED]` and a flagged gap.
- Do not transmit the comparison or any policy document to an insurer, broker, or other external party or system; the tables are work products pending operator approval.
