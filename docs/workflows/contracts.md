# Contract Pipeline and Memory

Use this workflow when consistency and handoff quality matter more than speed.

## Canonical Pipeline

Always run state artifacts in this order:

1. `.agent/PLAN.md`
2. `.agent/TEST.md`
3. `.agent/REVIEW.md`
4. `.agent/HANDOFF.md`

`CONTEXT.md` and `TASKS.md` can be updated throughout execution, but they are supporting artifacts.

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

## Continuity Checkpoints (Required)

Run a continuity checkpoint when:
- a sprint is complete or paused
- the session is about to end
- the work is entering a git or PR cycle
- context feels roughly 50% full and summarization pressure is rising

At each checkpoint:
- update `PLAN.md` milestone and sprint status
- update `HANDOFF.md` with current state, decisions, and next actions
- append `.claude/history.md`
- append `.agent/LEARNINGS.md` only when learning mode is `CAPTURE` or `APPLY`

Optional local helpers may be used:
- `.agent/integrations/run-checkpoint.sh`
- `.agent/integrations/run-checkpoint.ps1`

Treat the checkpoint as a guardrail, not busywork. It exists to preserve state before context loss or shipping.

## Canonical Role Mapping

The starter pack uses a shared role registry in `docs/roles/`.

- `product-strategist` and `engineering-planner` feed `PLAN.md`.
- `qa-validator` feeds `TEST.md`.
- `reviewer` and `security-reviewer` feed `REVIEW.md`.
- `docs-releaser` feeds `HANDOFF.md` and any final docs sync.

Host-specific wrappers should stay thin:
- Codex routing belongs in `AGENTS.md`.
- Claude routing belongs in `CLAUDE.md` and `.claude/agents/*.md`.
- Shared role logic belongs in `docs/roles/*.md`.

## Optional Memory Backend (MemPalace)

Default is `OFF`. File artifacts remain the source of truth.

When enabled:
- Ingest completed `PLAN`, `TEST`, `REVIEW`, `HANDOFF`, and `.claude/history.md`.
- Trigger ingest after continuity checkpoints, especially sprint closeout.
- Use retrieval in raw/verbatim mode for reliability.
- Treat memory retrieval as advisory; resolve conflicts in favor of current local artifacts.
- Capture citations to source artifact path and timestamp in summaries.

## Optional Skill Workflow Integration (gstack-inspired)

Default is `OFF`. Use only if a matching skill runtime exists in the repo.

When enabled:
- Map stage skills to pipeline phases (plan, test, review, handoff).
- Require every stage skill to emit structured outputs that feed the next artifact.
- Keep skill usage optional with deterministic file-based fallback.
- Keep plugin/runtime-specific behavior out of core repo policy unless explicitly adopted.

## Optional Wiki Mode Integration (Karpathy Pattern)

Default is `OFF`. Use `docs/workflows/wiki.md` when enabled.

When enabled:
- Configure and persist wiki paths in `.agent/WIKI.md` once per repo.
- Set `Wiki backend` to `manual` or `graphify`; default to `manual`.
- Read wiki index pages for orientation before deep code search.
- If `Wiki backend` is `graphify`, use `graphify-out/GRAPH_REPORT.md` and focused graph queries for orientation.
- Verify wiki claims against code before implementation.
- Update wiki after validated changes so context compounds across sessions.
- When saving handoff/history, include wiki sync notes (root path + updated pages).
- Treat generated graph/wiki output as advisory and do not install always-on hooks without explicit user approval.

## Validation Commands

Use these checks as a baseline:

- `rg -n "^contract_version: 1|^artifact_type:|^depends_on:|^produces:|^feeds_into:" .agent/*.md`
- `rg -n "UNCONFIRMED|BLOCKED|TODO" .agent AGENTS.md CLAUDE.md`
