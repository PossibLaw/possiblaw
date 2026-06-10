# CLAUDE.md

Repo Root (absolute path, required): /Users/salvadorcarranza/possiblaw

PossibLaw is a proof-of-concept layer on the paperclip control plane that demonstrates how to operate a legal business with AI — legal practice plus marketing, finance, admin, BD, and ops. Public, Apache 2.0, layer-not-fork posture; paperclip is wired as a pinned git submodule and never modified.

## Startup Contract
1. This file is the only startup instruction. Do not read other files unless triggered.
2. Do the requested task immediately.
3. Load extra files only on trigger:
   - Planning request → `.agent/PLAN.md`
   - Test request → `.agent/TEST.md`
   - Review request → `.agent/REVIEW.md`
   - Handoff, resume, or parallel worktree → `.agent/HANDOFF.md` or `.claude/history.md`
   - Contract workflow, artifact schema, or stage handoff questions → `docs/workflows/contracts.md`
   - Role workflow, routing, or specialization questions → `docs/roles/README.md` plus the relevant role file in `docs/roles/`
   - Wiki mode, Obsidian vault path, or persistent knowledge questions → `.agent/WIKI.md` and `docs/workflows/wiki.md`
   - Graphify codebase indexing request → `.agent/WIKI.md` and `docs/workflows/graphify.md`
   - Learning request, or `Learning Mode` = `CAPTURE`/`APPLY` → `.agent/LEARNINGS.md`
   - Vendor/integration setup or API config → `docs/vendor/`
   - Evals/help defining “done” → `docs/workflows/evals.md`
   - Unfamiliar term (e.g. "eval", "handoff", "trust boundary") → `docs/glossary.md`
4. If more repo context is needed, read `.claude/history.md` next — not the whole repo.
5. Global continuity stays in `~/.claude/CLAUDE.md`. Repo continuity is optional and on-demand.
6. When a sprint is wrapping, work is about to pause or ship, or context feels roughly half full, run a continuity checkpoint before losing state.

## Repo Root & State File Paths (Required)
1. Before writing any state file (`.agent/PLAN.md`, `.agent/HANDOFF.md`, `.agent/WIKI.md`, `.claude/history.md`), resolve the repo root using `git rev-parse --show-toplevel` and confirm with `pwd`.
2. If the resolved root is under `/tmp`, `/var/folders`, or any OS temp directory, return `BLOCKED` and ask for the real repo root.
3. If multiple repo roots or worktrees are possible, ask the user which repo root to use.
4. If the repo root cannot be resolved, ask the user for the absolute repo root path and do not write any state files until confirmed.
5. Always write the plan to `${REPO_ROOT}/.agent/PLAN.md`.
6. Always write the handoff to `${REPO_ROOT}/.agent/HANDOFF.md`.
7. Always write history to `${REPO_ROOT}/.claude/history.md`.
8. If `.agent/` or `.claude/` is missing, return `BLOCKED` and ask for permission to create them under `${REPO_ROOT}`.
9. When saving, print the absolute path used; if it is not under `${REPO_ROOT}`, stop and ask for correction.

## Tool Ownership
- Claude reads: `CLAUDE.md` (this file), `~/.claude/CLAUDE.md` (global), `.claude/agents/*.md`, `.claude/skills/*/SKILL.md`.
- Ignore `AGENTS.md` and `.codex/` unless the user explicitly requests cross-agent sync.
- Shared contracts in `docs/roles/`, `docs/workflows/`, and `docs/vendor/` apply to both Claude and Codex.

## Session Memory
After completing work, append a summary to `${REPO_ROOT}/.claude/history.md` (local-only, gitignored):
- Date and task title.
- Files changed.
- Key decisions (with status).
- Current state and next steps.

Before pausing, handing off, or moving into a git cycle, refresh:
- `${REPO_ROOT}/.agent/PLAN.md` milestone status and sprint status.
- `${REPO_ROOT}/.agent/HANDOFF.md` with current decisions, open questions, and next actions.
- `${REPO_ROOT}/.claude/history.md` with a short checkpoint entry.
- `${REPO_ROOT}/.agent/LEARNINGS.md` only when `Learning Mode` is `CAPTURE` or `APPLY`.

When resuming prior work, read `${REPO_ROOT}/.claude/history.md` first.

## Local Continuity Files (Do Not Commit)
- Keep these files local and out of commits/PRs:
  - `.claude/history.md`
  - `.agent/PLAN.md`
  - `.agent/CONTEXT.md`
  - `.agent/TASKS.md`
  - `.agent/REVIEW.md`
  - `.agent/TEST.md`
  - `.agent/HANDOFF.md`
  - `.agent/WIKI.md`
  - `.agent/LEARNINGS.md`
- If any are already tracked, untrack them with `git rm --cached <path>`.

## Optional Learning Loop (Default OFF)
- Default: `Learning Mode` is `OFF`.
- Turn on for a task by either:
  - setting `Learning Mode` in `.agent/PLAN.md`, or
  - explicit user instruction (`Learning Mode: CAPTURE` or `Learning Mode: APPLY`).
