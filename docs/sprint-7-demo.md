# Sprint 7 Demo: Customize Your Team

This walkthrough mirrors the Sprint 7 demo gate from plan §9. A non-engineer follows `docs/customize-your-team.md` to add a custom specialist, then runs a workflow that routes through the new specialist.

**Scenario:** A small law firm handles employment matters informally today, but is formalizing. The operator wants to add an `employee-handbook-drafter` specialist so PossibLaw can help draft employee handbook sections.

---

## Setup

```bash
git clone --recurse-submodules <repo-url>
cd possiblaw
pnpm install
pnpm build
```

---

## Step 1 — Inspect the Current Roster

```bash
node dist/cli/index.js team list --template small-firm
```

**What you should see:** 12 agents — 2 routers, 4 leads, 6 specialists. No employment specialist exists yet.

---

## Step 2 — Add the Custom Specialist

```bash
node dist/cli/index.js team add specialist legal/employment/employee-handbook-drafter --lead commercial-lead
```

**What you should see:**

```
Custom specialist created: employee-handbook-drafter
  File:     .possiblaw/custom-agents/employee-handbook-drafter.md
  Lead:     commercial-lead
  Template: small-firm (added to specialists)
  Model:    anthropic/claude-sonnet-4-6

Next step: edit .possiblaw/custom-agents/employee-handbook-drafter.md to fill in the system prompt.
  Copy the structure from layer/agents/specialists/legal/commercial/nda-drafter.md
```

**What just happened:**

- `.possiblaw/custom-agents/employee-handbook-drafter.md` was created with placeholder frontmatter and a scaffold system prompt.
- `.possiblaw/template-overrides.yaml` was updated to add `employee-handbook-drafter` to the `small-firm` specialists list.

---

## Step 3 — Fill In the System Prompt

The generated file has a `## TODO: Fill in this system prompt` placeholder. The demo file at `.possiblaw/custom-agents/employee-handbook-drafter.md` has already been filled in with a real system prompt for this demo (section 4.2 — PTO policy focus, US federal baseline defaults, required disclaimer format).

In a real deployment, you would open the file and write instructions matching the agent's task. Copy the structure from `layer/agents/specialists/legal/commercial/nda-drafter.md` as a reference.

---

## Step 4 — Verify the Roster

```bash
node dist/cli/index.js team list --template small-firm
```

**What you should see:** 13 agents total — `employee-handbook-drafter` now appears in the specialists list with description "Specialist that drafts employee handbook sections given a topic, company size, and industry context."

---

## Step 5 — Check the Diff

```bash
node dist/cli/index.js team diff solo-lawyer small-firm
```

**What you should see:**

```
Diff: solo-lawyer → small-firm

Routers:
  + chief-of-staff
Leads:
  + marketing-lead
  + finance-lead
  + admin-lead
Specialists:
  + intake-form-drafter
  + pitch-polisher
  + billing-prep
  + expense-categorizer
  + calendar-coordinator
  + employee-handbook-drafter
Workflows:
  + quick-invoice-review
  + quick-intake-reply
```

`employee-handbook-drafter` appears in the diff because it was added via `.possiblaw/template-overrides.yaml`.

---

## Step 6 — Run the Workflow (Offline Mode)

```bash
env -u ANTHROPIC_API_KEY node dist/cli/index.js run quick-counsel "draft an employee handbook section on PTO policy for a 50-person tech company"
```

**What you should see** (in order):

1. **Disclaimer banner** + offline mode notice.
2. **Chief Counsel routes** to `commercial-lead`:
   ```
   ▶ route:chief-counsel | chief-counsel | claude-opus-4-7 (offline)
       ROUTE_TO: commercial-lead
       Rationale: Operator requests an NDA, which is a commercial matter.
   ```
3. **Commercial Lead routes** to `employee-handbook-drafter` (prompt-content match on "employee handbook"):
   ```
   ▶ route:commercial-lead | commercial-lead | claude-sonnet-4-6 (offline)
       ROUTE_TO: employee-handbook-drafter
       Rationale: Operator requests an employee handbook section; routing to employee-handbook-drafter.
   ```
4. **Specialist stub output:**
   ```
   ▶ specialist:employee-handbook-drafter | employee-handbook-drafter | claude-sonnet-4-6 (offline)
       [OFFLINE STUB FOR employee-handbook-drafter] — fill in .possiblaw/custom-agents/...
   ```
5. Groundedness test passes. Privacy-filter and signed-document guardrails clear.
6. **DELIVERED** status with exit code 0.

**What this proves:** The custom specialist is correctly routed to in offline mode. In live mode (with `ANTHROPIC_API_KEY` set), the specialist's real system prompt would be used and the output would be a complete employee handbook section draft.

---

## Step 7 — Export the Team Snapshot

```bash
node dist/cli/index.js team export small-firm --output /tmp/team-snapshot.yaml
head -40 /tmp/team-snapshot.yaml
```

**What you should see:** A YAML snapshot capturing `name: small-firm`, `generated_at`, the full effective roster (13 agents), all agent frontmatter, `custom_agents` listing `employee-handbook-drafter`, and `overrides_applied` if any model overrides are active.

---

## Step 8 — Remove the Specialist

```bash
node dist/cli/index.js team remove employee-handbook-drafter
```

**What you should see:**

```
Agent 'employee-handbook-drafter' removed from template 'small-firm' roster.
Agent file retained at .possiblaw/custom-agents/employee-handbook-drafter.md — delete manually if you want it gone.
```

**Verify the file is still there:**

```bash
ls .possiblaw/custom-agents/
# → employee-handbook-drafter.md
```

**Verify it no longer appears in the roster:**

```bash
node dist/cli/index.js team list --template small-firm | grep employee
# → (no output)
```

---

## What This Demo Proves

| Capability | Where It Shows Up |
|---|---|
| **`team add specialist`** | Creates `.possiblaw/custom-agents/<name>.md` scaffold + updates `template-overrides.yaml` |
| **`team list`** | Shows new specialist in roster (honoring `template-overrides.yaml`) |
| **`team diff`** | Structured diff shows custom specialist as `+` vs base template |
| **Loader: custom agent search path** | `loadAgent()` finds `employee-handbook-drafter` in `.possiblaw/custom-agents/` before falling back to `layer/agents/` |
| **Dynamic offline stub** | Unknown/custom agents return `[OFFLINE STUB FOR <name>]` so offline mode works for any future agent |
| **Offline routing** | `commercial-lead` routes to `employee-handbook-drafter` on "employee handbook" prompt — no OFFLINE_FIXTURES entry required |
| **`team export`** | YAML snapshot includes custom agents and overrides |
| **`team remove`** | Removes from roster; preserves file; prints retention note |
| **All prior demos still work** | Sprint 1a NDA pipeline, Sprint 3 multi-surface, Sprint 4 privacy filter, Sprint 5 cost transparency, Sprint 6 connectors — all pass |

---

## Recovery

If you break something:

```bash
# Reset template-overrides to a clean state
cat > .possiblaw/template-overrides.yaml << 'EOF'
templates:
  small-firm:
    roster:
      specialists:
        add:
          - employee-handbook-drafter
EOF

# Or wipe all roster overrides entirely
rm .possiblaw/template-overrides.yaml
```

Nothing in `.possiblaw/` is permanent source-of-truth. The layer files in `layer/` are the source of truth.
