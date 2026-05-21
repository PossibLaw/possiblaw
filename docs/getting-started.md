# Getting Started with PossibLaw

> **DISCLAIMER: PossibLaw does not practice law. Treat all AI output as a starting point for licensed-lawyer review.**

This guide takes you from a fresh clone to running your first workflow in under 5 minutes, then covers switching templates, adding connectors, enabling the Privacy Filter, and checking costs.

---

## 1. Prerequisites

| Requirement | Version | Check |
|---|---|---|
| Node.js | 20 or higher | `node --version` |
| pnpm | any recent | `pnpm --version` |
| git | any recent | `git --version` |

To install Node 20+ via nvm: `nvm install 20 && nvm use 20`.
To install pnpm: `npm install -g pnpm` or `brew install pnpm`.

---

## 2. Install

```bash
git clone --recurse-submodules https://github.com/PossibLaw/possiblaw.git
cd possiblaw
pnpm install
pnpm build
```

If you forgot `--recurse-submodules`:

```bash
git submodule update --init --recursive
pnpm install
pnpm build
```

Verify the build succeeded:

```bash
node dist/cli/index.js --help
```

You should see the top-level command list (`run`, `team`, `workflows`, `connectors`, `eval`, `privacy`).

---

## 3. Your first workflow (no API key needed)

Run the canonical NDA demo in offline mode. No `ANTHROPIC_API_KEY` required — PossibLaw uses deterministic fixtures when the key is absent.

```bash
bin/possiblaw run quick-counsel "draft an NDA for ACME for a mutual disclosure with a 2-year term"
```

**What to expect (in order):**

1. Disclaimer banner + `[offline mode]` notice.
2. `chief-counsel` routes to `commercial-lead`.
3. `commercial-lead` routes to `nda-drafter`.
4. `nda-drafter` produces a 2-year mutual NDA for ACME (Delaware governing law, equitable-relief clause, signature block, disclaimer).
5. `groundedness` test passes.
6. `signed-document` guardrail hits — escalation card prints.
7. Exit code 0. (Escalation is a success state — a human-in-the-loop check is the correct outcome.)

The escalation card looks like:

```
╔══════════════════════════════════════════════════════════╗
║                    ESCALATION CARD                       ║
╚══════════════════════════════════════════════════════════╝
Matter: draft an NDA for ACME for a mutual disclosure with a 2-year term
Guardrail triggered: signed-document
Reason: A licensed reviewing lawyer must approve before any signed document is sent.
```

---

## 4. Add an API key for live mode

**Where to get one:** https://console.anthropic.com — create an account, add billing, generate an API key.

**How to set it:**

```bash
export ANTHROPIC_API_KEY=sk-ant-...
```

Or add it to a `.env` file (never commit this file):

```bash
echo "ANTHROPIC_API_KEY=sk-ant-..." >> .env
```

**How to verify:**

```bash
bin/possiblaw run quick-counsel "draft an NDA for ACME for a mutual disclosure with a 2-year term" --verbose
```

In live mode, you will see real LLM responses at each step and token usage reported per call. The routing decisions and NDA body are produced by the model in real time.

**Models in use (default):**
- `chief-counsel` → `claude-opus-4-7`
- `commercial-lead` → `claude-sonnet-4-6`
- `nda-drafter` → `claude-sonnet-4-6`

**Want to use a different provider?** PossibLaw supports four: `anthropic`, `claude-cli` (Claude Code subscription), `codex-cli` (OpenAI Codex subscription), and `ollama` (local). Override per run with the `--provider` flag:

```bash
bin/possiblaw run quick-counsel "draft NDA for ACME" --provider claude-cli
bin/possiblaw run quick-counsel "draft NDA for ACME" --provider ollama --model llama3.1:8b
```

See [docs/auth.md](auth.md) for the full provider comparison, auth requirements, and cost reporting details.

---

## 5. Switch templates

PossibLaw ships with two starter templates:

| Template | Roster | Best for |
|---|---|---|
| `solo-lawyer` | 1 router + 1 lead + 1 specialist | Single-attorney practice, quick demos |
| `small-firm` | 2 routers + 4 leads + 6 specialists | Multi-surface: legal + marketing + finance + admin |

To see the full roster for a template:

```bash
bin/possiblaw team list --template small-firm
```

To run a workflow using the small-firm template:

```bash
bin/possiblaw run quick-intake-reply "new prospect wants representation for a vendor dispute" --template small-firm
```

