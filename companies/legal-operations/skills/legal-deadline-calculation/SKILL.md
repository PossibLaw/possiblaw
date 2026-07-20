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

The `deadline-engine` CLI must be invoked from inside the `deadline-engine/` directory because `tsx` resolves only from that package's `node_modules`. The launcher injects `POSSIBLAW_REPO_ROOT` into the agent's env; the `cd` below **depends on `POSSIBLAW_REPO_ROOT` being set** — if it is unset or empty, the `cd` cannot resolve the package and the invocation fails (treat as a BLOCKER per the rule below).

```
cd "$POSSIBLAW_REPO_ROOT/deadline-engine" && node --import tsx src/cli.ts --json '{"triggerDate":"<YYYY-MM-DD>","days":<N>,"direction":"<forward|backward>","serviceByMail":<true|false>,"jurisdiction":"<JURISDICTION>"}'
```

The engine reads from `--json` or from stdin. Exit 0 on success; exit 1 on malformed input.

**Prerequisite (operator-side):** `pnpm -C deadline-engine install` must have been run at least once to install devDependencies including `tsx`. The launcher does not auto-install.

**FAIL-CLOSED (mandatory):** If the engine invocation fails for ANY reason — `POSSIBLAW_REPO_ROOT` unset/empty, the `cd` fails, `pnpm -C deadline-engine install` was never run (no `tsx`), a non-zero exit code, or no parseable JSON on stdout — you MUST report a **BLOCKER** stating exactly what failed, and you MUST NOT fabricate, estimate, guess, or "reason about" a date as a fallback. No date may be reported unless it came from a successful (exit 0, valid JSON, `supported: true`) engine run. Escalate the BLOCKER to `litigation-lead`.

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

## Step 3b — Record the Deadline Receipt (if gate running)

After a successful (`supported: true`) computation for a specific matter, POST the deadline to the gate proxy so it is audited in the Matter Trust Report. This is best-effort: if `$GATE_PROXY_URL` is unset or the POST fails, record the deadline on the matter and note it is unreceipted — do not fail the computation.

The `payloadSha256` is the SHA-256 (lowercase hex) of the canonical JSON of the engine inputs: `{"triggerDate":"<DATE>","days":<N>,"direction":"<forward|backward>","serviceByMail":<bool>,"jurisdiction":"<JURI>","deadline":"<RESULT>"}`.

The `meta` object must carry exactly six keys — `deadline`, `rule`, `jurisdiction`, `direction`, `days`, `serviceByMail` — or the gate rejects the receipt. `serviceByMail` must match the value passed to the engine so the recorded `days` reconciles with the date (a mail-service date silently includes the FRCP 6(d) +3 days).

```bash
# Only run when GATE_PROXY_URL is set and computation was successful
if [ -n "$GATE_PROXY_URL" ]; then
  curl -s -X POST "$GATE_PROXY_URL/receipts/deadline" \
    -H "Authorization: Bearer ${PAPERCLIP_API_KEY}" \
    -H "Content-Type: application/json" \
    -d '{
      "matterId": "<MATTER_ID>",
      "payloadSha256": "<64-HEX-SHA>",
      "meta": {
        "deadline": "<YYYY-MM-DD>",
        "rule": "FRCP-6",
        "jurisdiction": "US-FED",
        "direction": "<forward|backward>",
        "days": <N>,
        "serviceByMail": <true|false>
      }
    }' || true  # fail-open: a receipt failure must not block the computation result
fi
```

If `$GATE_PROXY_URL` is unset: return the deadline result and note "deadline is unreceipted (no gate running)".

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
- Fail closed: any engine failure (unset `POSSIBLAW_REPO_ROOT`, missing `tsx`/install, non-zero exit, no JSON) is a BLOCKER — never substitute a fabricated or estimated date.
