---
name: ai-policy-playbook
description: Draft AI acceptable-use and governance policy skeletons when an AI policy matter arrives, producing a markdown work product with permitted and prohibited uses, defaults, and operator flags.
metadata:
  sources:
    - path: companies/legal-operations/skills/ai-policy-playbook/SKILL.md
      kind: local-file
      usage: vendored
      license: Apache-2.0
      attribution: PossibLaw
---

# AI Policy Playbook

Use this skill to draft an internal AI acceptable-use and governance policy skeleton. Apply the defaults in the drafting agent's instructions when the operator has not provided contrary facts, and mark missing legal or business facts with bracket placeholders and operator flags.

## When To Invoke

- The issue requests a new AI acceptable-use, AI governance, or generative-AI usage policy.
- The issue requests revisions to an existing PossibLaw-drafted AI policy; rerun the relevant steps against the prior draft and list what changed.
- Do not invoke for vendor-terms assessment or AI-incident intake; those belong to other specialists in the AI governance practice.

## Drafting Steps

1. Gather facts from the issue: organization name, policy owner, covered users, intended and known AI uses, tools already in use, data categories handled, existing policies the document must align with, review cadence, and effective date. If the policy's intended scope is absent and no acceptable default applies, gate with `missing-info-gate` instead of guessing.
2. Draft the required sections in order:
   - Purpose and scope: why the policy exists, who and what it covers.
   - Definitions: plain-language definitions for AI system, generative AI tool, approved tool, and AI-assisted work product.
   - Permitted uses: a concrete, behavior-based list of allowed uses of approved tools.
   - Prohibited uses: a concrete, behavior-based list — at minimum, entering restricted data into unapproved tools, presenting AI output as human work where disclosure is required, and using AI for consequential decisions about people without human review.
   - Data-input rules: which data categories may and may not be entered into which tool tiers.
   - Human-review requirements: who must review AI output before it is used, and for which work products.
   - Disclosure rules: when AI assistance must be disclosed internally and externally.
   - Tool approval and procurement gate: how new tools are requested, assessed, and added to the approved-tool list.
   - Exception process: how exceptions are requested, approved, logged, and expired.
   - Incident reporting pointer: where suspected AI incidents are reported, referencing the organization's intake channel as a placeholder.
   - Roles and responsibilities: the policy owner and review responsibilities, using role or committee names, not individuals.
   - Review cadence and effective date.
3. Insert an operator flag wherever a rule depends on a legal regime — AI-specific statutes, sector rules, or disclosure mandates — stating the dependency; never state a jurisdiction-specific requirement as settled.
4. Keep the approved-tool list as an operator-maintained placeholder; do not name or endorse specific vendors or tools as approved.
5. Apply defaults. Fill every remaining gap from the defaults table in the drafting agent's instructions, and list each default used.
6. Produce the output in the format below.

## Output Format

- A single well-structured markdown policy document with the sections in the order above.
- A short `Assumptions and open items` section before the policy body listing every placeholder, default, and operator flag.
- Preserve operator-specified tool names, role titles, rules, and dates exactly as given.

## Boundaries

- Do not assert that the policy satisfies any AI statute, sector rule, or other legal regime; route compliance determinations to the operator or responsible attorney.
- Do not assess specific vendors or draft incident-response procedures beyond the policy's pointer sections; those belong to other specialists.
- Do not publish, send, or transmit the policy to any external party or system; the draft is a work product pending operator approval.
