# CLAUDE.md — PossibLaw (repo-level instructions)

You're a coding agent working on PossibLaw, a proof-of-concept layer on paperclip that demonstrates how to operate a legal business with AI.

## Startup contract

1. **Read first:** `/Users/salvadorcarranza/.claude/plans/possiblaw-poc-clean-rebuild.md` (plan of record — binding).
2. **Read second:** `.agent/HANDOFF.md` (what's done, what's next, where to start).
3. **Read third:** `.agent/PLAN.md` (live work queue + Sprint 11 spec).
4. **Read fourth:** `.claude/history.md` (session log — context, not instructions).
5. After that, work on the next task in `.agent/PLAN.md`.

## Scope boundaries

- All net-new PossibLaw code lives under `layer/` (content) and `cli/` (runtime).
- **Never modify `paperclip/`.** It's a git submodule pinned to upstream. To advance: `git -C paperclip fetch && git -C paperclip checkout <sha> && git add paperclip && git commit`.
- **Never rename paperclip internals.** Anti-pattern #1 in the plan; cost the previous build dearly.
- All agent + skill + workflow + template + test + guardrail content goes under `layer/`. The CLI loads them by walking those directories.

## Conventions

- **Strict TypeScript, no `any`.** Use types from `cli/types.ts`. Add new types there if needed.
- **ES modules with `.js` import extensions** (NodeNext resolution).
- **One sprint per commit.** Co-author every commit with `Claude Opus 4.7 (1M context) <noreply@anthropic.com>`.
- **No new top-level deps without clear reason.** PoC posture.
- **All sprint-level changes need a `docs/sprint-N-demo.md` walkthrough.**
- **Update `CHANGELOG.md`** with each sprint commit.

## Auth posture (important)

Operator prefers **subscription-based auth** via local CLIs over API-key billing. Sprint 11 is the planned work to wire this in. Until then, live LLM calls require `ANTHROPIC_API_KEY`. See `.agent/PLAN.md` for the Sprint 11 spec.

## TDD and verification

Per `~/.claude/CLAUDE.md` global rules:
- For code changes, prefer TDD: failing test first, then implementation, then refactor with checks still green.
- Before claiming a sprint done, run the verification commands in the sprint dispatch prompt. Capture outputs in the implementer report.
- Never mark a task complete without `pnpm typecheck && pnpm build` passing + offline NDA demo unchanged.

## What goes in CHANGELOG / what doesn't

- **In CHANGELOG:** every sprint commit, version bumps, breaking changes, new public-facing CLI surfaces.
- **Not in CHANGELOG:** internal refactors that don't change behavior, doc-only fixes, gitignore changes.

## Boundary rules

Always do:
- Stay under `/Users/salvadorcarranza/possiblaw/`.
- Keep edits scoped to the requested task.
- Reference exact paths and commands.
- Mark unknowns as `UNCONFIRMED` (especially for vendor APIs without published specs — see Westlaw/Lexis/midpage README files for the pattern).

Ask first:
- Destructive operations (deleting branches, dropping data, force-pushing).
- Pushing to public GitHub.
- Adding non-trivial dependencies.
- Anything outside the active sprint's scope.

Never do:
- Modify `paperclip/`.
- Commit secrets, key stores, or eval result artifacts (all gitignored).
- Push without explicit operator approval.
- Invent vendor API endpoints without flagging UNCONFIRMED.

## Commands quick reference

```bash
# Verify everything still works
pnpm typecheck && pnpm build
env -u ANTHROPIC_API_KEY node dist/cli/index.js run quick-counsel "draft NDA for ACME"

# Inspect the system
bin/possiblaw team list --template small-firm
bin/possiblaw workflows list
bin/possiblaw connectors list
bin/possiblaw eval list-datasets

# History
git log --oneline | head -15
cat .agent/HANDOFF.md
cat .agent/PLAN.md
```
