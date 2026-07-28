# Glossary

Short, beginner-friendly definitions of terms used across this starter pack's instruction files.

## Core workflow terms

- **Agent**: An AI system (Claude or Codex) running against this repo. "Role" is a job title; "agent" is the worker.
- **Artifact**: A Markdown file under `.agent/` or `.claude/` that the agent writes and reads to stay coherent across sessions. Examples: `PLAN.md`, `TEST.md`, `HANDOFF.md`. Artifacts are the pack's working memory.
- **Contract**: A typed agreement between files in the pack — e.g., `TEST.md` must reference eval IDs from `PLAN.md`. See `docs/workflows/contracts.md`.
- **Role**: A named job (e.g., `reviewer`, `qa-validator`). Each role has a canonical contract under `docs/roles/` plus thin Claude/Codex wrappers.
- **Handoff / continuity file**: The single continuity file `.agent/HANDOFF.md`. The **Current Baton** on top holds decisions, open questions, and next actions for the next session; below a STOP marker is a newest-first dated **Session Timeline**. (This single file replaces the older separate handoff and session-history files.)
- **Continuity checkpoint**: A forced save point (update `.agent/PLAN.md` and `.agent/HANDOFF.md` — Current Baton plus a prepended Session Timeline entry) at sprint close, before a git cycle, before ending a session, or when context fills up.
- **Progress file**: Local-only continuity files (`.agent/PLAN.md`, `.agent/HANDOFF.md`, etc.) that should not be committed.

## Testing and evaluation terms

- **TDD (Test-Driven Development)**: Write a failing test, then the smallest code to make it pass, then refactor. Tests come before implementation.
- **Eval**: A concrete Pass/Fail check tied to a user goal. Not a 1-5 quality score. See `docs/workflows/evals.md`.
- **Given / When / Then**: A plain-language way to describe a single eval. *Given* the setup, *when* the user does X, *then* Y happens.
- **Happy path / edge case / failure case**: The three minimum evals for any behavior change — the common scenario, the unusual-but-valid scenario, and the expected rejection.
- **Receipt**: The raw output captured when running a check (e.g., test command output, HTTP response code). Stored in `TEST.md` as evidence.
- **LLM-as-judge**: Using an LLM to score outputs. Only use when the criterion truly requires interpretation, and validate against human labels first.

## Security terms

- **Trust boundary**: Any line between "code/data we control" and "input we don't" (user input, network calls, file uploads). Most vulnerabilities cross a trust boundary.
- **IDOR (Insecure Direct Object Reference)**: A bug where one user can read or change another user's data by guessing or swapping an ID in a request.
- **CSRF (Cross-Site Request Forgery)**: A bug where a malicious site tricks a logged-in user's browser into making an unintended request against another site.
- **Auth / authorization**: "Authentication" = who are you? "Authorization" = what are you allowed to do? Distinct checks — both must pass.

## Pack-specific terms

- **Tier 1 / Tier 2**: The two tiers of the harness. **Tier 1 (Starter, default)** is the everyday workflow most projects need — `PLAN → TEST → REVIEW → HANDOFF`, single-file continuity, guardrails, the simplicity ladder, and token discipline. **Tier 2 (Scale, opt-in)** adds Graphify indexing, wiki orientation, and deeper review. Tier 2 only adds to Tier 1; it never removes its rules.
- **Scale mode**: Tier 2, default OFF. Turn it on with `/possiblaw-starter:scale` when the codebase grows large (roughly 40–50+ source files) or you start working in an existing large repo. It builds a queryable Graphify index and configures `.agent/WIKI.md` so you query the index instead of re-reading files.
- **Simplicity ladder**: An always-on Tier-1 rule: after understanding the problem, prefer the simplest option that works, in order — skip unneeded work → reuse existing code → standard library → native platform feature → existing dependency → small one-liner → only then a minimal new solution. See the `applying-simplicity-ladder` skill.
- **Token management**: Keeping the prompt/context small and the prompt cache warm so the harness stays fast and cheap — read only the top of `.agent/HANDOFF.md` on resume, load files on demand, keep stable blocks stable. See `docs/workflows/token-management.md`.
- **Graphify**: Optional Tier-2 code-indexing tool that builds a queryable knowledge graph of the repo. Output is advisory. See `docs/workflows/graphify.md`.
- **Wiki mode**: Optional Tier-2 persistent-context layer (manual Markdown or Graphify-generated). Accelerates orientation; does not replace source.
- **Learning Mode**: A per-task switch (`OFF` / `CAPTURE` / `APPLY`) that controls whether the agent writes to `.agent/LEARNINGS.md`. Default OFF. Validation-gated: a lesson is promoted only after it recurs at least twice or you confirm it.
- **UNCONFIRMED**: Marker used wherever a value is genuinely unknown. The agent must ask or verify rather than invent. Never ship code with `UNCONFIRMED` values silently replaced.
- **BLOCKED**: Return value meaning "I can't safely proceed; here's why and what I need." Used instead of guessing or taking a destructive action.

## Terms intentionally NOT defined

If a term is fully defined in the code or in the Stack/Code Map sections of `CLAUDE.md`/`AGENTS.md`, look there rather than here. Keep this glossary small and maintained.
