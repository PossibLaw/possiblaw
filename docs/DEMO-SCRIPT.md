# Sprint 1a Demo Script

This walkthrough exercises PossibLaw's Sprint 1a vertical slice end-to-end:
**Chief Counsel → Commercial Lead → nda-drafter → stub groundedness test → signed-document guardrail → escalation card.**

The demo runs in two modes:

1. **Offline mode** (no `ANTHROPIC_API_KEY`) — uses deterministic fixtures so anyone cloning the repo can run the demo immediately.
2. **Live mode** (with `ANTHROPIC_API_KEY` set) — calls the real Anthropic API at each agent step. The routing decisions and the NDA body are produced by the LLM in real time.

---

## Setup

```bash
git clone --recurse-submodules <repo-url>
cd possiblaw
pnpm install
pnpm build
```

If you forgot `--recurse-submodules`, run `git submodule update --init --recursive` before continuing.

---

## Demo 1 — Quick Counsel, Draft NDA (offline mode)

This is the demo gate from plan §9 Sprint 1a.

```bash
unset ANTHROPIC_API_KEY        # ensure offline mode
bin/possiblaw run quick-counsel "draft an NDA for ACME for a mutual disclosure with a 2-year term"
```

**What you should see** (in order):

1. **Disclaimer banner**:
   ```
   PossibLaw does not practice law. Treat output as a starting point.
   [offline mode — ANTHROPIC_API_KEY not set; using deterministic fixtures]
   ```
2. **Chief Counsel routes** the matter to Commercial Lead:
   ```
   ▶ route:chief-counsel | chief-counsel | claude-opus-4-7 (offline)
       ROUTE_TO: commercial-lead
       Rationale: Operator requests an NDA, which is a commercial matter.
   ```
3. **Commercial Lead routes** to the nda-drafter specialist:
   ```
   ▶ route:commercial-lead | commercial-lead | claude-sonnet-4-6 (offline)
       ROUTE_TO: nda-drafter
       Rationale: NDA draft is the nda-drafter's core competency.
   ```
4. **NDA drafter produces a complete 2-year mutual NDA** for ACME (Delaware governing law, equitable-relief clause, signature block, PossibLaw disclaimer).
5. **Groundedness test passes** (stub returns `pass: true`):
   ```
   ✔ test:groundedness — passed
   ```
6. **Signed-document guardrail HITS** (stub blocks anything that produces a signed deliverable):
   ```
   ⚠ guardrail:signed-document — HIT (escalating)
   ```
7. **Escalation card** prints with matter, guardrail name, reason, and recommended next action:
   ```
   ╔══════════════════════════════════════════════════════════════════════╗
   ║                        ESCALATION CARD                              ║
   ╚══════════════════════════════════════════════════════════════════════╝

   Matter:
     draft an NDA for ACME for a mutual disclosure with a 2-year term

   Guardrail triggered:
     signed-document

   Reason:
     This action triggers the signed-document risk gate.
     A licensed reviewing lawyer must approve before any signed document
     is sent. The Sprint 1a stub blocks all such actions unconditionally.

   Recommended next action:
     Reviewing lawyer must approve before signed document is sent.
   ```

