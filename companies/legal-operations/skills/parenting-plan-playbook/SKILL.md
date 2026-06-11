---
name: parenting-plan-playbook
description: Draft parenting-plan skeletons when a custody or parenting-time matter arrives, producing a markdown work product with schedule, holiday, decision-making, communication, relocation, and dispute-resolution sections plus defaults, best-interest flags, and jurisdiction flags.
metadata:
  sources:
    - path: companies/legal-operations/skills/parenting-plan-playbook/SKILL.md
      kind: local-file
      usage: vendored
      license: Apache-2.0
      attribution: PossibLaw
---

# Parenting Plan Playbook

Use this skill to draft a parenting-plan skeleton or to update an existing draft plan. Apply the defaults in the drafting agent's instructions when the operator has not provided contrary instructions, and mark missing facts with bracket placeholders. Family-law matters are sensitive: when the matter's `metadata.possiblaw.privacyTier` is `confidential` or `privileged` — and family matters are confidential by default — run the `privacy-encoder` flow before any cloud-capable call and decode the final output before posting.

## When To Invoke

- The issue requests a parenting plan, custody or parenting-time schedule, holiday or vacation schedule, decision-making allocation, parent-communication terms, relocation provisions, or dispute-resolution terms between parents.
- The issue requests an update to an existing draft plan's schedule, holiday table, or provisions.
- Do not invoke for property division, support, or releases (marital-settlement work), for financial-disclosure organization, or for any contested custody strategy question. What arrangement serves a child's best interests is a determination for the operator or responsible attorney, not this skill.

## Drafting Steps

1. Gather facts from the issue: parent names, children's names and ages, jurisdiction, any agreed schedule or terms, existing orders or agreements, school calendars, special needs or constraints, and the requested scope.
2. Record agreed terms exactly. Where the issue states terms the parents have already agreed to, carry them into the draft verbatim; do not improve or rebalance them.
3. Draft the plan sections in order:
   - Title and parties block: plan title, parent identification or `[PARENT A]` / `[PARENT B]`, children list with ages, and the jurisdiction or `[JURISDICTION]` placeholder.
   - Regular parenting-time schedule: the agreed schedule as stated, or a section skeleton with `[SCHEDULE — OPERATOR DECISION]`; never propose a default split.
   - Holiday, school-break, and vacation schedule: a table with one row per holiday or break, alternating odd/even years as the placeholder structure, each row marked `[OPERATOR TO CONFIRM]` unless agreed.
   - Decision-making authority: education, healthcare, religion, and extracurriculars, each allocated as stated or marked `[ALLOCATION — OPERATOR DECISION]`.
   - Parent communication: method and platform placeholder, response-time expectations, and information-sharing terms (school records, medical updates, travel itineraries).
   - Relocation: written-notice requirement with the notice period (default 60 days, flagged as jurisdiction-dependent) and a process placeholder for response and objection.
   - Dispute resolution: a mediation-before-court-filing skeleton marked `[OPERATOR DECISION]`, with an exception placeholder for emergencies.
   - Signature block placeholders with date lines.
4. Flag best-interest decisions. Every term that turns on what serves the children — schedule splits, decision-making allocations, restrictions, exchange logistics — is flagged for the operator or responsible attorney; the skeleton holds the structure, not the answer.
5. Flag jurisdiction dependence. Plan-content requirements, mandatory provisions, relocation rules, and approval standards vary by jurisdiction; mark each as a `Jurisdiction flag` and route the determination to the operator or responsible attorney.
6. Apply defaults. Fill every remaining gap from the defaults table in the drafting agent's instructions, and list each default used.
7. Produce the output in the format below.

## Output Format

- A single well-structured markdown document: title and parties block, then the body sections in the order above, then the signature block placeholders.
- A short `Assumptions and open items` section immediately after the parties block listing every placeholder, default used, best-interest flag, and jurisdiction flag.
- Preserve operator-specified names, ages, dates, and agreed terms exactly as given.

## Escalation Triggers

- The issue mentions abuse, neglect, domestic violence, or substance-abuse allegations, or a protective order: flag for `chief-counsel` and the operator before drafting term language touching those facts.
- The issue requests emergency or temporary custody relief: flag for the operator and responsible attorney; this playbook drafts standing-plan skeletons only.
- An existing court order conflicts with the requested terms: record the conflict as an open item and flag it; do not draft around an order.
- The operator asks which arrangement a court would approve or what is in the children's best interests: route to the operator or responsible attorney as a legal determination.

## Boundaries

- Do not determine or recommend what is in a child's best interests, predict what a court would order, or present jurisdiction-specific standards as settled.
- Do not file, serve, or transmit the plan to any court, party, or external system; the draft is a work product pending operator approval.
- Do not draft support, property, or release terms; those belong to the marital-settlement playbook.
- For confidential or privileged matters, never send unencoded matter content to a cloud-capable model; the privacy-encoder flow is mandatory.
