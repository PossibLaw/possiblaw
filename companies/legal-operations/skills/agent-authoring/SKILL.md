---
name: agent-authoring
description: Draft a new AGENTS.md (plus its .paperclip.yaml sidecar block) as a reviewable work product when a recurring workload needs a dedicated atomic agent — dedup against the existing org chart first, and never publish without explicit operator approval.
metadata:
  sources:
    - path: paperclip/docs/companies/companies-spec.md
      kind: local-file
      usage: referenced
      license: Apache-2.0
      attribution: Paperclip
---

# Agent Authoring

Use this skill to turn a recurring workload into a draft agent definition for the PossibLaw package. The output is a **draft posted as a work product on the issue** — never a file written into the live package and never an import.

## When To Invoke

- A lead repeatedly handles a sub-specialty inline that deserves a dedicated specialist.
- The operator explicitly asked for a new agent or role.
- A skill drafted via `skill-authoring` has no sensible existing agent to attach to.

## Step 0 — Dedup and placement check (always first)

1. Read the current org chart (the package `agents/` directory or the company agent list via the Paperclip UI/API).
2. If an existing agent's mission covers the workload, propose attaching a skill or widening that agent's routing instead of creating a new one. Atomic agents are the goal, but a new agent that overlaps an existing mission creates routing ambiguity — the worse failure.
3. Decide `reportsTo`: every specialist reports to exactly one lead (commercial-lead, finance-lead, marketing-lead, admin-lead) or to chief-counsel for legal specialists. Top-level additions require an explicit operator decision — flag, don't assume.

## Step 1 — Gather required facts

Block via `missing-info-gate` if any are missing:

- One-sentence mission: the single job this agent does (atomicity test: if the mission needs "and", split it).
- The lead it reports to, and the routing trigger that lead will use.
- Skills to attach (existing slugs; new ones go through `skill-authoring` first).
- Model lane: `primary` (org-level judgment) | `routing` (classify + delegate) | `drafting` (produces documents) | `review` (adversarial reading) | `extractive` (mechanical extraction/formatting). The lane drives model selection across all variants — a wrong lane is a silent cost/quality bug.
- What the agent must never do (send/transmit, spend, advise beyond scope).

## Step 2 — Draft the AGENTS.md

Format rules (mirror an existing specialist such as `agents/billing-prep/AGENTS.md`):

- Frontmatter: `name`, `kind: agent`, `slug` (kebab-case == directory name), `title`, `reportsTo`, `skills` as a **YAML block list** (inline arrays import as empty — known importer behavior).
- Naming at scale: `<domain>-<sub-specialty>-<verb-noun>` for deep specialists (e.g. `employment-discrimination-investigator`); short names only for org-chart roles.
- Body sections, in order: intro paragraph, `## Mission`, `## Execution Contract` (copy the package-standard block verbatim), required-skills notes, domain rules, defaults table if the agent drafts anything, operating rules/boundaries.
- No secrets, no machine-local paths, no API keys, no repeated disclaimer boilerplate.

## Step 3 — Draft the .paperclip.yaml sidecar block

Every agent needs a sidecar entry; include it in the same work product:

- `agents.<slug>`: `role` (lead|specialist), `icon`, `capabilities` (one line), `budgetMonthlyCents: 0`, the package-standard `adapter` block (`codex_local` + current default model — copy from a neighboring agent, do not invent model ids), the package-standard `runtime.heartbeat` block, and `metadata.possiblaw.modelLane` matching Step 1.
- `sidebar.agents`: insertion position (after its lead).
- The launcher's variant system keys on `metadata.possiblaw.modelLane` — with it set, the agent inherits correct per-variant model config automatically; nothing else is needed in `variants.yaml`.

## Step 4 — Routing wiring

State exactly which routing table row to add to the lead's AGENTS.md (quote the table row). Do not edit the lead's file yourself — the row ships with the integration change after approval.

## Step 5 — Post for review (mandatory gate — no exceptions)

1. Post the complete draft (AGENTS.md + sidecar block + routing row) as one work product comment, each part in a fenced block with its intended path.
2. Include a 3-line summary: mission, lane, what was deduped against.
3. End with: `AWAITING OPERATOR APPROVAL — reply "APPROVED: <slug>" to integrate.`
4. **Stop.** No package writes, no imports, no agent creation via API. Integration is a separate reviewed change after explicit operator approval.
