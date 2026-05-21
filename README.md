# PossibLaw

**Operating a legal business with AI — a proof-of-concept layer on [paperclip](https://github.com/paperclipai/paperclip).**

> **DISCLAIMER: PossibLaw does not practice law. It is open-source tooling, not a product or a legal-services platform. Non-lawyer operators must consult a licensed attorney before finalizing any work product. Treat all AI output as a first draft.**

PossibLaw shows how to wire AI agents into the day-to-day operations of a small legal practice. It is built as a *layer* on top of paperclip, not a fork. All PossibLaw logic lives under `layer/`; the upstream paperclip control plane is wired as a git submodule and is never modified.

[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](LICENSE)
[![PoC](https://img.shields.io/badge/status-proof--of--concept-orange.svg)](#whats-not-in-this-poc)
[![Node](https://img.shields.io/badge/node-%3E%3D20-brightgreen.svg)](https://nodejs.org)
[![paperclip layer](https://img.shields.io/badge/paperclip-layer%2C%20not%20a%20fork-lightgrey.svg)](FOUNDATION.md)

---

## Try it in 5 minutes

```bash
git clone --recurse-submodules https://github.com/PossibLaw/possiblaw.git
cd possiblaw
pnpm install
pnpm build
bin/possiblaw run quick-counsel "draft an NDA for ACME for a mutual disclosure with a 2-year term"
```

No API key required. The first run uses offline fixtures. Expected output:

```
PossibLaw does not practice law. Treat output as a starting point.
[offline mode — ANTHROPIC_API_KEY not set; using deterministic fixtures]

▶ route:chief-counsel | chief-counsel | claude-opus-4-7 (offline)
    ROUTE_TO: commercial-lead

▶ route:commercial-lead | commercial-lead | claude-sonnet-4-6 (offline)
    ROUTE_TO: nda-drafter

▶ specialist:nda-drafter | nda-drafter | claude-sonnet-4-6 (offline)
    NON-DISCLOSURE AGREEMENT
    This Agreement is entered into as of [DATE] by and between ACME Corp ...
    Term: 2 years from the Effective Date.
    DISCLAIMER: This document was prepared with AI assistance ...

✔ test:groundedness — passed

⚠ guardrail:signed-document — HIT (escalating)

╔══════════════════════════════════════════════════════════╗
║                    ESCALATION CARD                       ║
╚══════════════════════════════════════════════════════════╝
Matter: draft an NDA for ACME for a mutual disclosure with a 2-year term
Guardrail triggered: signed-document
Reason: A licensed reviewing lawyer must approve before any signed document is sent.
```

For the full walkthrough, see [docs/getting-started.md](docs/getting-started.md).

### Choose your provider

PossibLaw supports four LLM providers. The default uses each agent's declared model; override per-run with `--provider`:

```bash
bin/possiblaw run quick-counsel "draft NDA" --provider claude-cli       # subscription via Claude Code
bin/possiblaw run quick-counsel "draft NDA" --provider codex-cli        # subscription via Codex
bin/possiblaw run quick-counsel "draft NDA" --provider anthropic        # ANTHROPIC_API_KEY
bin/possiblaw run quick-counsel "draft NDA" --provider ollama           # local llama3.1:8b
```

See [docs/auth.md](docs/auth.md) for the full guide.

---

## What's in here

| Capability | Detail |
|---|---|
| **Routing hierarchy** | Chief Counsel → Lead → Specialist (legal, marketing, finance, admin) |
| **Specialist agents** | NDA drafter, billing prep, pitch polisher, intake drafter, expense categorizer, calendar coordinator + custom agents |
| **Workflows** | 9 total: quick-counsel, deep-review, stress-test, roundtable, quick-invoice-review, quick-intake-reply, quick-pitch-polish, quick-expense-categorize, quick-counsel-with-cos |
| **Test layer** | Groundedness, scope-adherence — retryable soft tests |
| **Guardrail layer** | signed-document, privacy-filter-required — hard gates that escalate to a human |
| **Privacy Filter** | Reversible entity substitution via local LLM (Ollama) before cloud calls; rule-based fallback when offline |
| **Cost reporting** | Per-agent token cost at run time; offline runs are $0 |
| **MCP connectors** | 14 total: Stripe, DocuSign, iManage, NetDocuments, Westlaw (UNCONFIRMED), LexisNexis (UNCONFIRMED), QuickBooks, HubSpot, Notion, Linear, CourtListener, local-fs-doc-store, no-op-signature, Midpage |
| **Eval datasets** | 5: CUAD, MAUD, ACORD (synthetic), UNFAIR-ToS, LEDGAR; offline fixture sets bundled |
| **Starter templates** | `solo-lawyer` and `small-firm`; fully customizable |
| **CLI** | `possiblaw run`, `team`, `workflows`, `connectors`, `eval`, `privacy` subcommands |

---

## Architecture in 90 seconds

```
┌─────────────────────────────────────────────────────────┐
│  bin/possiblaw  (CLI shim)                               │
│  cli/           (pipeline, router, printer, eval)        │
├─────────────────────────────────────────────────────────┤
│  layer/                                                  │
│  ├── agents/   (chief-counsel, leads, specialists)       │
│  ├── workflows/ (9 YAML pipeline definitions)            │
│  ├── tests/     (groundedness, scope-adherence)          │
│  ├── guardrails/(signed-document, privacy-filter-req'd)  │
│  ├── skills/    (nda-playbook, billing-playbook, …)      │
│  ├── connectors/(14 connector YAML descriptors)          │
│  ├── evals/     (5 dataset adapters + scorers)           │
│  └── privacy-filter/ (key store + adversarial tests)     │
├─────────────────────────────────────────────────────────┤
│  paperclip/  (git submodule — never modified)            │
└─────────────────────────────────────────────────────────┘
```

Deep dive: [FOUNDATION.md](FOUNDATION.md) · [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)

---

## What's NOT in this PoC

This is a proof-of-concept. It is explicitly **not**:

- A helm chart, Terraform module, or production-grade deployment system.
- A multi-tenant SaaS platform.
- A fork of paperclip — do not rename or patch paperclip internals.
- Legal advice — it cannot substitute for a licensed attorney.
- A finished product with SLAs, support contracts, or security guarantees.

From the plan: *"The goal is to show that the routing hierarchy, test layer, guardrail layer, and MCP connector framework can be composed into a coherent legal-business operating layer — not to ship a consumer product."*

---

## Posture

Open, public, Apache 2.0 from day 1. No SLAs. Fork-friendly. Contributions via pull request. The PoC disclaimer is load-bearing — keep it in all forks and derivatives.

See [CONTRIBUTING.md](CONTRIBUTING.md) for the contribution workflow and [SECURITY.md](SECURITY.md) for the security posture.

---

## Evals

PossibLaw's eval harness runs workflows against public legal-NLP datasets and reports a real per-sample score. As of 2026-05-21, here's CUAD running through the `clause-extract` workflow with `claude-cli/haiku` subscription auth:

| Dataset | Workflow | Samples | Mean score | Median | Std dev | Cost | Model |
|---|---|---|---|---|---|---|---|
| CUAD | clause-extract | 15 | 0.5788 | 0.5833 | 0.2105 | subscription | claude-cli/haiku |

Run it yourself:

```bash
bin/possiblaw eval --dataset cuad --workflow clause-extract \
  --sample-size 15 --provider claude-cli --model haiku --budget 5
```

Reproduce or extend in `layer/evals/results/` (JSON + Markdown reports).

See [docs/evals.md](docs/evals.md) for dataset licenses, adapter prompts, scorer tolerances, and budget mechanics.

---

## Documentation

| Guide | What it covers |
|---|---|
| [docs/getting-started.md](docs/getting-started.md) | Stranger-friendly Quickstart — clone to first workflow in 5 minutes |
| [docs/auth.md](docs/auth.md) | Provider comparison — `anthropic` / `claude-cli` / `codex-cli` / `ollama` |
| [docs/customize-your-team.md](docs/customize-your-team.md) | Non-engineer guide to adding/removing/renaming agents |
| [docs/workflows.md](docs/workflows.md) | Workflow schema reference — all 7 step kinds, meta-agents, 9 workflows |
| [docs/connectors-inventory.md](docs/connectors-inventory.md) | All 14 connectors + 14 deferred v1 targets |
| [docs/privacy-filter.md](docs/privacy-filter.md) | Threat model, token format, adversarial test index |
| [docs/evals.md](docs/evals.md) | Dataset licenses, scorers, budget mechanics |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Architecture decision log |
| [docs/DEMO-SCRIPT.md](docs/DEMO-SCRIPT.md) | End-to-end demo walkthrough (all sprints) |
| [docs/extending/](docs/extending/) | Guides for adding specialists, workflows, tests, guardrails, connectors |
| [docs/test-and-guardrail-model.md](docs/test-and-guardrail-model.md) | Test vs. guardrail distinction, failure modes |
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
