# PossibLaw

**A trust pipeline for operating a legal business with AI — built on the [paperclip](https://github.com/paperclipai/paperclip) control plane.**

> **Regulated-work note:** The practice of law is regulated. To the extent an operator is practicing law with PossibLaw, the operator needs to involve a lawyer. PossibLaw is open-source tooling, not a legal-services provider.

[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](LICENSE)
[![PoC](https://img.shields.io/badge/status-proof--of--concept-orange.svg)](#whats-not-in-this-poc)
[![Node](https://img.shields.io/badge/node-%3E%3D20-brightgreen.svg)](https://nodejs.org)
[![paperclip layer](https://img.shields.io/badge/paperclip-layer%2C%20not%20a%20fork-lightgrey.svg)](FOUNDATION.md)

Agents do the legal and business work autonomously. The product is the path that work travels: egress writes cross hard-gated trust boundaries, every gate decision lands in a tamper-evident receipt chain, and humans decide at the boundaries that matter — not on every step. PossibLaw ships this as a *layer* on the paperclip control plane (wired as a pinned git submodule, never modified), not a fork.

## The thesis: atomic units of work

A chat window that drafts a whole contract in one shot gives you one big, opaque output to trust or distrust. PossibLaw is built the other way: **work is decomposed into the smallest reviewable units — one agent, one skill, one gate decision, one receipt — because small units are where control and quality come from.**

- **More control.** You approve at the boundary that matters (a court filing, a signature, a payment), not on every keystroke and not on one monolithic "submit." Each atomic action is independently classified, gated, and logged — so you can allow the routine and stop the consequential.
- **Better work.** A focused agent doing one bounded task (NDA redline, citation check, diligence summary) is easier to make correct, easier to eval, and easier to swap than a generalist doing everything. The 177 agents / 172 skills are atomic on purpose: composable parts, each with its own evals, each replaceable without touching the rest.
- **Provenance per unit.** Because the unit is small, its provenance is legible: this output, citing these authorities, approved by this human, recorded in this receipt. That is exactly the slice a regulator or insurer asks to see.

The catalog is the supporting cast. The atomic pipeline — decompose, gate, receipt — is the product.

## Where this sits in the market

Legal AI is sorting into a data layer (law as an API/MCP with provenance), a guardrails layer (the sign-off, audit trail, and hallucination control a regulator needs once AI did the work), and a firm layer (lawyers running an AI backend). **PossibLaw is the open-source guardrails + firm layer** — the audit trail, human gates, anonymization, and receipts wrapped around an atomic agent catalog — with a provenance-backed legal-data layer in progress (see [`docs/builds/`](docs/builds/)). It competes on being *legible and open* where the rest of the market is opaque and closed.

## The trust pipeline

What a firm actually gets:

- **Hard-gated egress (structural).** Every egress write — email send, document upload, e-signature, payment, court filing, external delete — routes through a loopback Gate Proxy (`gate-proxy/`, default `http://127.0.0.1:3801`). Egress credentials exist **only** in the proxy process; the launcher scrubs them from the agent runtime, so a misbehaving agent's direct vendor call fails for want of credentials. Policy is the firm's to tune, per trust boundary, in [`companies/legal-operations/gate-policy.yaml`](companies/legal-operations/gate-policy.yaml): `allow` is pass-through + receipt; `anonymize` / `human` / `block` are hard gates.
- **Human gates are paperclip-native.** Six boundaries are classified (`THIRD_PARTY_EGRESS`, `CONFIDENTIAL_TO_CLOUD`, `COURT_FILING`, `SIGNATURE`, `MONEY_MOVEMENT`, `IRREVERSIBLE_EXTERNAL_OP`); court filings, signatures, payments, and irreversible external ops default to `human`. The gate opens an approval, the agent stands down, a human decides in the dashboard, and the agent is woken on approve. Approvals are payload-hash-bound — an approval for payload X never authorizes payload Y.
- **Receipts for everything.** Every gate decision — performed, pending, blocked, error — appends to a SHA-256 hash-chained, append-only receipt log. `GET /receipts/verify` checks the chain; `POST /receipts/anchor` writes the chain head into a paperclip comment. Payloads never appear in receipts — only their sha256.
- **The agents are the interchangeable parts.** 177 atomic agents / 172 skills across 34 teams do the work inside the pipeline, with ten model variants that swap providers per lane without touching the package. The catalog is the supporting cast; the pipeline is the product.

## What's enforced vs routed vs advisory

| Surface | Status today | Mechanism |
|---|---|---|
| Egress writes (email, upload, signature, payment, court filing, external delete) | **Enforced — structural** | Gate Proxy holds the only egress credentials; the launcher scrubs them from the server/agent env; per-boundary policy + hash-chained receipts on every path |
| Privacy tier — confidential/privileged payloads sent through the gate | **Enforced at the gate** | Deterministic masker over caller-supplied matter entities + pattern classes, recall measured in the test suite (100% on its labeled fixture; gated at ≥95% with zero entity leaks; fail-closed to block when it cannot vouch, e.g. no entity list) — or routed to a local model when one is configured |
| Privacy tier — agents' own primary-lane model calls | **Routed, not proxied** | A routing choice: local-model variants per lane (`ollama`, `llamacpp` in `variants.yaml`) plus the advisory `privacy-encoder` skill. Primary-lane calls do not pass the proxy. |
| Citation verification | **Enforced at the gate (Phase 2)** | Court/third-party egress **carrying legal citations** is **blocked** until a registered, payload-bound, deterministically re-checked citation verification exists for the document being filed or sent. The `legal-citation-checker` agent executes `citation-verification-checklist` (character-by-character quote-fidelity, side-by-side discrepancy tables), then POSTs the result to `POST /quality/citation`; the gate detects citations in the outbound document and calls `CitationRegistry.has(docSha256)` before any dispatch — including the human gate. A document with no detectable citations has nothing to re-check and passes. Fail-closed: a gated payload with no reviewable document text at all is blocked. Caveat: citation verification itself is an agent step — the gate enforces that it was performed and passed, not that the cited authority is authoritative. |

## Confidentiality, privilege, and cloud models

PossibLaw helps a firm take the **reasonable steps** that Rule 1.6 and ABA Formal Opinion 512 (2024) require when AI touches client matter content:

- **Reversible local masking (`privacy-encoder` skill).** Confidential/PII values are substituted with stable opaque placeholders *before* any cloud-capable model call, the substitution key stays on the operator's local disk, and the output is decoded back to plaintext after the call — so confidential matter text need never reach a cloud model in cleartext.
- **Local-model tier-floor.** Matters tagged `metadata.possiblaw.privacyTier: confidential|privileged` route the sensitive step through a local model lane (`ollama` / `llamacpp`); the launcher warns at startup if no local lane is reachable.
- **Documented data terms, not marketing claims.** We frame this honestly. Sending matter data to a cloud model under genuine enterprise zero-retention / no-train terms **does not, by itself, waive attorney-client privilege** — and conversely, local-only is a confidentiality and risk-reduction choice, *not* a privilege guarantee. PossibLaw is engineered for "reasonable steps to protect confidentiality and privilege," never "privilege-safe." The full legal posture, the confidentiality-vs-privilege distinction, the 2026 case law, and the do/don't marketing language live in [docs/privilege-and-confidentiality.md](docs/privilege-and-confidentiality.md).

Sharp edges are documented, not hidden — see [docs/known-limitations.md](docs/known-limitations.md): `local_trusted` dev instances accept unauthenticated local board calls (the human gate binds agents via credential isolation; production deployments with auth enabled get the structural gate too); the receipt chain assumes a single writer, and same-user tampering is caught only against an externally anchored head; `share_external` writes (HubSpot, Linear, Clio, iManage, NetDocuments) are visibly refused in v1 rather than silently credentialed; Slack/Teams notification webhooks (operator-configured, no matter content) remain direct in v1. Which connector takes which path: [docs/connectors-inventory.md](docs/connectors-inventory.md).

## See the gates work (2 minutes)

```bash
./bin/possiblaw    # one command: paperclip server + package import + gate proxy

# simulate an agent attempting a court filing:
curl -s -X POST http://127.0.0.1:3801/egress/file_court_document \
  -H 'content-type: application/json' \
  -d '{"payload":{"caption":"Acme v. Globex","court":"D. Del."},"meta":{"confidentiality":"standard"}}'
# → 202 pending_approval + an approval in the paperclip dashboard. Approve it
#   there, then re-run the same curl with "approvalId":"<id>" added to meta
#   → 200, action package written to ~/.possiblaw/action-packages/ for a
#   human to execute (no court API is called in v1).

curl -s http://127.0.0.1:3801/receipts/verify
# → {"ok":true,"length":N,"head":"..."} — the tamper-evident trail
```

## Quickstart

```bash
git clone https://github.com/PossibLaw/possiblaw && cd possiblaw
git submodule update --init --recursive
pnpm -C paperclip install
./bin/possiblaw
# answer three prompts (org name, mission, variant)
# → browser opens to your paperclip dashboard, agents loaded, gate proxy running
```

Add `--variant <slug>` to skip the interactive prompt, `--list-variants` to see the options, `--dry-run` to preview without writing. Full walkthrough: [docs/operator-walkthrough.md](docs/operator-walkthrough.md); package layout: [docs/paperclip-package.md](docs/paperclip-package.md); sharp edges: [docs/known-limitations.md](docs/known-limitations.md).

## The catalog (the interchangeable parts)

| Capability | Detail |
|---|---|
| **Org chart** | Chief of Staff + Chief Counsel + 34 leads — 28 legal practices (commercial, employment, IP, privacy, litigation, corporate, regulatory, research, tax, real estate, M&A, banking & finance, securities, restructuring, immigration, healthcare, antitrust, trade compliance, insurance, construction, government contracts, environmental/ESG, trusts & estates, family law, investigations, AI governance, advertising, benefits) and 6 business functions (BD, ops, finance, marketing, admin, legal ops) — + 140 specialists (incl. meta-reviewers — risk-spotter, debate-judge, reconciler — and a Capability Builder, operator-review gated) — **177 agents total**; full roster in [docs/agent-catalog.md](docs/agent-catalog.md) |
| **Skills** | 172: contract drafting and review playbooks (NDA, MSA, SOW, amendments, SaaS, renewals, OSS compliance), per-practice playbooks and checklists across all 28 legal practices, firm-business skills (prebill review, trust accounting, conflicts screening, engagement letters, CLE tracking, client alerts, competitive intel), matter intake, missing-info gate, privacy encoder, Slack/Teams notifications, Markdown/DOCX output, capability authoring, connector descriptors (research, doc stores, e-signature, CRM, billing, practice management, email, drive), **firm-memory** (HOT firm preferences injected at import via `--business`) |
| **Firm learning loop** | `remember this:` comments on issues are sanitized (fail-closed ethical-wall), proposed as Paperclip approval cards, and accumulated in `businesses/<slug>/learnings/`. Approved lessons are injected into the `firm-memory` skill on the next `--business <slug>` launch. **Tier-2 edit-learning:** agents also learn from the lawyer's finalized edits made directly in OneDrive/Google Drive (external-destination capture) — a nightly sweep diffs each delivered file against its delivered draft, distills a sanitized skill-overlay proposal, and surfaces it in the morning digest for yes/no/edit review; approved overlays apply on the next `--business <slug>` launch. Tier-2 SkillOpt (eval-validated automatic refinement) and Box connector remain deferred. |
| **Projects & tasks** | NDA Matters, Commercial Reviews, Eval Results; starter issues + a recurring renewal scan |
| **Model lanes** | Per-agent `modelLane` metadata (primary / routing / drafting / review / extractive) — variants map each lane to the right model automatically |
| **Team subsets** | `--teams litigation,commercial` (or presets `boutique` / `inhouse`) — import only the practices your firm runs; chiefs, meta-reviewers, and the skill closure come along automatically |
| **Demos** | `--demo law-firm` / `inhouse-legal` / `biglaw-practice-group` — synthetic demo matters for a boutique firm, an in-house department, and a BigLaw practice group |
| **Delivery** | `deliverables-courier` files finished work products to your own OneDrive/SharePoint, Google Drive, or Notion per an operator policy file — auto-file or on-request per work-product type, privacy-tier gated, local copy always retained |
| **Theme** | `--theme possiblaw` (default) — light-first dashboard with a warm launch palette; `light` / `dark` also available |

## Model variants

The launcher picks the model-provider variant at import time. Ten are shipped:

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

---

## Architecture in 90 seconds

```
┌─────────────────────────────────────────────────────────┐
│  bin/possiblaw   (one-command launcher: onboard,         │
│                   variant select, package import,        │
│                   egress-credential scrub)               │
├─────────────────────────────────────────────────────────┤
│  gate-proxy/    (loopback egress gate: per-boundary      │
│                  policy, human approvals, anonymizer,    │
│                  hash-chained receipts — holds the ONLY  │
│                  egress credentials)                     │
├─────────────────────────────────────────────────────────┤
│  companies/legal-operations/   (the PossibLaw package)   │
│  ├── COMPANY.md + .paperclip.yaml + variants.yaml        │
│  ├── gate-policy.yaml (per-firm trust-boundary policy)   │
│  ├── agents/    (177 AGENTS.md — org chart + routing)    │
│  ├── skills/    (172 SKILL.md — playbooks, gates,        │
│  │               outputs, notifications, connectors)     │
│  ├── projects/  (NDA matters, commercial reviews,        │
│  │               eval results + starter tasks)           │
│  └── evals/     (eval convention + cases)                │
├─────────────────────────────────────────────────────────┤
│  paperclip/  (git submodule — never modified; owns UI,   │
│               auth, orchestration, budgets, adapters,    │
│               approvals)                                 │
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
| [docs/operator-walkthrough.md](docs/operator-walkthrough.md) | Fresh Paperclip instance, package import, the gate demo, and starter NDA matter |
| [docs/agent-catalog.md](docs/agent-catalog.md) | The full catalog: every team, agent, and skill in the package |
| [docs/paperclip-package.md](docs/paperclip-package.md) | Current Paperclip-native package path and import instructions |
| [docs/known-limitations.md](docs/known-limitations.md) | Sharp edges: gate-proxy trust limits, importer non-atomicity, sidebar scale, Ollama quality caveat |
| [docs/connectors-inventory.md](docs/connectors-inventory.md) | Every connector and which egress path it takes through the gate |
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
