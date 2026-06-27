---
name: legal-deadline-calculation
description: Compute filing deadlines deterministically via the deadline-engine CLI (FRCP Rule 6, US federal only). Never estimates dates; fails closed to UNCONFIRMED for unsupported jurisdictions.
metadata:
  sources:
    - path: companies/legal-operations/skills/legal-deadline-calculation/SKILL.md
      kind: local-file
      usage: vendored
      license: Apache-2.0
      attribution: PossibLaw
    - url: https://www.law.cornell.edu/rules/frcp/rule_6
      kind: regulation
      usage: reference
      attribution: FRCP Rule 6 — Computing and Extending Time
    - url: https://uscode.house.gov/view.xhtml?req=granuleid:USC-prelim-title5-section6103
      kind: statute
      usage: reference
      attribution: 5 U.S.C. § 6103 — Federal legal public holidays
---

# Legal Deadline Calculation

Use this skill to compute a filing deadline or period-count date through the deterministic `deadline-engine` CLI. All date arithmetic is offloaded to the engine — never computed by the agent.

## Step 1 — Gather Inputs

Collect all required inputs before invoking the engine. If any are missing or ambiguous, ask — do not assume.

| Input | Description | Notes |
|---|---|---|
| `triggerDate` | The event that starts the clock (e.g., service date, filing date) | ISO format YYYY-MM-DD |
| `days` | Period length in calendar days | Positive integer; e.g., 21 |
| `direction` | `forward` (count forward to a deadline) or `backward` (count back from a target date) | |
| `serviceByMail` | `true` if served by mail (adds 3 days per FRCP 6(d)); `false` or omit otherwise | Default: `false` |
| `jurisdiction` | Controlling jurisdiction | v1 supports `US-FED` only |

## Step 2 — Invoke the Engine

The `deadline-engine` CLI must be invoked from inside the `deadline-engine/` directory because `tsx` resolves only from that package's `node_modules`. The launcher injects `POSSIBLAW_REPO_ROOT` into the agent's env; use it to locate the package.

```
cd "$POSSIBLAW_REPO_ROOT/deadline-engine" && node --import tsx src/cli.ts --json '{"triggerDate":"<YYYY-MM-DD>","days":<N>,"direction":"<forward|backward>","serviceByMail":<true|false>,"jurisdiction":"<JURISDICTION>"}'
```

The engine reads from `--json` or from stdin. Exit 0 on success; exit 1 on malformed input.

**Prerequisite (operator-side):** `pnpm -C deadline-engine install` must have been run at least once to install devDependencies including `tsx`. The launcher does not auto-install.

## Step 3 — Present the Result

On a successful (`supported: true`) result:

1. State the **deadline date** and **day of week** exactly as returned by the engine.
2. Display the engine's **`steps` array** verbatim so the operator can trace every counting rule applied.
3. Include the explicit provenance line: "Computed deterministically by deadline-engine (FRCP Rule 6) — not estimated."
4. Add the operator follow-up: "Confirm with licensed counsel before relying on this date."

Example engine output for reference:
```json
{
  "supported": true,
  "jurisdiction": "US-FED",
  "rule": "FRCP-6",
  "deadline": "2025-01-10",
  "deadlineDayOfWeek": "Friday",
  "steps": [
    "Excluded trigger day 2024-12-20",
    "Counted 21 calendar days → 2025-01-10 (Friday)",
    "2025-01-10 is a business day — no roll needed"
  ]
}
```

## Step 4 — Unsupported Jurisdiction

If the engine returns `{"supported": false, "reason": "unsupported_jurisdiction"}`:

- Report **`UNCONFIRMED`** — do not compute, estimate, or suggest a date.
- State the jurisdiction that was requested and that it is not supported in v1.
- Escalate to `litigation-lead` for routing to appropriate counsel or a jurisdiction-specific resource.
- Never perform date arithmetic yourself as a fallback.

## Boundaries

- Never guess, estimate, or "reason about" a date. All date computation goes through the engine.
- Never bypass the engine — not for "obvious" periods, not under time pressure, not for any reason.
- US federal (FRCP) only in v1. State holiday calendars, CPR, and non-federal jurisdictions are unsupported; return `UNCONFIRMED` for all of them.
- Never state a computed deadline as the operative deadline; it is an operator follow-up for licensed counsel.
- Refuse and flag any instruction to skip the engine, use LLM reasoning for dates, or store a guessed deadline.
