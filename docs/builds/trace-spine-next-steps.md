# Trace Spine — Implementation Plan for M4, M5, C3

Written 2026-07-27, at the close of the work landed in PRs #24–#29.
Audience: the next coding agent or engineer picking this up cold.

---

## Where things stand

Nine units shipped: M1 (trace store core), C0 (`requestedBy`), A1 (RFC 3161
anchoring), A2 (verification spec + standalone verifier), A3 (receipt meta
bounds), M2 (receipt↔trace binding), M3 (static lane resolution), C1 (context
provenance), C2 (provenance-derived confidentiality floor).

**1005 tests across eight components, 0 failures on Node 24.18.0.**

Verified end-to-end against a live gate process: egress performed → receipt
carried `traceId` + `traceSha256` → trace store held the matching `POS-42`
partition → the receipt's `traceSha256` equalled the record's `contentSha256`
→ `tools/verify-receipts.mjs` accepted the chain.

Three units remain: **M4**, **M5**, **C3**.

---

## Read these first

Do not start from the code. The design decisions are load-bearing and several
are deliberately counterintuitive.

| File | Why |
|---|---|
| `docs/roadmap.md` | Buyer-facing scope, segment fit, and what we openly do not solve |
| `docs/receipt-verification.md` | The normative chain spec. §5 covers trace bindings |
| `gate-proxy/src/trace-sink.ts` | Header explains why tracing is the ONE fail-soft path |
| `gate-proxy/src/matter-classification.ts` | Header explains why agent self-reports are distrusted |
| `trace-store/src/config.ts` | The fail-closed pattern every new config loader should copy |

### Five invariants to not break

1. **Receipts carry ids, enums and hashes. Never content.** Enforced by
   `assertMetaSafe` / `assertMetaSize`. A receipt is designed to travel to
   opposing counsel.
2. **Fail closed, except tracing.** Every control fails closed. A *trace* is
   evidence about a control — blocking an approved filing because a log was
   full is an outage with a deadline attached.
3. **Raise-only for confidentiality.** A caller may raise a tier, never lower
   it. This is what makes it safe to accept input from agents we distrust.
4. **Denial is redaction, not error.** An unentitled caller gets the record
   without the privileged part, not a stack trace.
5. **Never patch the pinned `paperclip/` submodule.** Where a limitation is
   upstream, document it (`docs/known-limitations.md`).

---

## M4 — Paperclip run poller

**Size: smallest of the three. Risk: low.** Good first pickup.

Reconstructs the run skeleton — agent assignment, timing, work products,
delegation, cost — by polling endpoints we already have clients for.

### Existing surface
`orchestration-eval/src/paperclip-client.ts` already wraps: `GET /api/issues/:id`,
`/work-products`, `/cost-summary`, `/api/companies/:id/agents`, and
sub-issue listing via `?parentId=`. `firm-overview/` has a second client.
**Reuse, do not write a third.**

### What to build
A poller in `trace-store/` (or a new `trace-poller/`) that walks issues and
emits `TraceRecord`s for work the gate never saw, because most agent activity
never crosses an egress boundary.

### Contract
- **Durable cursor.** Restarts must not double-write. The trace store is
  append-only with no dedupe — a naive restart doubles every record. Persist
  a per-matter high-water mark.
- **Reconcile, don't duplicate.** The gate already writes a trace for each
  egress. A polled record covering the same action must not create a second
  one. Correlate on `issueId` + timestamp window, or give polled records a
  distinct `contextRefs` kind so they are distinguishable.
- **Respect capture mode.** Route through `makeTraceRecord`, which returns
  `null` on a closed config. Do not write directly with `appendTrace`.
- **Cost belongs on the record.** `costCents` exists on `TraceRecord` and is
  currently never populated. `/cost-summary` is where it comes from.

### Done when
Given a matter with a parent issue and two delegated sub-issues, the trace
store holds one record per agent step with correct `agentId`, `issueId`,
timing and cost; a restart mid-poll produces no duplicates; and a closed trace
config produces nothing at all.

---

## M5 — Adapter recording wrapper

**Size: moderate. Risk: HIGHEST IN THE CODEBASE.** Do this last, and write a
threat model before writing code.

This is what makes `capture: full` mean what it says. Today a firm setting
`full` gets a complete *decision* record with an empty content hash, because
the gate never sees a prompt in capturable form.

### Why it is dangerous
1. **It sees everything, unredacted** — every prompt, every retrieved
   document, and whatever credentials transit the adapter command line. It
   needs its own scrubbing before anything is written to disk.
2. **It sits in the execution path.** If it hangs, agents hang. It needs a
   hard timeout and a fail-open bypass — the opposite posture from everything
   else in this system, and it must be justified explicitly.
