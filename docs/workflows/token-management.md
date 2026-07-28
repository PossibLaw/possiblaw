# Token Management

Every message you send the agent costs *tokens* — the units of text it reads and
writes. The more it has to read each turn, the slower and more expensive the work
gets, and the easier it is for the agent to lose the thread. You don't need to
count tokens yourself. This pack manages them for you through a handful of
concrete **levers**, and most of them are automatic.

Think of it in two tiers:

- **Tier 1 (Starter, always on)** keeps the *startup* context small and the
  *generated code* small. This is everything a typical small project needs.
- **Tier 2 (Scale, turns on with Scale mode)** keeps context flat even as the
  codebase and the rulebook get big, by querying an index instead of re-reading
  files.

## The levers

| Lever | Tier | Mechanism |
| --- | --- | --- |
| Bounded startup context | 1 | Single newest-first HANDOFF; resume reads only the top, stops at the STOP marker |
| Prompt-cache discipline | 1 | Keep PLAN/CLAUDE.md stable blocks stable within a session; cached tokens are ~90% cheaper |
| Trigger-loaded docs | 1 | Load docs only on the Startup Contract triggers; never read the whole repo at startup |
| Simplicity ladder | 1 | Less generated code = less to read, review, and maintain (~54% less code in practice) |
| Query the index, don't re-read | 2 | Graphify: query graph.json / the wiki layer before reading source files (~71× fewer tokens/query on large repos) |
| Rule retrieval (tier split) | 2 | Keep a tiny always-on rule set; load roles/workflows/vendor docs on trigger so context stays flat as the rulebook grows |
| Budget-aware detail | 2 | Short reminders by default; expand to full rationale only when there's context room |

## How to read this

- **Bounded startup context** — When you resume, the agent reads only the top of
  `.agent/HANDOFF.md` (the "current baton") and stops at the STOP marker. Old
  history sits below the line and is only read if you ask for it.
- **Prompt-cache discipline** — Re-sending the *same* leading text (this file,
  `.agent/PLAN.md`) is far cheaper than new text, because it's cached. So we avoid
  churning those stable blocks mid-session.
- **Trigger-loaded docs** — Docs load only when a trigger in the Startup Contract
  fires (a planning request loads `PLAN.md`, a token question loads this file).
  The agent never slurps the whole repo at startup.
- **Simplicity ladder** — The single biggest lever. Writing less code (see the
  `applying-simplicity-ladder` skill) means less for the agent to read, review,
  and maintain forever after.
- **Query the index, don't re-read** — At Tier 2, Graphify builds a queryable
  index. The agent asks the index "where does X live?" instead of re-reading
  source files, which is dramatically cheaper on large repos.
- **Rule retrieval (tier split)** — The always-on rulebook stays tiny; roles,
  workflows, and vendor docs load only on trigger, so context stays flat even as
  the project's rules grow.
- **Budget-aware detail** — By default the agent gives short reminders; it expands
  to full rationale only when there's room to spare.

## Bottom line

The **Tier 1** levers are always on — you get them for free on every project. The
**Tier 2** levers switch on when you enable Scale mode with `/possiblaw-starter:scale`
and keep context flat as the codebase grows.

See also: `docs/workflows/contracts.md` (the continuity pipeline and the STOP
marker) and `docs/workflows/graphify.md` (the index behind the Tier 2 levers).