- Mode behavior:
  - `OFF`: no learning entries and no skill/plugin updates.
  - `CAPTURE`: append observations to `.agent/LEARNINGS.md` only.
  - `APPLY`: capture observations and propose specific skill/plugin/instruction updates.
- This is additive. Do not replace `.claude/history.md` or `.agent/HANDOFF.md`.

## Commands
`./bin/possiblaw` - One-command launcher: onboard paperclip, pick variant, import the package, open the dashboard.
`./bin/possiblaw --dry-run --variant codex --non-interactive --yes` - Validate the import body against `/api/companies/import/preview` without writing.
`./bin/possiblaw --list-variants` - Show available variants and their requirements.
`bash -n bin/possiblaw` - Static-check the launcher.
`python3 bin/_possiblaw_variants.py --self-test && python3 bin/_possiblaw_inline_source.py --self-test` - Self-test the Python helpers.
`pnpm -C paperclip install` - Install the paperclip submodule's dependencies (the only pnpm usage left).

Run the launcher dry-run + helper self-tests before handoff. Expected dry-run plan summary: 0 warnings, 0 errors.

## Stack
- Runtime: paperclip (git submodule, pinned, never modified) owns UI, auth, orchestration, budgets, adapters, audit.
- Package: Agent Companies v1 format under `companies/legal-operations/` — Markdown (`COMPANY.md`, `AGENTS.md`, `SKILL.md`, `PROJECT.md`, `TASK.md`) plus the `.paperclip.yaml` sidecar for paperclip-only fidelity.
- Launcher: `bin/possiblaw` (bash) + `bin/_possiblaw_variants.py` / `bin/_possiblaw_inline_source.py` (stdlib-only Python). Imports via direct HTTP POST to `/api/companies/import` (the CLI strips `adapterConfig`; the HTTP API does not).
- Variants: `companies/legal-operations/variants.yaml` maps each agent's `metadata.possiblaw.modelLane` (primary / routing / drafting / review / extractive) to per-variant adapter config. Variants: codex (Codex CLI), claude (Claude CLI), ollama (OpenCode → Ollama).
- The standalone TypeScript CLI runtime was removed in 0.4.0 (see CHANGELOG); do not resurrect it. `layer/` holds remaining unconverted source material.

## Code Map
- Entry point: `bin/possiblaw` (bash launcher).
- Package root: `companies/legal-operations/` — 52 agents under `agents/`, 71 skills under `skills/`, 3 projects under `projects/`, eval convention under `evals/`, `variants.yaml`, `.paperclip.yaml`.
- Org chart: chief-of-staff (orchestrator), chief-counsel, thirteen leads (commercial, employment, ip, privacy, litigation, corporate, regulatory, research, bd, ops, finance, marketing, admin), plus 37 specialists across those practices (incl. meta-reviewers risk-spotter/debate-judge/reconciler and capability-builder — operator-review gated). Each lead's AGENTS.md routing table is the authoritative specialist list.
- Historical source material: `layer/` (agents, skills, workflows, connector YAML, eval datasets) — convert into the package, don't extend.
- Docs: `docs/operator-walkthrough.md` (canonical getting-started), `docs/paperclip-package.md`, `docs/known-limitations.md`, `docs/ARCHITECTURE.md` (decision log).
- Plan + handoff: `/Users/salvadorcarranza/.claude/plans/eventual-munching-fairy.md` (plan-of-record, local-only), `.agent/PLAN.md` (active work queue), `.agent/HANDOFF.md`.
- Submodule: `paperclip/` (pinned, never modified).
- Tests: validation is launcher dry-run against a fresh data dir + helper `--self-test` modes + per-package frontmatter/YAML parse checks. No Node test runner.

## Canonical Roles
- `product-strategist` — Clarifies user value, scope, and success criteria. Source of truth: `docs/roles/product-strategist.md`.
- `engineering-planner` — Produces an executable implementation plan with risks and eval IDs. Source of truth: `docs/roles/engineering-planner.md`.
- `reviewer` — Performs correctness and regression review. Source of truth: `docs/roles/reviewer.md`.
- `security-reviewer` — Performs attacker-minded review and security-check pressure testing. Source of truth: `docs/roles/security-reviewer.md`.
- `qa-validator` — Executes evals and records receipts. Source of truth: `docs/roles/qa-validator.md`.
- `docs-releaser` — Syncs handoff and user-facing docs after validation. Source of truth: `docs/roles/docs-releaser.md`.

In Claude Code, invoke each role via its `@name` handle (for example `@reviewer`, `@qa-validator`). Name = canonical role.

## Routing Rules
- Product framing, scope, or success-definition work → `@product-strategist`.
- Implementation planning and architecture tradeoffs → `@engineering-planner`.
- Test execution, eval receipts, and validation evidence → `@qa-validator`.
- Correctness, regressions, and maintainability review → `@reviewer`.
- Security-sensitive review or trust-boundary changes → `@security-reviewer`.
- Release notes, handoff, and docs sync after validated changes → `@docs-releaser`.
- If required facts are missing, escalate once with a targeted question.

