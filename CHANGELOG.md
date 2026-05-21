# Changelog

All notable changes to PossibLaw are documented here.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
Versioning: [SemVer](https://semver.org/).

---

## [Unreleased]

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
