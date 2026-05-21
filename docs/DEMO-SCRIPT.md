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
- Privacy Filter (Sprint 4). Cloud calls are unfiltered.
- MCP connectors (Sprint 6). No external systems are wired in.
- Eval suite (Sprint 9). The `eval` command is a placeholder.
