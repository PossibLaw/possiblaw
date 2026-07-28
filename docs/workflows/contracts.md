# Contract Pipeline and Continuity

Use this workflow when consistency and handoff quality matter more than speed.

## Two Tiers (Read First)

This pack is a progressive harness. You start in **Tier 1** and the harness raises you to **Tier 2** as the codebase grows.

- **Tier 1 — Starter (default, every project):** the pipeline below (`PLAN → TEST → REVIEW → HANDOFF`), single-file continuity, guardrails, and the simplicity ladder. Designed for small apps and non-developers.
- **Tier 2 — Scale (opt-in, gated as the codebase grows):** indexed retrieval (Graphify), wiki orientation, and tighter review. The harness suggests Scale mode when a project outgrows Tier 1; see `docs/workflows/graphify.md` and the `Scale Mode` section below. Tier 2 is additive — Tier 1 rules still apply.

## Canonical Pipeline

Always run state artifacts in this order:

1. `.agent/PLAN.md` — objective, assumptions, task checklist, milestones, eval IDs
2. `.agent/TEST.md`
3. `.agent/REVIEW.md`
4. `.agent/HANDOFF.md`

Assumptions/constraints and the working task checklist live as sections inside `.agent/PLAN.md` (there are no separate `CONTEXT.md` or `TASKS.md` files).

## Typed State Artifact Header (Required)

Each `.agent/*.md` artifact should keep a YAML header at the top.

Required keys:
- `contract_version`
- `artifact_type`
- `status`
- `depends_on`
- `produces`
- `feeds_into`
- `memory`

Example:

```yaml
---
contract_version: 1
artifact_type: plan
status: IN_PROGRESS
depends_on: []
produces:
  - eval_ids
feeds_into:
  - .agent/TEST.md
memory:
  include_in_memory: true
  tags: [plan]
---
```

## Cross-Artifact Rules (Required)

- `PLAN.md` must define eval IDs before implementation.
- `TEST.md` must reference eval IDs from `PLAN.md`.
- `REVIEW.md` must reference executed checks and receipts from `TEST.md`.
- `HANDOFF.md` must summarize decisions, open questions, and next actions from prior artifacts.
- Do not mark work `DONE` when required upstream artifacts are missing or unresolved.

## Single-File Continuity Contract (Required)

Continuity is **two files**, both local and newest-first:
- the **goal** lives in `.agent/PLAN.md` (what we are building, milestones, eval IDs)
- **where we are** lives in `.agent/HANDOFF.md` (current state + next actions on top; the newest-first session timeline below the archive marker)

`.agent/HANDOFF.md` is the single continuity file. It replaces the older split between a separate handoff file and a separate session-history timeline — keep both the active baton and the dated timeline in this one file. Do not create alternate continuity sidecars (extra handoff append files, dated handoff files, separate active-plan files, or a separate history file). If such a file already exists, fold any still-current facts into `HANDOFF.md` and leave stale details below the archive boundary.

Keep the latest active state at the top of each continuity file. Preserve older entries below this exact marker:

```text
STOP: normal resume context ends here; older entries below are archive.
```

For ordinary resume, handoff, or context recovery, read only the newest active section and stop at that marker. Read below it only when the user explicitly asks for history or archaeology. (This bounded read is the pack's first token-management lever — see `docs/workflows/token-management.md`.)

## Continuity Checkpoints (Required)

Run a continuity checkpoint when:
- a sprint is complete or paused
- the session is about to end
- the work is entering a git or PR cycle
- context feels roughly 50% full and summarization pressure is rising

At each checkpoint:
- update `.agent/PLAN.md` with the latest active plan state above the archive marker
- update `.agent/HANDOFF.md`: refresh current state, decisions, and next actions at the top, and prepend a short dated timeline entry to the archive section
- update `.agent/LEARNINGS.md` only when learning mode is `CAPTURE` or `APPLY`, and only for lessons that pass the promotion gate (see `.agent/LEARNINGS.md`)

The optional local helper `.agent/integrations/run-checkpoint.sh` prints the required updates as a checklist; it does not write state for you.

Treat the checkpoint as a guardrail, not busywork. It exists to preserve state before context loss or shipping.

## Canonical Role Mapping

The starter pack uses a shared role registry in `docs/roles/`.

- `product-strategist` and `engineering-planner` feed `PLAN.md`.
- `qa-validator` feeds `TEST.md`.
- `reviewer` and `security-reviewer` feed `REVIEW.md`.
- `docs-releaser` feeds `HANDOFF.md` and any final docs sync.

Host-specific wrappers should stay thin:
- Cross-tool routing belongs in `AGENTS.md`.
- Claude routing belongs in `CLAUDE.md` and `.claude/agents/*.md`.
- Shared role logic belongs in `docs/roles/*.md`.

## Scale Mode (Tier 2, Default OFF)

Scale mode is the gate that raises a growing project from Tier 1 to Tier 2. The harness suggests it when a repo crosses a size threshold (roughly 40–50 source files, or when you begin working inside an existing large codebase). It is a soft suggestion, never a hard block.

When suggested or requested (`/possiblaw-starter:scale`):
- build a queryable index of the codebase with Graphify and prefer querying it over re-reading files (see `docs/workflows/graphify.md`)
- record `Scale mode: ON` in `.agent/HANDOFF.md` and configure `.agent/WIKI.md`
- keep all Tier 1 continuity and guardrail rules in force

## Optional Wiki Mode (Tier 2)

Default is `OFF`. Use `docs/workflows/wiki.md` when enabled.

When enabled:
- Configure and persist wiki paths in `.agent/WIKI.md` once per repo.
- Set `Wiki backend` to `manual` or `graphify`; default to `manual`.
- Read wiki index pages for orientation before deep code search.
- If `Wiki backend` is `graphify`, use the Graphify wiki layer (`graphify-out/wiki/index.md`) and focused graph queries for orientation.
- Verify wiki claims against code before implementation.
- Update wiki after validated changes so context compounds across sessions.
- When saving the handoff, include wiki sync notes (root path + updated pages).
- Treat generated graph/wiki output as advisory and do not install always-on hooks without explicit user approval.

## Validation Commands

Use these checks as a baseline:

- `rg -n "^contract_version: 1|^artifact_type:|^depends_on:|^produces:|^feeds_into:" .agent/*.md`
- `rg -n "UNCONFIRMED|BLOCKED|TODO" .agent AGENTS.md CLAUDE.md`

## Future Optional Memory Backend

A local-first, zero-token verbatim memory backend (e.g. MemPalace-style retrieval with citations) is a good fit for legal provenance and may be added later. It is **not** part of the current pack; file artifacts remain the single source of truth. Do not author decisions anywhere except the canonical files above.
