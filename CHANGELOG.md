# Changelog

All notable changes to PossibLaw are documented here.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
Versioning: [SemVer](https://semver.org/).

---

## [Unreleased]

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
