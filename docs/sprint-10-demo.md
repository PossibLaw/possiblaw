# Sprint 10 Demo — Fresh-Clone Walkthrough

This document records the Sprint 10 "stranger walkthrough" verification: a simulated fresh clone that exercises the canonical Quickstart from `docs/getting-started.md`.

Date: 2026-05-21
PossibLaw version: 0.1.0
Node version: 20.x
Platform: macOS (darwin 25.3.0)

---

## What was wiped

To simulate a fresh clone, the following were deleted:

```bash
rm -rf dist/ node_modules/
```

Files deliberately NOT wiped (would not be present in a real fresh clone but are part of the layer state):
- `layer/privacy-filter/keys/` — key stores persist across runs (by design)
- `layer/audit/*.jsonl` — audit logs persist across runs (by design)

---

## Step 1 — Install

```bash
pnpm install && pnpm build
```

Result: **PASS**. `pnpm install` resolved all dependencies. `pnpm build` (tsc + fixture copy) completed without errors. Version shown in build output: `possiblaw@0.1.0`.

---

## Step 2 — Help command

```bash
node dist/cli/index.js --help
```

Result: **PASS**. Output:

```
Usage: possiblaw [options] [command]

PossibLaw CLI — AI-assisted legal workflow runner

Options:
  -v, --version                      output the version number
  -h, --help                         display help for command

Commands:
  run [options] <workflow> <prompt>  Run a workflow on a matter prompt
  team                               Team management commands
  workflows                          Workflow commands
  audit                              Audit log commands
  privacy                            Privacy filter commands
  connectors                         Connector management commands
  eval [options]                     Eval suite — benchmark workflows ...
  help [command]                     display help for command
```

All 7 top-level commands present.

---

## Step 3 — Canonical Quickstart NDA demo (offline)

Command:

```bash
env -u ANTHROPIC_API_KEY node dist/cli/index.js run quick-counsel \
  "draft an NDA for ACME for a mutual disclosure with a 2-year term"
```

Result: **PASS**. Pipeline executed in order:

1. Disclaimer banner + `[offline mode]` notice — printed.
2. `chief-counsel` routed to `commercial-lead` with rationale — printed.
3. `commercial-lead` routed to `nda-drafter` with rationale — printed.
4. `nda-drafter` produced a complete 2-year mutual NDA for ACME (Delaware law, equitable-relief clause, signature block, PossibLaw disclaimer) — printed.
5. `groundedness` test passed (score: 0.95, stub) — printed.
6. `privacy-filter-required` guardrail cleared (no sensitive matter tag) — printed.
7. `signed-document` guardrail hit — escalation card printed.
8. Cost report: `(offline — model costs not incurred)` — printed.

Exit code: 0.

---

## Step 4 — Escalation card verification

The escalation card printed correctly:

```
╔══════════════════════════════════════════════════════════════════════╗
║                        ESCALATION CARD                              ║
╚══════════════════════════════════════════════════════════════════════╝

Matter:
  draft an NDA for ACME for a mutual disclosure with a 2-year term

Guardrail triggered:
  signed-document

Reason:
  Signature-block detected in the draft. A licensed reviewing lawyer must
  approve before any signed document is sent. Match: (?im)^signature:\s*_+.

Recommended next action:
  Reviewing lawyer must approve before signed document is sent.
```

---

## Step 5 — Typecheck

```bash
pnpm typecheck
```

Result: **PASS**. No TypeScript errors. Exit code: 0.

---

## Definition of Done status

| Item | Status |
|---|---|
| 5-minute Quickstart works from fresh clone | PASS (verified above) |
| `pnpm typecheck && pnpm build` pass | PASS |
| `node dist/cli/index.js --help` shows all commands | PASS |
| Escalation card prints with correct content | PASS |
| Cost report shows offline mode | PASS |
| Sprint 1a NDA flow unchanged | PASS |
| README ≤ 300 lines | PASS (177 lines) |
| Only legitimate placeholders in docs | PASS (`[security@possiblaw.example]` in SECURITY.md) |
| Contribution surface complete (SECURITY, issue templates, extending guides) | PASS |
| Outreach drafts written | PASS |
| Announcement draft written | PASS |

---

## External Definition-of-Done items (not part of this commit)

These require the operator's action:

- Outside-reviewer validation of `docs/extending/` guides.
- Outside-operator using PossibLaw on a real matter.
- Live eval numbers in README (requires `ANTHROPIC_API_KEY` + budget).
