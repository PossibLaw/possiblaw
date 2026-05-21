# PossibLaw Session History

## 2026-05-20 / 21 — Clean rebuild per plan, Sprints 0–10

**Task:** Execute `/Users/salvadorcarranza/.claude/plans/possiblaw-poc-clean-rebuild.md` end-to-end via subagent-driven development. Goal: working exemplar that the operator can test.

**Outcome:** Sprints 0 through 10 complete, committed, pushed to `https://github.com/PossibLaw/possiblaw` on `main`. PoC runs end-to-end in offline mode with deterministic fixtures; live mode pending Sprint 11 (subscription-auth providers).

### Sequence of work

1. **Plan review + reconnaissance.** Located v1 repo at `/Users/salvadorcarranza/possiblaw/` (later deleted per §11 lock). Confirmed `paperclipai/paperclip` GitHub repo public. Decided to build v2 at `/Users/salvadorcarranza/possiblaw-v2/` to avoid touching v1 until operator confirmed deletion.
2. **Sprint 0 + 1a (commit `fd47e8e`).** Subagent dispatched for repo scaffolding + Sprint 1a vertical slice (Chief Counsel → Commercial Lead → nda-drafter with stub test + stub guardrail).
3. **Clean restart per operator.** Operator confirmed deletion of v1 (local 10GB + GitHub repo). Deleted v1; moved v2 to canonical path `/Users/salvadorcarranza/possiblaw/`; initial commit `fd47e8e`; pushed to fresh public repo.
4. **Decision batch (8 architecture decisions).** Captured via two AskUserQuestion rounds: test framework (in-tree minimal), audit location (layer/audit/), Privacy Filter detector (encoder-decoder via local LLM — operator override of recommended Presidio), eval output (both Markdown + JSON), local model (Ollama for both Sprint 4 + 5), connectors (build all, operator chooses + added midpage), eval spend ($50), Sprint 1b defaults (apply plan defaults).
5. **Sprints 1b → 10 dispatched sequentially.** One subagent per sprint, `sonnet` model, with detailed task spec + verification gates. Each sprint produced one commit. Major sprint sizes:
   - Sprint 6 was split into 6A (framework + stand-ins + 3 reference connectors) and 6B (8 more live connectors) due to scope.
   - Sprint 4 implemented Privacy Filter with Ollama HTTP client + rule-based fallback. Ollama daemon not installed; fallback path verified.
   - Sprint 8 extended pipeline runner with `parallel` / `reconcile` / `debate` step kinds for Deep Review / Stress Test / Roundtable workflows.
   - Sprint 9 wired 5 public datasets (CUAD/MAUD/ACORD/UNFAIR-ToS/LEDGAR) with fetch + adapter + scorer per dataset; offline fixtures bundled so harness verifies without API key.
6. **Auth pivot.** Operator pushed back on direct API-key path; pointed to paperclip's subscription-login support. Confirmed paperclip/docs/agents-runtime.md notes "subscription login" as the default and API-key as an override. Verified `claude` (2.1.146) and `codex` (0.132.0) CLIs installed locally with non-interactive `--print` / `exec` modes. Scoped Sprint 11 (subscription-auth providers) and deferred live evals.
7. **Continuity docs + push.** Wrote `.agent/HANDOFF.md`, `.agent/PLAN.md`, this file. Final state committed and pushed.

### Files changed

Everything new lives under `/Users/salvadorcarranza/possiblaw/`. Per-sprint deltas in CHANGELOG.md.

### Key decisions

| Decision | Rationale | Where recorded |
|---|---|---|
| Apache 2.0 from day 1 | Patent grant matches a legal-adjacent tool; consistent with Anthropic's 12 practice-area plugins | LICENSE, NOTICE |
| paperclip as git submodule pinned to `c91a062...` | Full source visible; no fork; clean upstream sync | FOUNDATION.md |
| Chief of Staff opt-in only (Sprint 1b) | At Sprint 1a scale (one domain) the extra router hop is overhead without value | docs/ARCHITECTURE.md |
| Model-field schema as string `provider/name` (Sprint 1b) | Sprint 1a didn't surface any param the string can't carry | docs/ARCHITECTURE.md |
| In-tree test runner (Sprint 2) | PoC posture; no new dep; easy to swap later | docs/test-and-guardrail-model.md |
| Audit log in `layer/audit/<matter-id>.jsonl` (Sprint 2) | Self-contained until paperclip extension-point inventory finalized | docs/sprint-2-handoff.md |
| Privacy Filter encoder-decoder via Ollama (Sprint 4) | Operator preference; reversible substitution requires generative model | docs/privacy-filter.md |
| Build all connectors as scaffolded, opt-in via env (Sprint 6) | Operator scoping; matches "people choose what they use" | docs/connectors-inventory.md |
| Subscription auth via local CLIs (Sprint 11 — pending) | Operator preference; zero new API-key billing surface | .agent/PLAN.md |

### What the operator should know

- The PoC works **right now** at `bin/possiblaw run quick-counsel "draft NDA for ACME"` — no API key needed in offline mode. Real LLM output gated on Sprint 11.
- 13 commits pushed to `main`. Repo is public.
- v1 (the rename-to-odysseus-and-back disaster) is gone. Don't bring it back.
- Sprint 11 + live evals are the natural next chunk. ETA ~60–90 min of subagent work.
- Outside-operator validation and outside-reviewer doc-walkthrough are the only Definition-of-Done items that can't be done by an agent. Drafts are in `docs/outreach/`.

### Next session resume

```bash
cd /Users/salvadorcarranza/possiblaw
git pull
cat .agent/HANDOFF.md
cat .agent/PLAN.md
# resume from Sprint 11
```
