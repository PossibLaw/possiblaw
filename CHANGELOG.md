# Changelog

All notable changes to PossibLaw are documented here.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
Versioning: [SemVer](https://semver.org/).

---

## [0.6.0] — 2026-06-09 — Variant expansion: llamacpp / opencode / openrouter

### Added

- **`llamacpp` variant** — fully local HF GGUF models through a llama.cpp server (`llama-server`), no Ollama client. Rides paperclip's `opencode_local` adapter via an OpenCode `@ai-sdk/openai-compatible` provider block (`baseURL http://127.0.0.1:8080/v1`); the launcher offers to write the block on first run. All lanes pin `llamacpp/default` (llama-server serves its loaded GGUF and ignores the requested name). New generic `requires_endpoint` preflight verifies the server is reachable before live runs.
- **`opencode` variant** — first-class OpenCode via the OpenCode Zen gateway under a single `OPENCODE_API_KEY`. Lane pins mirror the `claude` variant 1:1 (Zen serves the same Claude models — verified against the models.dev registry 2026-06-09). Key stored via the same encrypted company-secret + `secret_ref` flow as the `-api` variants.
- **`openrouter` variant** — multi-vendor cloud catalog under `OPENROUTER_API_KEY`, through OpenCode's native openrouter provider (auto-enabled by the env key; no `opencode.json` block needed). Lane pins mirror the `claude` variant via OpenRouter IDs (dots, not dashes). Live launches verify each pin against the keyless public catalog (`openrouter.ai/api/v1/models`) and block with remediation on rot; `--skip-model-probe` bypasses.
- Privacy lane now recognizes llama.cpp: `skills/privacy-encoder/SKILL.md` §0 accepts either a reachable Ollama daemon or a llama-server as the required local lane for confidential/privileged matters, and the launcher's startup warning keys off a new `local: true` variants.yaml flag (ollama, llamacpp) instead of hardcoding Ollama.
- `bin/_possiblaw_variants.py --lint` — structural validation of variants.yaml (adapterType/model presence, mapping shapes, OpenCode `provider/model` model-id format on `opencode_local` variants), covered by `--self-test`.

### Changed

- Environment preflights (variant CLI presence, Ollama daemon, endpoint reachability, OpenCode provider config) now **warn on `--dry-run` instead of blocking** — the preview is server-side and never invokes the variant runtime. Live runs still block. This matches the existing dry-run behavior of the API-key checks.
- The launcher's auto-written OpenCode config template is now per-provider (ollama and llamacpp templates shipped; other providers get manual instructions).

### Fixed

- Missing `~/.config/opencode/opencode.json` on a live non-interactive run now exits non-zero; previously it printed errors and continued into a launch that would fail at the first agent run.

---

## [0.5.0] — 2026-06-09 — Dual-auth: API-key variants + preflight model probe

### Added

- `codex-api` and `claude-api` variants in `companies/legal-operations/variants.yaml` — same models/lanes as their subscription twins, billed against `OPENAI_API_KEY` / `ANTHROPIC_API_KEY`. After import the launcher stores the key once as a paperclip company secret (provider `local_encrypted`, encrypted at rest) and binds all 11 agents to it via `adapterConfig.env` `secret_ref` references. The raw key never appears in package files, the import body, logs, or temp files (validated by grep against a live e2e run).
- Preflight model probe: live launches of CLI variants probe each distinct lane model with one minimal request (`claude -p` / `codex exec`), so "you don't have access to this model" errors block at launch with remediation options instead of failing mid-issue. New `--skip-model-probe` flag; dry-runs never probe.
- Preflight key checks: `*-api` variants block (live) or warn (dry-run) when the required key is missing; subscription variants warn when a stray matching API key in the shell would silently flip CLI billing to the API account.
- `bin/_possiblaw_variants.py` new modes: `--show-secret-env`, `--list-models`, `--build-env-patches` (all covered by `--self-test`).

### Fixed

- **Codex subscription variant repinned `gpt-5.3-codex` → `gpt-5.5`.** Probed live on codex 0.137 (2026-06-09): ChatGPT-subscription accounts get `"The 'gpt-5.3-codex' model is not supported when using Codex with a ChatGPT account"` (same for `gpt-5.5-codex`); the default `gpt-5.5` works. This was the root cause of subscription launches failing with model-access errors. `codex-api` pins `gpt-5.5-codex` (codex-tuned, API-served; verified at launch by the probe). Full subscription e2e validated: probe pass → 11 agents imported → 0 warnings, no API key in the environment.
- Probe hardening: stdin redirected from `/dev/null` (codex exec reads non-TTY stdin) and codex probes force `model_reasoning_effort=low` so they stay fast and cheap regardless of the operator's codex config.
- `bin/possiblaw --port` was never passed to `paperclipai onboard` (which reads `$PORT`), so custom ports health-checked an address nothing listened on. Worked before only because port 3100 was free or already running paperclip.
- `json_get_str` fed its Python program through stdin via heredoc, clobbering the JSON the caller piped in — `company.id` always parsed empty on live imports, silently skipping the mission PATCH. Both stdin-reading helpers now use `python3 -c`. Mission PATCH verified working live for the first time.
- Model-probe diagnostics fall back to stdout when the CLI prints access errors there (claude does).

---

## [0.4.0] — 2026-06-09 — Phase 1 reset: standalone CLI runtime removed

### Removed

- `cli/` — the entire standalone CLI runtime (pipeline, provider registry, eval harness, test/guardrail runners, connectors, audit, privacy filter). Paperclip natively provides everything this reimplemented: orchestration, UI, auth, adapters, budgets, audit, approvals. All code remains in git history (`git log --oneline -- cli/`).
- `bin/possiblaw.dev` (tsx stub for the deleted CLI), top-level `package.json`, `tsconfig.json`, `pnpm-lock.yaml`, `.github/workflows/ci.yml` (CI for the deleted runtime).
- CLI-era docs: `docs/sprint-{2,4,5,6,7,8,9,10,11}-demo.md`, `docs/sprint-2-handoff.md`, `docs/DEMO-SCRIPT.md`, `docs/getting-started.md` (superseded by `docs/operator-walkthrough.md`), `docs/auth.md`, `docs/evals.md`, `docs/workflows.md`, `docs/test-and-guardrail-model.md`, `docs/customize-your-team.md`, `docs/extending/` (5 guides).

### Changed

- `README.md` — capability table, architecture diagram, evals section, and documentation index rewritten for the package-first reality; historical CUAD receipt retained.
- `docs/announcement.md` — getting-started link now points at `docs/operator-walkthrough.md`.
- `CLAUDE.md` — Stack / Commands / Code Map rewritten for the package + launcher layout.

### Fixed

- `bin/possiblaw` — `yaml_to_json` resolved `js-yaml` from the repo's top-level `node_modules` (a dependency of the deleted CLI runtime), so it would break on any clone that never ran the old `pnpm install`. It now resolves js-yaml inside paperclip's pnpm store and fails with a clear `pnpm -C paperclip install` hint when absent.

### Kept deliberately

- `layer/` — unconverted source material (eval datasets + scorer concepts, workflow shapes, agent prompts). Converts into the package incrementally; delete only after conversion completes.

---

## [0.3.0] — 2026-05-23 — Branded one-command onboarding + multi-variant package

### Added

- `bin/possiblaw` — branded one-command launcher. Prompts for variant / org name / mission, runs `paperclipai onboard --yes` in the background, builds and POSTs the company import body directly to `/api/companies/import` (so the full `adapterOverrides` schema is available — model, reasoning effort, timeout per agent), PATCHes the mission as company description, and opens the dashboard URL. Replaces the older `bin/possiblaw-launch`.
- `companies/legal-operations/variants.yaml` — variant matrix for `codex` / `claude` / `ollama`. Pivots on each agent's `metadata.possiblaw.modelLane` so new agents inherit the right adapter config automatically.
- `bin/_possiblaw_variants.py` and `bin/_possiblaw_inline_source.py` — pure Python (stdlib-only) helpers with `--self-test` modes. The bash launcher converts YAML → JSON via paperclip's bundled `js-yaml`, then feeds JSON to these helpers to build the import body.
- `companies/legal-operations/skills/privacy-encoder/SKILL.md` — Ollama health check at the top of "When To Invoke". Confidential/privileged matters now BLOCK at runtime if Ollama isn't reachable, with install hints in the comment.
- `bin/possiblaw` preflight — scans the package for matters with `privacyTier: confidential|privileged` and warns (non-blocking) if Ollama is not running at launch time.
- `companies/legal-operations/evals/` — README documenting the eval convention (routine → eval-runner skill → judge agent → `eval-results` project) and a `cases/.gitkeep` placeholder.
- `companies/legal-operations/projects/eval-results/PROJECT.md` + `.paperclip.yaml` entry — placeholder project, lead = chief-of-staff until the eval-judge agent ships.
- `docs/known-limitations.md` — importer non-atomicity, sidebar jank at scale, Ollama variant quality caveat, hybrid-variant deferral.

### Changed

- `docs/operator-walkthrough.md` — rewritten for the one-command launcher flow. Adds per-variant setup (codex / claude / ollama + OpenCode global config example) and the Ollama+OpenCode prerequisite section.
- `README.md` — "Current Direction" quickstart now points at `./bin/possiblaw`.

### Removed

- `bin/possiblaw-launch` — the v1 launcher. The new `bin/possiblaw` replaces it with variant support, direct HTTP POST (so `adapterOverrides.adapterConfig` is no longer stripped), and a cleaner single-entrypoint UX. Same preflight + health-poll + signal-trap machinery, lifted in.

### Validation

End-to-end dry-run smoke (`codex` variant) against a fresh data dir: `agents=11 skills=38 projects=3 issues=3 warnings=0 errors=0` in ~18 seconds. Live runs for `claude` and `ollama` variants are operator-side validation (covered in the operator walkthrough).

---

## [0.2.0] — 2026-05-21 — Sprint 11: Subscription-auth providers

### Added

- `claude-cli/*` and `codex-cli/*` providers — route LLM calls through local Claude Code / Codex CLI subscriptions instead of API keys.
- `--provider <name>` flag on `possiblaw run` and `possiblaw eval` — uniform provider override per run (`anthropic | claude-cli | codex-cli | ollama`).
- `--model <name>` flag — override the per-provider default model for a single run (defaults: `claude-sonnet-4-6` / `sonnet` / `gpt-5.5` / `llama3.1:8b`).
- `--max-budget-usd` automatically forwarded to `claude -p` when running evals with `--provider claude-cli --budget <n>`.
- `docs/auth.md` — provider comparison and choice guide.
- `docs/sprint-11-demo.md` — same NDA prompt run four ways.

### Changed

- Subscription provider rows in the cost report show the literal string `subscription` instead of `$0.0000`, so subscription billing is visually distinct from truly free local/offline runs.
- Privacy Filter cloud-mode now covers `claude-cli/*` and `codex-cli/*` in addition to `anthropic/*`. `ollama/*` remains local-only and is not masked.
- LLM-judge tests route through the provider registry so soft tests respect `--provider` (no longer hard-coded to the Anthropic SDK).

### Fixed

- `team set-model` model-string regex extended to accept `claude-cli/*` and `codex-cli/*` provider prefixes.

### Internal

- `cli/anthropic.ts` reduced to a thin shim that re-exports from the new `cli/llm.ts` provider registry. `cli/llm.ts` is now the single dispatch point for all four providers.
- Commit map: `1f63fa7` (llm.ts providers) → `0118bf3` (--provider / --model flags) → `abdfbae` (LLM-judge tests routed through provider registry).

---

## [Unreleased]

### Governance — PossibLaw Agent Starter Pack adoption (2026-05-21)

- Bootstrapped the official PossibLaw Agent Starter Pack contracts via `scripts/bootstrap-project.sh --preserve-progress`.
- **New tracked files:**
  - `AGENTS.md` — Codex project instruction file with full startup contract + routing + contract pipeline rules
  - `CLAUDE.md` — replaced the session-written stub with the canonical scaffold; filled in Repo Root, project description, Stack, Code Map sections with PossibLaw specifics
  - `docs/roles/{product-strategist,engineering-planner,reviewer,security-reviewer,qa-validator,docs-releaser,README}.md` — canonical role contracts
  - `docs/workflows/{contracts,evals,wiki,graphify}.md` — typed PLAN→TEST→REVIEW→HANDOFF contract + evals + optional wiki/graphify modes
  - `docs/vendor/{README,supabase}.md` — vendor reference contract (Supabase is the canonical example; not used by PossibLaw but the example pattern is the canonical one)
  - `docs/glossary.md` — shared term definitions
  - `.agent/{CONTEXT,TASKS,REVIEW,TEST,WIKI,LEARNINGS}.md` — scaffolded contract artifacts (LOCAL-only per Starter Pack convention; tracked here for the v0.1.0 baseline)
  - `.agent/integrations/{run-checkpoint.sh,run-checkpoint.ps1,mempalace-ingest.sh,mempalace-ingest.ps1,README.md}` — optional continuity-checkpoint helpers
  - `.claude/skills/{closing-sprint-and-syncing-state,running-novice-safe-git-cycle}/SKILL.md` — repo-local workflow skills
- **`.gitignore`** updated by the bootstrap to mark `.agent/PLAN.md`, `.agent/HANDOFF.md`, `.claude/history.md`, and the new scaffolds as local-only going forward.
- **`.agent/PLAN.md`, `.agent/HANDOFF.md`, `.claude/history.md`** preserved (real Sprint 0–10 + Sprint 11 content); HANDOFF carries a note that they remain tracked despite the new convention because the next coding agent needs them.

---

## [0.1.0] — 2026-05-21 — Public launch readiness (Sprint 10)

### Sprint 10 — Public launch readiness

- **`README.md`** — Rewritten announcement-quality (≤260 lines): hero section with disclaimer in lead, "Try it in 5 minutes" with expected output, capabilities table, ASCII architecture diagram, What's NOT in this PoC, posture, evals placeholder, full docs index, license, acknowledgements. Shields.io badges added.
- **`SECURITY.md`** — New. PoC-realistic security posture: supported versions, reporting via GitHub Security Advisory, in-scope and out-of-scope, 7 known threats (Privacy Filter offline fallback, cloud call without filter, key store plain-text, audit log writability, connector credentials in env, UNCONFIRMED connector schemas, key store no expiry).
- **`.github/ISSUE_TEMPLATE/bug_report.md`** — New. Structured bug report: what happened, expected, repro, env table, audit log path, screenshots.
- **`.github/ISSUE_TEMPLATE/feature_request.md`** — New. Feature request: what, why, alternatives, willingness to PR.
- **`.github/ISSUE_TEMPLATE/connector_request.md`** — New. Connector request: service, API docs, auth flow, capabilities, sandbox availability.
- **`.github/ISSUE_TEMPLATE/config.yml`** — New. Contact links: Discussions + Security Advisory. Disables blank issues.
- **`docs/getting-started.md`** — New. Stranger-friendly Quickstart ~150 lines: prerequisites, install, first workflow, API key, switch templates, customize, connectors, Privacy Filter, cost reporting, what now.
- **`docs/extending/add-a-specialist.md`** — New. Step-by-step guide: create agent file, frontmatter reference, add to template, add offline fixture, verify. Ends with `team list | grep <new-specialist>`.
- **`docs/extending/add-a-workflow.md`** — New. Step-by-step guide: all 7 step kinds, 3 YAML patterns (minimal, parallel, debate), YAML validation, build + verify. Ends with `workflows show <new>`.
- **`docs/extending/add-a-test.md`** — New. Step-by-step guide: soft vs hard distinction, LLM-judge and rule types, frontmatter reference, calibration, add to workflow, verify.
- **`docs/extending/add-a-guardrail.md`** — New. Step-by-step guide: hard guardrail vs soft test when-to-use table, rule and LLM-judge types, frontmatter reference, add to workflow, verify.
- **`docs/extending/add-an-mcp-connector.md`** — New. Step-by-step guide: 3 patterns (SDK, HTTP-only, OAuth), full copy-paste TypeScript for SDK and HTTP patterns, register in index, YAML descriptor, `.env.example`, wire to agent, verify.
- **`docs/outreach/outside-operator.md`** — New. 200-word email template for outside operator ask: PoC disclaimer, Privacy Filter, cost transparency, audit trail.
- **`docs/outreach/outside-reviewer.md`** — New. 200-word email template for outside dev reviewer ask: specific extending-docs task, time estimate, acknowledgements.
- **`docs/announcement.md`** — New. 300-word launch post drafts for Hacker News and LinkedIn.
- **`docs/getting-started.md`** (Sprint 10 Quickstart) — verified in fresh-clone simulation (Step 9).
- **`docs/sprint-10-demo.md`** — New. Fresh-clone simulation walkthrough and results.
- **`package.json`** — Version bumped `0.0.1 → 0.1.0`. Added `keywords`, `repository`, `homepage`, `bugs` fields.
- **`CONTRIBUTING.md`** — Updated clone URL from placeholder `<repo-url>` to canonical GitHub URL; corrected `cd possiblaw-v2` to `cd possiblaw`.

## [Unreleased]

### Sprint 9 — Eval suite (CUAD, MAUD, ACORD, UNFAIR-ToS, LEDGAR)

- **`layer/evals/datasets/cuad/fetch.ts`** — HF `theatticusproject/cuad-qa` fetch script. Idempotent. `--limit N` flag. Writes `cache/samples.jsonl` + updates `METADATA.json` timestamp. Exports `loadSamples()` / `isCached()`. Falls back to bundled `fixtures.jsonl`.
- **`layer/evals/datasets/maud/fetch.ts`** — HF `theatticusproject/maud` fetch script. Same interface.
- **`layer/evals/datasets/acord/fetch.ts`** — Synthetic ACORD-schema samples (research use; no real ACORD form content). 3 hand-curated samples for ACORD 25/27 field extraction. Falls back to in-memory defaults when cache absent.
- **`layer/evals/datasets/unfair-tos/fetch.ts`** — HF `lex_glue/unfair_tos` fetch script. CC BY 4.0.
- **`layer/evals/datasets/ledgar/fetch.ts`** — HF `lex_glue/ledgar` fetch script. CC BY 4.0.
- **`layer/evals/datasets/<name>/METADATA.json`** — License, citation, source URL, paper URL recorded for all 5 datasets.
- **`layer/evals/datasets/cuad/fixtures.jsonl`** — 3 hand-curated CUAD samples (Governing Law, Termination For Convenience, Agreement Term) for offline / CI use.
- **`cli/eval-scorers.ts`** — Per-dataset scoring functions: `scoreCuad` (word-level F1 over spans), `scoreMaud` (substring exact-match), `scoreUnfairTos` (binary keyword classifier), `scoreLedgar` (substring topic match), `scoreAcord` (per-field presence match). `buildConfusionMatrix()` helper.
- **`cli/eval-adapters.ts`** — Per-dataset matter-prompt adapters: `adaptCuad`, `adaptMaud`, `adaptAcord`, `adaptUnfairTos`, `adaptLedgar`, plus `adaptSample()` dispatcher. `KnownDataset` union type.
- **`cli/eval.ts`** — Main eval harness: `runEval(opts)` loads samples, runs workflow per sample (or stub in dry-run), scores, aggregates (mean/median/std-dev), builds confusion matrix for classification tasks, writes Markdown + JSON reports. Budget abort at 95% utilization (exit code 2). Offline path uses source-tree fixtures with no dynamic import.
- **`cli/index.ts`** — `eval` command fully activated (was placeholder):
  - `eval list-datasets` — 5-row table with cache status and license.
  - `eval fetch <dataset> [--limit N]` — runs fetch script.
  - `eval --dataset --workflow [--sample-size --budget --output --dry-run]` — main run command.
- **`tsconfig.json`** — `include` extended to `layer/evals/datasets/**/*.ts`.
- **`package.json`** — Build script copies `cuad/fixtures.jsonl` to `dist/`; ensures `layer/evals/results/` exists.
- **`.gitignore`** — Dataset cache dirs and `layer/evals/results/` added (with `.gitkeep`).
- **`README.md`** — "Evals" section with placeholder table, dry-run and offline demo commands.
- **`docs/evals.md`** — Full reference: each dataset's license + citation, each adapter's prompt template, each scorer's tolerance, budget mechanism, output format, offline mode.
- **`docs/sprint-9-demo.md`** — Step-by-step walkthrough: list-datasets, dry-run, offline fixture eval, HF fetch, real run, deep-review, exit codes.

### Sprint 8 — Workflow library (Deep Review, Stress Test, Roundtable + per-surface variants + CLI workflow picker)

- **`cli/types.ts`** — Extended `PipelineStep` union with three new step kinds:
  - `parallel: { count, temperatures, resolved_by }` — N-branch parallel specialist dispatch
  - `reconcile: { agent }` — merge N parallel outputs into a single deliverable
  - `debate: { participants, rounds, judge }` — multi-round adversarial exchange + judge verdict
  - New types: `BranchOutput`, `DebateRound`, `BranchRecord`. `RunReport` extended with `branches?: BranchRecord[]`. `RunStepResult` extended with `branchRecord?: BranchRecord`.
- **`cli/anthropic.ts`** — `RunAgentOpts` extended with optional `temperature?: number`; passed to Anthropic API via spread. `offlineFixture()` now handles `reconciler`, `risk-spotter`, and `debate-judge` with realistic multi-paragraph stubs. `marketingLeadRoute()` added: routes to `pitch-polisher` for pitch/polish/deck/proposal prompts, `intake-form-drafter` otherwise.
- **`cli/pipeline.ts`** — Major extension:
  - Refactored Phase 2 into `runOneAgent()` (accepts temperature) + `runSpecialist()` wrapper.
  - New parallel branch: detects `parallel` step, dispatches specialist N times with `Promise.all` and diverse temperatures; collects `BranchOutput[]`.
  - New reconcile branch: formats labeled blocks, calls reconciler agent, sets deliverable.
  - New debate branch: multi-round round-robin; each participant sees all other positions from prior round; judge synthesizes verdict.
  - All `buildReport()` calls updated to pass `branches: branchRecords`.
- **`cli/loader.ts`** — `listWorkflowNames()` helper added (returns sorted list from `layer/workflows/`).
- **`cli/index.ts`** — `workflows` subcommands expanded:
  - `workflows list` — table: name, shape summary, estimated cost for all 9 workflows.
  - `workflows show <name>` — updated to render `parallel`, `reconcile`, `debate` step kinds; uses new `resolveAgentsForCost()` helper that multiplies specialist calls for parallel/debate shapes.
  - `workflows pick` — interactive numbered picker via `readline`; prints name and exits.
- **Meta-agents** (workflow primitives, not domain specialists):
  - `layer/agents/specialists/legal/_meta/reconciler.md` — model `claude-opus-4-7`. Merges N labeled blocks; required `## Reconciliation notes` section.
  - `layer/agents/specialists/legal/_meta/debate-judge.md` — model `claude-opus-4-7`. Verdict + Dissent + Risks structure.
  - `layer/agents/specialists/legal/_meta/risk-spotter.md` — model `claude-sonnet-4-6`. Adversarial worst-case scenarios, missing clauses, ambiguous language.
- **New cross-surface workflows:**
  - `layer/workflows/deep-review.yaml` — router → 3× parallel (temps 0.2/0.7/1.0) → reconcile → tests → guardrails.
  - `layer/workflows/stress-test.yaml` — router → debate(nda-drafter + risk-spotter, 3 rounds, judge: debate-judge) → guardrails.
  - `layer/workflows/roundtable.yaml` — router → debate(nda-drafter + billing-prep + pitch-polisher, 3 rounds, judge: debate-judge) → guardrails.
- **New per-surface variants:**
  - `layer/workflows/quick-pitch-polish.yaml` — chief-of-staff → marketing-lead → pitch-polisher → tests.
  - `layer/workflows/quick-expense-categorize.yaml` — chief-of-staff → finance-lead → expense-categorizer → no tests.
- **Docs:**
  - `docs/workflows.md` (new) — workflow schema reference: all 7 step kinds, meta-agent catalog, workflow catalog, extension guide.
  - `docs/sprint-8-demo.md` (new) — end-to-end demo: all 4 cross-surface workflows on the same NDA prompt, comparison table.
  - `docs/DEMO-SCRIPT.md` — "Workflow library" section appended.

---

### Sprint 7 — Roster customization (team add/remove/rename/export/diff + customize-your-team guide)

- **`cli/template-overrides.ts`** — New module: `.possiblaw/template-overrides.yaml` read/write. `addToTemplateRoster()`, `removeFromTemplateRoster()`, `renameInTemplateOverrides()`, `applyRosterOverrides()`. Schema: `templates.<name>.roster.<section>.add/remove` lists.
- **`cli/loader.ts`** — `loadAgent()` now searches `.possiblaw/custom-agents/` before `layer/agents/` (custom agents shadow layer agents on name collision). `loadTemplate()` applies `applyRosterOverrides()` overlay. `listAgentNames()` merges both directories. New `listCustomAgentNames()` helper.
- **`cli/anthropic.ts`** — `offlineFixture()` fallback returns `[OFFLINE STUB FOR <name>]` for any unrecognized agent (dynamic stub pattern; works for all future custom agents). `commercialLeadRoute()` added for content-based routing to employment/handbook specialists offline.
- **`cli/index.ts`** — New team subcommands:
  - `possiblaw team add specialist <domain/name> --lead <lead> [--template <t>]` — scaffolds `.possiblaw/custom-agents/<name>.md` + patches `template-overrides.yaml`.
  - `possiblaw team add lead <domain/name> --router <router> [--template <t>]` — same pattern for lead agents.
  - `possiblaw team add router <name> [--template <t>]` — same pattern for router agents.
  - `possiblaw team remove <name> [--template <t>]` — removes from roster; preserves custom-agent file; refuses if another agent's `manages` list references the target.
  - `possiblaw team rename <old> <new>` — renames file + frontmatter `name:` + refs in `template-overrides.yaml` and `overrides.yaml`; custom agents only.
  - `possiblaw team list --diff` — shows added/removed vs. base template.
  - `possiblaw team export <template> --output <path>` — full effective snapshot YAML (roster, per-agent frontmatter with overrides applied, custom_agents list, overrides_applied log).
  - `possiblaw team diff <a> <b>` — structured diff: routers/leads/specialists added/removed, per-agent model changes, workflows added/removed.
- **`.possiblaw/custom-agents/employee-handbook-drafter.md`** — Demo custom specialist created via Sprint 7 `team add` workflow; real system prompt filled in (PTO policy focus, US federal defaults, required disclaimer).
- **`.possiblaw/template-overrides.yaml`** — Sprint 7 demo state: `employee-handbook-drafter` added to `small-firm.specialists`.
- **`docs/customize-your-team.md`** — Non-engineer-facing guide: concepts in 30 seconds, 6 common-task recipes with copy-paste CLI examples, full frontmatter cheat-sheet, recovery instructions, what-you-can't-do-yet list.
- **`docs/sprint-7-demo.md`** — End-to-end Sprint 7 demo walkthrough: add specialist, fill in prompt, verify roster, run offline, export, remove.

---

### Sprint 6B — Live adapters for remaining named connectors + v1 inventory

- **Legal enterprise connectors** (paid tier, HTTP-only adapters):
  - `cli/connectors/imanage.ts` — iManage Work API v2. Bearer-token auth (OAuth documented in `imanage.README.md`). Capabilities: `documents.list`, `documents.get`, `documents.put`, `folders.list`. Stand-in: `local-fs-doc-store`.
  - `cli/connectors/netdocuments.ts` — NetDocuments REST API v2. OAuth bearer token. Capabilities: `documents.list`, `documents.get`, `documents.put`, `workspaces.list`. Stand-in: `local-fs-doc-store`.
  - `cli/connectors/westlaw.ts` — Thomson Reuters Westlaw Edge API. UNCONFIRMED: base URL `https://api.westlaw.com/v1/` and request shapes are placeholders; enterprise TR contract required. Capabilities: `cases.search`, `cases.get`, `citations.kbcheck`. Stand-in: `courtlistener`.
  - `cli/connectors/lexis.ts` — LexisNexis API. UNCONFIRMED: base URL `https://api.lexis.com/v1/` and request shapes are placeholders; enterprise LN contract required. Capabilities: `cases.search`, `cases.get`, `citations.shepardize`. Stand-in: `courtlistener`.
- **Business open-access connectors** (official SDKs):
  - `cli/connectors/quickbooks.ts` — QuickBooks Online via `node-quickbooks` SDK. OAuth 1.0a. Free Intuit Developer sandbox. Capabilities: `customers.list`, `invoices.create`, `invoices.list`, `accounts.list`.
  - `cli/connectors/hubspot.ts` — HubSpot CRM via `@hubspot/api-client` SDK. Private app access token. Capabilities: `contacts.list`, `contacts.create`, `companies.list`, `deals.create`.
  - `cli/connectors/notion.ts` — Notion workspace via `@notionhq/client` SDK. Internal integration token. Capabilities: `pages.create`, `pages.update`, `databases.query`, `search`.
  - `cli/connectors/linear.ts` — Linear issue tracker via `@linear/sdk`. Personal API key. Capabilities: `issues.list`, `issues.create`, `teams.list`, `projects.list`.
- **Per-connector READMEs** for non-obvious setups:
  - `cli/connectors/imanage.README.md` — Bearer token + OAuth 2.0 client credentials flow walkthrough.
  - `cli/connectors/westlaw.README.md` — UNCONFIRMED reconciliation checklist for TR enterprise contract holders.
  - `cli/connectors/lexis.README.md` — UNCONFIRMED reconciliation checklist for LN enterprise contract holders.
- **`layer/connectors/<id>.yaml`** — Declarative descriptors for all 8 new connectors.
- **`cli/connectors/index.ts`** — Updated to import all 8 new connector modules (14 total registered).
- **`package.json`** — Added `@hubspot/api-client ^11`, `@linear/sdk ^29`, `@notionhq/client ^2`, `node-quickbooks ^2` (dependencies); `@types/node-quickbooks ^2` (devDependencies).
- **`.env.example`** — New grouped sections for all 8 connectors; all marked NOT REQUIRED for offline demo.
- **Agent wiring** (connector declarations only; runtime dispatch is Sprint 7):
  - `pitch-polisher` — Added `connectors: [hubspot, notion]`.
  - `intake-form-drafter` — Added `connectors: [hubspot, notion]`.
  - `billing-prep` — Extended from `[stripe]` to `[stripe, quickbooks]`.
  - `calendar-coordinator` — Added `connectors: []` with comment noting Google Workspace / M365 are deferred to Sprint 6B+ (see `docs/connectors-inventory.md`).
- **`docs/connectors-inventory.md`** — v1 connector inventory: 14 live connectors (3 stand-ins + 11 live) listed in full, plus 14 deferred v1 targets documented (Clio, MyCase, Rocket Matter, Filevine, Smokeball, Tabs3, Litera, Kira, Relativity, Slack, Zoom, Google Workspace, Microsoft 365, Salesforce, Zapier) with name, category, API surface, status, and stand-in equivalents.
- **`docs/sprint-6-demo.md`** — Sprint 6B walkthrough added: updated architecture diagram, 5 new demo commands, UNCONFIRMED connector guidance, and connector inventory reference.
- **`docs/DEMO-SCRIPT.md`** — Sprint 6 section updated to reflect 14-connector total.

---

### Sprint 6A — Connector framework + open-access stand-ins + 3 reference live connectors

- **`cli/connectors/types.ts`** — `ConnectorMetadata`, `ConnectorClient`, `ConnectorFactory`, `HealthcheckResult` interfaces. Every connector implements `ConnectorClient`.
- **`cli/connectors/registry.ts`** — `registerConnector()`, `getConnector()`, `listConnectors()`, `listConfigured()`. Self-registration pattern: each module calls `registerConnector` at load time.
- **`cli/connectors/index.ts`** — Connector loader: imports all 6 connector modules (triggering registration) and re-exports registry helpers.
- **Open-access stand-ins** (no credentials required, always work):
  - `cli/connectors/local-fs-doc-store.ts` — iManage / NetDocuments stand-in. Reads/writes `layer/connectors/local-docs/`. Capabilities: `documents.list`, `documents.get`, `documents.put`.
  - `cli/connectors/no-op-signature.ts` — DocuSign stand-in. Writes JSON to `layer/connectors/local-signatures/<uuid>.json`. Capabilities: `signature.request`, `signature.status`.
  - `cli/connectors/courtlistener.ts` — Westlaw / Lexis stand-in. CourtListener free public API (`/search/` endpoint). Capabilities: `cases.search`, `cases.get`.
- **Reference live connectors** (demonstrate the 3 SDK patterns Sprint 6B will replicate):
  - `cli/connectors/stripe.ts` — official SDK pattern. `stripe` npm package. Env: `STRIPE_API_KEY`. Capabilities: `customers.list`, `customers.create`, `invoices.create`, `payment_links.create`.
  - `cli/connectors/midpage.ts` — HTTP-only pattern. Plain `fetch` with Bearer token. Env: `MIDPAGE_API_KEY`. UNCONFIRMED schema — see `cli/connectors/midpage.README.md`.
  - `cli/connectors/docusign.ts` — OAuth-ish enterprise pattern. `docusign-esign` npm package. JWT auth flow. Env: `DOCUSIGN_INTEGRATION_KEY`, `DOCUSIGN_USER_ID`, `DOCUSIGN_ACCOUNT_ID`, `DOCUSIGN_PRIVATE_KEY_PATH`, `DOCUSIGN_BASE_PATH`. Capabilities: `envelopes.create`, `envelopes.status`.
- **`layer/connectors/<id>.yaml`** — Declarative descriptors for all 6 connectors.
- **`cli/types.ts`** — `Agent` extended with `connectors: string[]` field.
- **`cli/loader.ts`** — `loadAgent()` maps `fm['connectors']` to the new field.
- **`layer/agents/specialists/finance/billing/billing-prep.md`** — Added `connectors: [stripe]`.
- **`layer/agents/specialists/legal/commercial/nda-drafter.md`** — Added `connectors: [local-fs-doc-store]`.
- **`cli/index.ts`** — New command group: `possiblaw connectors list / check <id> / capabilities <id>`.
- **`.env.example`** — Created with grouped env vars for all 3 live connectors. Stand-ins need no env vars.
- **`package.json`** — Added `stripe ^17`, `docusign-esign ^6`, `@types/docusign-esign ^5`.
- **`docs/DEMO-SCRIPT.md`** — Sprint 6A connectors section appended.
- **`docs/sprint-6-demo.md`** — Full Sprint 6 walkthrough scaffold (6A complete; 6B roadmap).

---

### Sprint 5 — Per-agent model overrides + cost transparency

- **`cli/overrides.ts`** — Per-operator model overrides. Reads `.possiblaw/overrides.yaml` (repo-local, gitignored); falls back to `~/.possiblaw/overrides.yaml`. `loadOverrides()`, `getEffectiveModel()`, `writeOverride()`.
- **`cli/loader.ts`** — `loadAgent()` now calls `getEffectiveModel()` and logs any override applied to stderr. New `listAgentNames()` helper for CLI validation.
- **`cli/pricing.ts`** — Token pricing module. Snapshot: 2026-05-20. `costForCall()`, `estimateWorkflowCost()`, `formatCost()`. Prices: Opus 4.7 $15/$75, Sonnet 4.6 $3/$15, Haiku 4.5 $0.80/$4.00 per 1M tokens. `ollama/*` and offline runs are $0.
- **`cli/anthropic.ts`** — Now routes to `cli/ollama.ts` for `ollama/<model>` provider. Falls back to offline fixtures if Ollama is unreachable. Existing `anthropic/` and bare model names are unchanged.
- **`cli/ollama.ts`** — `chat()` now accepts optional `model` parameter to override `OLLAMA_MODEL` env default.
- **`cli/pipeline.ts`** — `buildReport()` calls `computeCost()` to compute `CostBreakdown` from step records. Phases: routing / specialist / tests / guardrails.
- **`cli/printer.ts`** — `printReport()` calls `printCostReport()` after each run. Offline runs show `(offline — model costs not incurred)`.
- **`cli/types.ts`** — `RunReport` extended with optional `cost: CostBreakdown`.
- **`cli/index.ts`** — New commands:
  - `possiblaw workflows show <name>` — pipeline shape + resolved agents + estimated typical cost.
  - `possiblaw team set-model <agent> <provider/model>` — writes override; validates agent + model format.
  - `possiblaw team show-model <agent>` — prints effective model after overrides.
- **`layer/agents/specialists/finance/billing/expense-categorizer.md`** — `model` changed to `ollama/llama3.1:8b`; `fallback_model` set to `anthropic/claude-haiku-4-5`.
- **`.gitignore`** — `.possiblaw/` added.
- **`docs/DEMO-SCRIPT.md`** — "Cost transparency" section added.
- **`docs/sprint-5-demo.md`** — Detailed Sprint 5 demo walkthrough.

---

### Sprint 4 — Privacy Filter (encoder-decoder via local LLM with reversible entity substitution)

- **`cli/ollama.ts`** — Thin Ollama HTTP client using built-in `fetch`. `isOllamaAvailable()` pings `/api/version`; `chat()` streams `/api/chat` NDJSON and assembles full response. Configurable via `OLLAMA_HOST` and `OLLAMA_MODEL` env vars (default: `http://localhost:11434`, `llama3.1:8b`). Clear error messages distinguish "not installed" from "not running".
- **`cli/privacy-filter.ts`** — Encoder + Decoder + KeyStore module.
  - `encode(text, matterId, opts?)` — loads key store, applies alias hints, calls Ollama encoder (with offline-fallback to rule-based regex encoder when Ollama is unreachable). Returns `MaskedPayload` with `masked_text`, `key_store`, and `mode` tag.
  - `decode(text, keyStore)` — deterministic find-and-replace (fast path) + optional Ollama cleanup pass for LLM-introduced token variants. Pre-delivery scan throws `PrivacyFilterError` if any `«ENT_` prefix leaks.
  - `loadKeyStore(matterId)` / `saveKeyStore(matterId, store)` — per-matter persistence at `layer/privacy-filter/keys/<matter-id>.json`.
  - Rule-based offline encoder: regex patterns for EIN, SSN, MONEY, EMAIL, PHONE, ORG, ADDRESS.
  - `PrivacyFilterError` class for hard pre-delivery failures.
- **`cli/pipeline.ts`** — Privacy filter wired in before/after specialist call. `shouldApplyPrivacyFilter()` checks profile + model. Encode/decode steps logged to audit. `PipelineOpts` extended with `privacyProfile` and `matterTag`.
- **`cli/types.ts`** — `RunContext` extended with `privacyProfile` and `matterTag`; `GuardrailRuleConfig` extended with `privacy-profile-check` kind.
- **`cli/guardrail-runner.ts`** — New `runPrivacyProfileCheck()` handler for rule kind `privacy-profile-check`.
- **`cli/index.ts`** — `--privacy-profile <always|cloud-only|off>` and `--matter-tag <tag>` flags on `run` command; new `possiblaw privacy show <matter-id>` subcommand.
- **`layer/guardrails/risk-gates/privacy-filter-required.yaml`** — Escalates when active profile is `off` for matters tagged `sensitive`, `privileged`, or `client-confidential`.
- **`layer/workflows/quick-counsel.yaml`** — `privacy-filter-required` added to guardrail suite (runs before `signed-document`).
- **`layer/privacy-filter/adversarial-tests/`** — 8 JSON adversarial test cases covering: detector miss, entity ambiguity, rehydration failure, key-store concurrency, profile misconfiguration, token variant normalization, unknown token passthrough, offline NDA demo.
- **`docs/privacy-filter.md`** — Threat model: 5 failure modes, detection methods, recovery steps, token format reference, adversarial test index.
- **`docs/sprint-4-demo.md`** — End-to-end demo walkthrough: offline mode, live Ollama + Anthropic mode, failure path.
- **`docs/DEMO-SCRIPT.md`** — "Privacy Filter walkthrough" section appended pointing to `docs/sprint-4-demo.md`.

---

### Sprint 3 — Non-legal surfaces (Marketing, Finance, Admin)

- **3 new Leads** (all `reports_to: chief-of-staff`):
  - `layer/agents/leads/marketing/marketing-lead.md` — manages `intake-form-drafter`, `pitch-polisher`; model `claude-sonnet-4-6`.
  - `layer/agents/leads/finance/finance-lead.md` — manages `billing-prep`, `expense-categorizer`; model `claude-sonnet-4-6`.
  - `layer/agents/leads/admin/admin-lead.md` — manages `calendar-coordinator`; model `claude-sonnet-4-6`.
- **5 new Specialists**:
  - `intake-form-drafter` — produces ~30-field intake form spec (marketing); model `claude-sonnet-4-6`.
  - `pitch-polisher` — before/after pitch polish with change notes; model `claude-sonnet-4-6`.
  - `billing-prep` — draft invoice with line items, rates, totals, signature block; model `claude-sonnet-4-6`; `guardrails: [signed-document]`.
  - `expense-categorizer` — JSON output with category + deductibility; model `claude-haiku-4-5` (categorization tier per plan §7.1; Sprint 5 swaps to local Ollama).
  - `calendar-coordinator` — proposes ≤3 time slots in a markdown table; model `claude-sonnet-4-6`.
- **5 new Skills**: `intake-form-playbook`, `pitch-polish-playbook`, `billing-playbook`, `expense-categorization-playbook`, `calendar-coordination-playbook`.
- **2 new Workflows**: `quick-invoice-review` (router: chief-of-staff, guardrail: signed-document), `quick-intake-reply` (router: chief-of-staff, no guardrail).
- **New starter template**: `small-firm` (2 routers + 4 leads + 6 specialists, 3 workflows).
- **Offline fixtures** for all 5 new specialists; `chief-of-staff` OFFLINE routing updated to dispatch marketing/finance/admin by prompt-content analysis.
- **Chief of Staff** updated: `manages` extended to include the 3 new Leads; routing table updated for Sprint 3 domain coverage.
- **Printer** (`cli/printer.ts`): `printTeamList` now shows domain color tags (magenta = marketing, blue = finance, yellow = admin) for non-legal agents.
- **Build script** fixed: `package.json` build now uses `cp cli/fixtures/* dist/cli/fixtures/` to avoid nested `fixtures/fixtures/` on incremental builds.
- **`docs/DEMO-SCRIPT.md`**: added "Multi-surface day (small-firm template)" walkthrough (Demo 4) with three commands covering team list, marketing intake-reply, and finance invoice-review.

---

### Sprint 1b — Architecture decisions + Chief of Staff prototype

- **Chief of Staff agent** (`layer/agents/chief-of-staff.md`): top-level domain router (`manages: [chief-counsel]`, model `anthropic/claude-opus-4-7`). Routes legal matters to `chief-counsel`; all other domains escalate to `human-escalation` until Sprint 3.
- **`quick-counsel-with-cos` workflow** (`layer/workflows/quick-counsel-with-cos.yaml`): opt-in prototype identical to `quick-counsel` except `router: chief-of-staff` (3-hop chain: cos → chief-counsel → commercial-lead → specialist). `quick-counsel.yaml` remains the canonical workflow.
- **`docs/ARCHITECTURE.md`**: two locked decisions — (1) defer Chief of Staff to Sprint 3 (zero routing value at 1-domain scale, +$0.011/run overhead); (2) lock model-field schema as plain string `provider/name` per plan §11.2. Includes decision log table and forthcoming-decisions placeholders cross-referencing resolving sprints.
- **`docs/sprint-2-handoff.md`**: typed interface contracts for Sprint 2 — test-runner (input/output/failure-hook), guardrail-runner (input/output/escalation-hook), failure-handling hooks (`retry_with`, `escalate_to`, `route_to`), audit-log JSONL shape, breaking changes (RunReport additions, MAX_HOPS fix, call sites in `cli/pipeline.ts` and `cli/printer.ts`), and stubs to replace.

---

## [0.0.1] - 2026-05-20

Initial release: Sprint 0 + Sprint 1a per plan §9.

### Sprint 0 — Foundation

- Repo scaffolding: full directory tree (`layer/`, `bin/`, `cli/`, `plugins/`, `docs/`, `.github/`)
- Apache 2.0 license (`LICENSE`, `NOTICE`) with paperclip MIT preserved
- paperclip wired as git submodule at `paperclip/` (pinned SHA recorded in `FOUNDATION.md`)
- `package.json` with `commander`, `js-yaml`, `gray-matter`, `@anthropic-ai/sdk` deps
- `tsconfig.json` strict TypeScript / NodeNext / ES2022
- `bin/possiblaw` executable shim (prod) and `bin/possiblaw.dev` (tsx dev mode)
- Lean CI workflow (`.github/workflows/ci.yml`): typecheck + lint + test on PR and push to main. No release steps.
- `FOUNDATION.md` with extension-point inventory and Sprint 1a stub integration notes
- `CONTRIBUTING.md`, `CHANGELOG.md`, `README.md`
- `.editorconfig`, `.npmrc`, `.gitignore`

### Sprint 1a — Minimal vertical slice (stubs)

- **Agents**: `chief-counsel` (router, claude-opus-4-7), `commercial-lead` (lead, claude-sonnet-4-6), `nda-drafter` (specialist, claude-sonnet-4-6)
- **Skills**: `matter-intake`, `conflicts-check`, `nda-playbook` (16-point drafting playbook)
- **Workflow**: `quick-counsel` (router → lead → specialist → test → guardrail)
- **Starter template**: `solo-lawyer`
- **Stub test**: `groundedness` (deterministic pass; real implementation deferred to Sprint 2)
- **Stub guardrail**: `signed-document` (deterministic block + escalation; real implementation deferred to Sprint 2)
- **CLI runtime** (`cli/`): commander-based with `run`, `team list`, `eval`, `--version`. Offline mode (no API key) uses deterministic fixtures so the demo runs without credentials.
- **`docs/DEMO-SCRIPT.md`**: end-to-end walkthrough for both offline and live modes.

### Notes

This release supersedes v1. Decision recorded in plan §11. v1 GitHub repo deletion is the operator's call; this build is on disk at `/Users/salvadorcarranza/possiblaw-v2/` and does not touch any other directory or remote.
