# PossibLaw

**Operating a legal business with AI — a proof-of-concept Agent Companies package for [paperclip](https://github.com/paperclipai/paperclip).**

> **Regulated-work note:** The practice of law is regulated. To the extent an operator is practicing law with PossibLaw, the operator needs to involve a lawyer. PossibLaw is open-source tooling, not a legal-services provider.

PossibLaw shows how legal-business agents, skills, projects, and starter matters can be packaged as a *layer* on top of paperclip, not a fork. The active implementation lives under `companies/legal-operations/`; the older `layer/` content remains historical source material for conversion. The upstream paperclip control plane is wired as a git submodule and is never modified.

[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](LICENSE)
[![PoC](https://img.shields.io/badge/status-proof--of--concept-orange.svg)](#whats-not-in-this-poc)
[![Node](https://img.shields.io/badge/node-%3E%3D20-brightgreen.svg)](https://nodejs.org)
[![paperclip layer](https://img.shields.io/badge/paperclip-layer%2C%20not%20a%20fork-lightgrey.svg)](FOUNDATION.md)

---

## Current Direction

Sprints 0-11 produced a standalone CLI runtime. That proved the content, but it duplicated Paperclip features that should stay in Paperclip: orchestration, UI, auth, audit trail, approvals, budgets, adapters, and task state.

The active path is now the Paperclip-native package under `companies/legal-operations/`. The branded one-command launcher is the only entrypoint operators need:

```bash
git clone https://github.com/PossibLaw/possiblaw && cd possiblaw
git submodule update --init --recursive
pnpm -C paperclip install
./bin/possiblaw
# answer three prompts (org name, mission, variant)
# → browser opens to your Paperclip dashboard, 36 agents already loaded
```

The launcher picks the model-provider variant at import time. Eight are shipped:

| Variant | Provider | When |
|---|---|---|
| `codex`      | Codex CLI subscription   | Default; works out of the box once `codex login` is done |
| `codex-api`  | Codex CLI + OpenAI API key | When the subscription tier rejects models; key stored as an encrypted paperclip secret |
| `claude`     | Claude CLI subscription  | If you prefer Anthropic models for legal work |
| `claude-api` | Claude CLI + Anthropic API key | Same as `claude`, billed against the API with the full model catalog |
| `ollama`     | Local Llama via OpenCode | Fully local — confidential matters, no cloud round-trips |
| `llamacpp`   | Local HF GGUF via llama.cpp + OpenCode | Fully local without the Ollama client — bring any GGUF |
| `opencode`   | OpenCode Zen gateway (`OPENCODE_API_KEY`) | One key for OpenCode's curated catalog, no vendor logins |
| `openrouter` | OpenRouter (`OPENROUTER_API_KEY`) | One key for the multi-vendor cloud catalog |
| `gemini`     | Gemini CLI subscription  | Google models via the gemini CLI's OAuth login |
| `gemini-api` | Gemini CLI + Gemini API key | Same as `gemini`, billed against the API (`GEMINI_API_KEY`) |

Live launches preflight-probe each lane model with a tiny CLI request (and
check OpenRouter pins against its public catalog), so "you don't have access
to this model" surfaces before import, not mid-matter (`--skip-model-probe`
to bypass).

Add `--variant <slug>` to skip the interactive prompt, or `--list-variants` to see them. Full walkthrough: [docs/operator-walkthrough.md](docs/operator-walkthrough.md); package layout: [docs/paperclip-package.md](docs/paperclip-package.md); sharp edges: [docs/known-limitations.md](docs/known-limitations.md).

## What's in here

| Capability | Detail |
|---|---|
| **Org chart** | Chief of Staff + Chief Counsel + 10 leads (commercial, employment, IP, privacy, litigation, corporate, regulatory, finance, marketing, admin) + 24 specialists (incl. a Capability Builder that drafts new skills/agents from repeatable patterns, operator-review gated) — 36 agents total |
| **Skills** | 57: contract review (dispatcher, NDA, SaaS MSA, renewals, OSS compliance, hiring, C&D, IP triage, escalation), practice playbooks and checklists (employment, IP, privacy, litigation, corporate, regulatory), matter intake, conflicts check, missing-info gate, privacy encoder, Slack/Teams notifications, Markdown/DOCX output, capability authoring (skill/agent/plugin), 14 connector descriptors |
| **Projects & tasks** | NDA Matters, Commercial Reviews, Eval Results; starter issues + a recurring renewal scan |
| **Model lanes** | Per-agent `modelLane` metadata (primary / routing / drafting / review / extractive) — variants map each lane to the right model automatically |
| **Variants** | `codex`, `claude`, `gemini`, `ollama`, `llamacpp`, `opencode`, `openrouter` (+ `-api` twins) — selected at import time by the launcher |
| **Privacy posture** | Privacy-encoder skill blocks confidential/privileged matters unless a local model (Ollama or llama.cpp) is reachable |

---

## Architecture in 90 seconds

```
┌─────────────────────────────────────────────────────────┐
│  bin/possiblaw   (one-command launcher: onboard,         │
│                   variant select, package import)        │
├─────────────────────────────────────────────────────────┤
│  companies/legal-operations/   (the PossibLaw package)   │
│  ├── COMPANY.md + .paperclip.yaml + variants.yaml        │
│  ├── agents/    (11 AGENTS.md — org chart + routing)     │
│  ├── skills/    (38 SKILL.md — playbooks, gates,         │
│  │               outputs, notifications, connectors)     │
│  ├── projects/  (NDA matters, commercial reviews,        │
│  │               eval results + starter tasks)           │
│  └── evals/     (eval convention + cases)                │
├─────────────────────────────────────────────────────────┤
│  paperclip/  (git submodule — never modified; owns UI,   │
│               auth, orchestration, budgets, adapters)    │
└─────────────────────────────────────────────────────────┘
```

The standalone CLI runtime from Sprints 0-11 was removed in 0.4.0 — paperclip already provides everything it reimplemented. It remains available in git history (`git log --oneline -- cli/`). The `layer/` directory holds remaining unconverted source material (eval datasets, workflow shapes).

Deep dive: [FOUNDATION.md](FOUNDATION.md) · [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)

---

## What's NOT in this PoC

This is a proof-of-concept. It is explicitly **not**:

- A helm chart, Terraform module, or production-grade deployment system.
- A multi-tenant SaaS platform.
- A fork of paperclip — do not rename or patch paperclip internals.
- Legal advice or a legal-services provider.
- A finished product with SLAs, support contracts, or security guarantees.

From the plan: *"The goal is to show that the routing hierarchy, test layer, guardrail layer, and MCP connector framework can be composed into a coherent legal-business operating layer — not to ship a consumer product."*

---

## Posture

Open, public, Apache 2.0 from day 1. No SLAs. Fork-friendly. Contributions via pull request.

See [CONTRIBUTING.md](CONTRIBUTING.md) for the contribution workflow and [SECURITY.md](SECURITY.md) for the security posture.

---

## Evals

The Paperclip-native eval convention lives at [companies/legal-operations/evals/README.md](companies/legal-operations/evals/README.md): eval cases run as Paperclip issues, a judge agent scores results, and receipts land in the **Eval Results** project. Dataset source material (CUAD, MAUD, ACORD, UNFAIR-ToS, LEDGAR) remains under `layer/evals/`.

Historical receipt from the retired standalone harness (2026-05-21): CUAD × clause-extract × claude-cli/haiku scored mean **0.5788** over 15 samples on subscription auth.

---

## Documentation

| Guide | What it covers |
|---|---|
| [docs/operator-walkthrough.md](docs/operator-walkthrough.md) | Fresh Paperclip instance, package import, and starter NDA demo |
| [docs/paperclip-package.md](docs/paperclip-package.md) | Current Paperclip-native package path and import instructions |
| [docs/known-limitations.md](docs/known-limitations.md) | Sharp edges: importer non-atomicity, sidebar scale, Ollama quality caveat |
| [docs/connectors-inventory.md](docs/connectors-inventory.md) | All 14 connectors + 14 deferred v1 targets |
| [docs/privacy-filter.md](docs/privacy-filter.md) | Threat model, token format, adversarial test index |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Architecture decision log |
| [FOUNDATION.md](FOUNDATION.md) | How the paperclip submodule is wired; extension-point inventory |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Contribution workflow |
| [SECURITY.md](SECURITY.md) | Security posture, reporting, known threats |
| [CHANGELOG.md](CHANGELOG.md) | Sprint-by-sprint change log |

---

## License

PossibLaw is licensed under the **Apache License 2.0**. See [LICENSE](LICENSE).

paperclip's MIT license is preserved in [NOTICE](NOTICE) and in `paperclip/LICENSE`.

---

## Acknowledgements

- **paperclip** — the control-plane runtime this layer runs on.
- **lavern** — design-pattern inspiration for the escalation-as-success framing.
- **Anthropic's 12 practice-area plugins** — reference implementation patterns for legal domain coverage.
- **mike** — skill-extraction pattern (inspiration only; no AGPL code copied).