Supporting specialists (not canonical roles — use when a canonical role is not a fit):
- Source extraction or fact gathering → `@research-agent`.
- Markdown-heavy doc drafting without release ownership → `@docs-agent`.

## Contract Pipeline (Required)
- Canonical source: `docs/workflows/contracts.md`. Read it for full rules, artifact schema, cross-artifact linkage, and validation commands.
- Quick summary: stage order is `PLAN.md` → `TEST.md` → `REVIEW.md` → `HANDOFF.md`; each stage must cite evidence from the prior stage; never return `DONE` with an unresolved upstream artifact.

## Continuity Checkpoint Contract
- Canonical source: `docs/workflows/contracts.md` (Continuity Checkpoints section).
- Quick summary: run a checkpoint at sprint close, before a git cycle, before ending the session, and when context feels ~50% full. Each checkpoint updates `.agent/PLAN.md`, `.agent/HANDOFF.md`, and appends `.claude/history.md` (and `.agent/LEARNINGS.md` when learning mode is enabled).
- If present, prefer local helpers: `.agent/integrations/run-checkpoint.{sh,ps1}`. If a local `.agent/integrations/mempalace-ingest.{sh,ps1}` exists, call it after file artifacts are updated.

## Optional Memory Backend (MemPalace, Default OFF)
- File artifacts in `.agent/*.md` and `.claude/history.md` remain source of truth.
- If a local MemPalace backend is enabled, ingest completed `PLAN/TEST/REVIEW/HANDOFF/history` artifacts after each task.
- Use raw/verbatim retrieval mode for reliability.
- Treat memory retrieval as advisory and resolve conflicts in favor of current local files.

## Git Workflow Contract
- Use focused branches and atomic commits.
- Attach validation evidence to PRs and handoffs.
- Never commit credentials.
- Never commit `.agent/*` or `.claude/history.md`.
- For novice-safe shipping, run this order:
  1. `git status --short`
  2. review `git diff --stat` and files changed
  3. run relevant checks
  4. refresh the plan/handoff/history checkpoint
  5. commit a focused change
  6. push the branch and open or update a PR when a remote exists
- If local helper scripts exist, prefer:
  - `.agent/integrations/run-checkpoint.sh --reason pre-git-cycle`
  - `.agent/integrations/run-checkpoint.ps1 -Reason pre-git-cycle`

## Optional Skill Runtime Integration (gstack-inspired, Default OFF)
- If stage skills are available, use them to produce structured outputs that feed the next artifact.
- Keep deterministic file-based fallback active at all times.
- Do not require plugin/runtime-specific tooling for baseline operation.

## Optional Wiki Mode (Default OFF)
- Configure vault and wiki paths in `.agent/WIKI.md` before first use.
- Use `docs/workflows/wiki.md` for startup flow, metadata, and lint rules.
- Wiki pages accelerate orientation; source code and tests remain authoritative.
- For full repository review requests, start with `.agent/WIKI.md` and wiki index, then verify in code.

## Vendor References
- For vendor/integration setup, API config, or security guidance, read `docs/vendor/<vendor>.md` first.
- Treat `docs/vendor/*.md` guidance as authoritative over model-memory defaults.
- If the vendor file is missing or stale, consult official vendor docs/release notes before answering.
- Cite the official source URL and source date for recency-sensitive vendor guidance.

## Security Review Contract
- For review tasks, apply `.agent/REVIEW.md` Security Review Mode and complete the required security checklist.
- For validation/test tasks, run `.agent/TEST.md` security checks when work touches auth, data access, input handling, API surface, or deployment/runtime settings.

## TDD and Eval Contract
- For code changes, use TDD when feasible: start with a failing test/eval, implement the minimum code to pass, then refactor while checks stay green.
- Never assume eval inputs, acceptance criteria, fixtures, or expected outputs; mark unknowns as `UNCONFIRMED` and resolve with a targeted user question.
- For any new or changed behavior, provide an end-user eval walkthrough before implementation using plain language plus Given/When/Then, including happy path, edge case, and failure/security case.
- Minimize user friction: infer likely test/eval commands and fixtures from repository signals first; ask the user only targeted follow-ups for unresolved unknowns.
- If an eval plan is missing or vague, follow `docs/workflows/evals.md` and propose a minimal 3-eval set (happy, edge, failure/security) before implementation.

## Boundary Rules
Always do:
- Keep edits scoped to requested files.
- Reference exact paths and commands.
- Mark unknowns as `UNCONFIRMED`.

Ask first:
- Destructive operations or schema-changing edits.
- Large refactors outside the stated objective.

Never do:
- Invent evidence or claim completion without validation.
- Remove failing tests to force a pass.
- Expose secrets.
- Read instruction files not triggered by the current task.

## Local Norms
- Persist repeated user corrections here so they survive across sessions.
- Do not duplicate higher-layer policy from `~/.claude/CLAUDE.md`.