**Exit code is 0** — escalation is a success state per plan §4 (lavern's "escalation = success" framing).

---

## Demo 2 — Live mode (with API key)

```bash
export ANTHROPIC_API_KEY=sk-ant-...
bin/possiblaw run quick-counsel "draft an NDA for ACME for a mutual disclosure with a 2-year term" --verbose
```

The pipeline is identical, but each agent step is a real LLM call. Models used (per agent frontmatter):

- `chief-counsel` → `claude-opus-4-7`
- `commercial-lead` → `claude-sonnet-4-6`
- `nda-drafter` → `claude-sonnet-4-6`

In `--verbose` mode you'll see the system prompt assembled for each agent (frontmatter body + injected skills) and the full LLM response. Token usage is reported per call.

---

## Demo 3 — Team list

```bash
bin/possiblaw team list
```

Shows the active roster (default template: `solo-lawyer`):

```
Team — template: solo-lawyer
  [router]      chief-counsel
                Top-level legal router that classifies incoming legal matters ...
  [lead]        commercial-lead
                Commercial Lead that manages commercial law specialists ...
  [specialist]  nda-drafter
                Specialist that drafts mutual or one-way NDAs ...
```

---

---

## Demo 4 — Multi-surface day (small-firm template)

This demo proves "legal business does more than law." Sprint 3 adds Marketing, Finance, and Admin surfaces, all reachable via the same workflow runner.

### Step 1 — Inspect the full team roster

```bash
bin/possiblaw team list --template small-firm
```

Expected: 12 agents listed — 2 routers + 4 leads + 6 specialists. Non-legal agents are color-coded by domain (magenta = marketing, blue = finance, yellow = admin).

### Step 2 — Marketing surface: new client intake form

```bash
bin/possiblaw run quick-intake-reply "new prospect wants representation for a vendor dispute"
```

**What you should see:**

1. Chief of Staff classifies the matter as marketing → routes to `marketing-lead`.
2. Marketing Lead routes to `intake-form-drafter`.
3. intake-form-drafter produces a ~30-field intake questionnaire (sections: Contact, Matter Details, Prior Representation, Conflict Seed, Scheduling, Privacy & Consent).
4. `scope-adherence` test passes.
5. No guardrail — delivered with exit code 0.

### Step 3 — Finance surface: invoice review with guardrail

```bash
bin/possiblaw run quick-invoice-review "draft May invoice for ACME matter — 12.5 hours partner time, 8 hours associate"
```

**What you should see:**

1. Chief of Staff classifies as finance → routes to `finance-lead`.
2. Finance Lead routes to `billing-prep`.
3. billing-prep produces a complete draft invoice (line items for partner at $450/hr, associate at $275/hr, total $7,375.00, payment block, and `Signature: ___` authorization line).
4. `scope-adherence` test passes.
5. **`signed-document` guardrail HITS** — the invoice contains a signature/authorization block.
6. Escalation card prints: a reviewing partner must approve before the invoice is sent to the client.

---

## What this demo proves

| Capability | Where it shows up |
|---|---|
| **Net-new layer lives in `layer/`** | Every file the pipeline reads is under `layer/`; paperclip submodule is untouched. |
| **Per-agent model choice** | The `model:` frontmatter field on each agent is honored; Chief Counsel runs on Opus, the rest on Sonnet. |
| **Routing hierarchy** | Chief Counsel → Commercial Lead → nda-drafter chain is decided at runtime by parsing `ROUTE_TO:`. |
| **Test layer (stub)** | `layer/tests/groundedness.yaml` is loaded and executed; soft-test (retryable) shape in place for Sprint 2's real implementation. |
| **Guardrail layer (stub)** | `layer/guardrails/risk-gates/signed-document.yaml` is loaded and executed; hard-guardrail (always-escalate) shape in place for Sprint 2's real implementation. |
| **Workflow templates** | `layer/workflows/quick-counsel.yaml` defines the pipeline; switching workflows = switching files. |
| **Starter templates** | `layer/templates/solo-lawyer.yaml` lists the active roster. |
| **Disclaimer plumbing** | Every CLI command, every NDA deliverable, every template includes the disclaimer. |

## What this demo explicitly does NOT prove (deferred to later sprints)

- Real test measurement (Sprint 2). The groundedness check is a stub.
- Real guardrail detection (Sprint 2). signed-document always fires; no real signature detection yet.
- Paperclip integration (Sprint 2+). The submodule is present but not yet called by the CLI.
- Non-legal surfaces (Sprint 3). Marketing/finance/admin Leads are not built yet.
- MCP connectors (Sprint 6). No external systems are wired in.
- Eval suite (Sprint 9). The `eval` command is a placeholder.

---

## Demo 5 — Privacy Filter walkthrough (Sprint 4)

See `docs/sprint-4-demo.md` for the full Privacy Filter demo, which covers:

1. **Offline mode** (rule-based encoder): run quick-counsel with entity-rich NDA prompt; audit log shows `«ENT_*»` tokens in model traffic; final deliverable contains real entities.
2. **Live Ollama mode** (Llama 3.1 8B encoder + Anthropic specialist): Anthropic sees only masked text; decoder rehydrates the final NDA.
3. **Failure path**: `--privacy-profile off --matter-tag sensitive` triggers `privacy-filter-required` guardrail escalation.

Quick-reference commands:

```bash
# Offline: rule-based encoder
env -u ANTHROPIC_API_KEY node dist/cli/index.js run quick-counsel \
  "draft an NDA for ACME Corp (EIN 12-3456789) at 100 Industrial Way, Wilmington DE; counterparty Beta Holdings LLC; codename Project Quetzal; value \$2,500,000" \
  --privacy-profile cloud-only

# Failure path: profile off + sensitive tag
env -u ANTHROPIC_API_KEY node dist/cli/index.js run quick-counsel \
  "anything sensitive" \
  --privacy-profile off \
  --matter-tag sensitive

# Inspect key store
node dist/cli/index.js privacy show <matter-id>
```

---

## Sprint 5: Cost transparency

See [docs/sprint-5-demo.md](./sprint-5-demo.md) for the full walkthrough.

Quick commands:

```bash
# 1. Show typical cost for quick-counsel workflow
node dist/cli/index.js workflows show quick-counsel

# 2. Run offline — cost report shows $0
env -u ANTHROPIC_API_KEY node dist/cli/index.js run quick-counsel "draft NDA for ACME"

# 3. Override nda-drafter to haiku
node dist/cli/index.js team set-model nda-drafter anthropic/claude-haiku-4-5

# 4. Re-run — workflows show reflects lower cost
node dist/cli/index.js workflows show quick-counsel

# 5. Swap expense-categorizer to local Llama
node dist/cli/index.js team set-model expense-categorizer ollama/llama3.1:8b

# 6. Check effective models
node dist/cli/index.js team show-model expense-categorizer
node dist/cli/index.js team show-model nda-drafter

# 7. Invoice review — cost report shows local-model at $0
env -u ANTHROPIC_API_KEY node dist/cli/index.js run quick-invoice-review \
  "draft May invoice for ACME — 12.5 partner hours, 8 associate hours"
```

---

## Sprint 7: Customize Your Team

See [docs/sprint-7-demo.md](./sprint-7-demo.md) for the full walkthrough: add a custom specialist, fill in the system prompt, verify the roster, run the pipeline in offline mode, export a team snapshot, and remove the agent.

Quick commands:

```bash
# 1. Add a custom specialist
node dist/cli/index.js team add specialist legal/employment/employee-handbook-drafter --lead commercial-lead

# 2. Verify it appears in the roster
node dist/cli/index.js team list --template small-firm

# 3. Diff two templates
node dist/cli/index.js team diff solo-lawyer small-firm

# 4. Run offline — routes through new specialist
env -u ANTHROPIC_API_KEY node dist/cli/index.js run quick-counsel "draft an employee handbook section on PTO policy for a 50-person tech company"

# 5. Export effective team snapshot
node dist/cli/index.js team export small-firm --output /tmp/team-snapshot.yaml

# 6. Remove from roster (file retained)
node dist/cli/index.js team remove employee-handbook-drafter
```

---

## Sprint 6A+6B: Connectors (14 total)

See [docs/sprint-6-demo.md](./sprint-6-demo.md) for the full connector walkthrough.

Quick commands:

```bash
# 1. List all 14 registered connectors with configured status
node dist/cli/index.js connectors list

# 2. Healthcheck the stand-in connectors (always ok, no creds)
node dist/cli/index.js connectors check local-fs-doc-store
node dist/cli/index.js connectors check no-op-signature
node dist/cli/index.js connectors check courtlistener     # real HTTP to courtlistener.com

# 3. Healthcheck a live connector — not configured without creds
node dist/cli/index.js connectors check stripe            # ok: false (no STRIPE_API_KEY)
node dist/cli/index.js connectors check hubspot           # ok: false (no HUBSPOT_ACCESS_TOKEN)
node dist/cli/index.js connectors check imanage           # ok: false (no IMANAGE_TOKEN etc.)

# 4. Inspect capabilities
node dist/cli/index.js connectors capabilities hubspot
node dist/cli/index.js connectors capabilities notion
node dist/cli/index.js connectors capabilities imanage

# 5. View connector inventory (live + deferred v1 targets)
# See docs/connectors-inventory.md for Clio, Slack, Google Workspace, M365, etc.

---

## Demo 8 — Workflow library (Sprint 8)

Sprint 8 adds 5 new workflows (9 total), 3 meta-agents, and the `workflows list/show/pick` CLI surface.

### 8a. List all workflows

```bash
node dist/cli/index.js workflows list
```

Prints a table of 9 workflows with shape summary and estimated live cost.

### 8b. Show deep-review shape and cost

```bash
node dist/cli/index.js workflows show deep-review
```

Shows: router → 3× parallel (temps 0.2/0.7/1.0) → reconcile → tests → guardrails. Cost multiplied by 3 parallel branches.

### 8c. Deep Review — high-stakes NDA with parallel synthesis

```bash
env -u ANTHROPIC_API_KEY node dist/cli/index.js run deep-review \
  "draft NDA for ACME Corp and Beta Corp for software evaluation"
```

Three parallel `nda-drafter` branches at diverse temperatures → `reconciler` synthesizes → `## Reconciliation notes` in output.

### 8d. Stress Test — adversarial debate

```bash
env -u ANTHROPIC_API_KEY node dist/cli/index.js run stress-test \
  "review NDA for ACME Corp for hidden risks"
```

`nda-drafter` defends; `risk-spotter` attacks; 3 rounds; `debate-judge` issues verdict + dissent + risks.

### 8e. Roundtable — cross-surface

```bash
env -u ANTHROPIC_API_KEY node dist/cli/index.js run roundtable \
  "review NDA for ACME Corp from legal, finance, and marketing perspectives"
```

Legal (`nda-drafter`) + Finance (`billing-prep`) + Marketing (`pitch-polisher`) debate 3 rounds.

### 8f. Per-surface variants

```bash
# Quick pitch polish
env -u ANTHROPIC_API_KEY node dist/cli/index.js run quick-pitch-polish \
  "polish this pitch: Our firm has 30 years of experience in commercial litigation."

# Quick expense categorize
env -u ANTHROPIC_API_KEY node dist/cli/index.js run quick-expense-categorize \
  "categorize: Nobu dinner $245, Uber to courthouse $42, Westlaw research $180"
```

### 8g. Interactive picker

```bash
node dist/cli/index.js workflows pick
# Lists numbered workflows → type a number → returns chosen name
```

Full walkthrough: `docs/sprint-8-demo.md`.
```