---

## 6. Customize your team

The non-engineer guide to adding, removing, and renaming agents is in [docs/customize-your-team.md](customize-your-team.md). It covers:

- Adding a custom specialist in 3 commands.
- Editing the system prompt in your editor.
- Verifying the agent appears in the roster.
- Exporting a team snapshot for review.

Technical guides are in [docs/extending/](extending/) — see Step 10 below.

---

## 7. Connectors

PossibLaw has 14 registered connectors. Three always work without credentials (stand-ins):

| Connector | What it does | Stand-in for |
|---|---|---|
| `local-fs-doc-store` | Reads/writes `layer/connectors/local-docs/` | iManage, NetDocuments |
| `no-op-signature` | Writes signature JSON locally | DocuSign |
| `courtlistener` | Free public case search | Westlaw, LexisNexis |

List all connectors and their configured status:

```bash
bin/possiblaw connectors list
```

Check a stand-in (no creds needed):

```bash
bin/possiblaw connectors check local-fs-doc-store
bin/possiblaw connectors check courtlistener
```

To enable a live connector, set its env var. Example for Stripe:

```bash
export STRIPE_API_KEY=sk_test_...
bin/possiblaw connectors check stripe
```

Example for HubSpot:

```bash
export HUBSPOT_ACCESS_TOKEN=pat-na1-...
bin/possiblaw connectors check hubspot
```

See [docs/connectors-inventory.md](connectors-inventory.md) for the full list and `.env.example` for all env vars.

---

## 8. Privacy Filter

The Privacy Filter masks sensitive entities (names, EINs, money amounts, addresses, phone numbers) before they leave your machine and reach the Anthropic API. It uses Ollama for encoding when available, and falls back to a rule-based regex encoder when offline.

Enable it on any `run` command with `--privacy-profile`:

```bash
# Cloud-only mode: mask before cloud calls, unmask in deliverable
bin/possiblaw run quick-counsel \
  "draft NDA for ACME Corp (EIN 12-3456789) at 100 Industrial Way, Wilmington DE" \
  --privacy-profile cloud-only

# Always mask (even Ollama calls)
bin/possiblaw run quick-counsel "..." --privacy-profile always

# Off (default): no masking
bin/possiblaw run quick-counsel "..." --privacy-profile off
```

To inspect what was masked in a prior run:

```bash
bin/possiblaw privacy show <matter-id>
```

See [docs/privacy-filter.md](privacy-filter.md) for the threat model and token format.

---

## 9. Cost reporting

Every `run` command prints a cost breakdown after the pipeline completes. Offline runs show $0.

```bash
# See estimated cost for a workflow before running
bin/possiblaw workflows show quick-counsel

# Run and see actual cost
export ANTHROPIC_API_KEY=sk-ant-...
bin/possiblaw run quick-counsel "draft NDA for ACME"
```

To switch an agent to a cheaper model:

```bash
bin/possiblaw team set-model nda-drafter anthropic/claude-haiku-4-5
bin/possiblaw workflows show quick-counsel    # cost updates
```

To use a local Ollama model at $0:

```bash
bin/possiblaw team set-model expense-categorizer ollama/llama3.1:8b
```

See [docs/sprint-5-demo.md](sprint-5-demo.md) for the full cost-transparency walkthrough.

---

## 10. What now?

| Task | Where to look |
|---|---|
| Run a more powerful workflow (3× parallel branches) | `bin/possiblaw run deep-review "..."` |
| Run an adversarial stress test | `bin/possiblaw run stress-test "..."` |
| List all 9 workflows | `bin/possiblaw workflows list` |
| Add a new specialist | [docs/extending/add-a-specialist.md](extending/add-a-specialist.md) |
| Add a new workflow | [docs/extending/add-a-workflow.md](extending/add-a-workflow.md) |
| Add a new test or guardrail | [docs/extending/add-a-test.md](extending/add-a-test.md), [docs/extending/add-a-guardrail.md](extending/add-a-guardrail.md) |
| Add a new connector | [docs/extending/add-an-mcp-connector.md](extending/add-an-mcp-connector.md) |
| Run eval benchmarks | [docs/evals.md](evals.md) |
| Understand the architecture | [FOUNDATION.md](../FOUNDATION.md), [docs/ARCHITECTURE.md](ARCHITECTURE.md) |
| Contribute | [CONTRIBUTING.md](../CONTRIBUTING.md) |