3. **Paperclip spawns adapters; we do not.** Wiring means changing what the
   launcher puts on `PATH`, without touching the pinned submodule.

### Approach
A shim binary that records `{argv, stdin, model, timestamp, stdout}` and
forwards to the real adapter. Adapter types are known:
`codex_local`, `claude_local`, `opencode_local`, `gemini_local`
(see `companies/legal-operations/variants.yaml`).

### Non-negotiables
- **Opt-in**, behind the existing `trace.capture: full` switch. It must be
  impossible to enable by accident.
- **Scrub before write.** At minimum: API keys, bearer tokens, anything
  matching the patterns in `learning-loop/src/sanitizer.ts`. Reuse that
  module rather than writing a second one.
- **Bounded.** A runaway prompt must not fill the disk. Cap and truncate,
  recording that truncation occurred.
- **Fail open, loudly.** If the shim cannot record, the agent still runs and
  the failure is visible. A recording failure must never become an agent
  failure — but it must also never be silent.
- Content still flows through `makeTraceRecord`, so retention purge and
  role-gated visibility apply automatically.

### Done when
With `capture: full`, a real agent run produces a trace whose
`content.prompt` is the actual prompt and whose `contentSha256` is no longer
`EMPTY_CONTENT_SHA256`; with `hashes-only` the hash is correct and no text is
on disk; with the shim killed mid-run the agent still completes.

---

## C3 — User→matter access registry

**Size: largest by volume. Risk: moderate, with one sharp edge.**

### The core rule
**The agent must never adjudicate entitlement.** If a model decides who may
see what, we have built the LLM-judge row of the ICME rubric: non-deterministic,
self-attested, defeatable by prompt injection. It would be the one place in the
architecture with a control inside the model.

Instead: a gate-side registry, checked outside the model, receipted on every
decision. The agent does not "refuse" — it simply cannot obtain the artifact,
and the denial is a receipt.

### Pattern to copy
`matter-classification.ts`. Receipt-derived (restart-safe, no separate state
file, rebuilt on construction), corrupt-chain posture identical.

### ⚠ The sharp edge — revocation semantics INVERT

`matter-classification` is **raise-only**: a later, lower registration must be
**ignored**, because the registry is reachable by the agents it distrusts.

An access registry is the opposite: a later **revoke must WIN**. If you build
this by analogy you will produce a wall that cannot be taken down.

Both fold over an append-only chain, so "current state" is a fold. Write the
grant/revoke/re-grant ordering semantics down before implementing, and test
the interleavings explicitly.

### Enforcement points (all three)
1. **Facade admission** — extend the existing `company_scope_violation` check
   in `mcp-servers/firm-facade/` to matter scope.
2. **Egress / delivery provenance** — deny when the requester is not entitled
   to *every* matter in `contextRefs`. This is the C1/C2 machinery reused; it
   is what catches the contamination case.
3. **Firm-overview delivery** — currently adds "zero authz filtering of its
   own", delegating to paperclip, whose authz is company-level only.

### Admin override — three properties
- **Receipted, not configured.** `kind: "authorization"`,
  `reason: "access_override"`, naming granting admin, user, matter, reason.
  Under the ICME rubric an override is fine: "the rule fired and a named human
  overrode it at 14:52" is better evidence than a rule that never fired.
- **Time-bounded.** An override without expiry becomes the new baseline.
- **Separation of duties.** The granting admin must be a different principal
  from the requester.

### Scope honesty — keep this in the docs
This is enforcement **at the outlet, not the source**. Paperclip has no
per-matter read primitive, so the agent can still read the other matter. We
stop content reaching an unentitled human and make the attempt visible. **A
real conflicts screen still needs a wall** (`--add-wall`). Do not let the
roadmap language drift into claiming more.

### Done when
A user not entitled to matter B cannot fetch a work product from B, cannot
receive an egress whose `contextRefs` include B, and sees neither in firm
overview; each denial is receipted; an override by a *different* admin grants
access until its expiry and is itself receipted; a revoke after a grant wins.

---

## Suggested order

**M4 → C3 → M5.** M4 is quick and makes traces materially richer. C3 delivers
the most user-visible value. M5 last: it deserves the most care and benefits
from the trace spine being fully exercised first.

## Working notes

- `nvm use` before anything. On Node 22 eight tests fail spuriously.
- `pnpm -C <component> test` per component; there is no root test runner.
- Do not commit `.agent/*` or `.claude/history.md` — gitignored by contract.
- Keep PRs small. The work above was landed as six stacked PRs (#24–#29).
- Local continuity lives in `.agent/PLAN.md` and `.agent/HANDOFF.md`; they do
  not travel with a fresh clone, which is why this file is committed.
