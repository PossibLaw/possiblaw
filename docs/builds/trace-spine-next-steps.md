# Trace Spine — Implementation Plan for M4, M5, C3

Written 2026-07-27, at the close of the work landed in PRs #24–#29.
Audience: the next coding agent or engineer picking this up cold.

---

## Where things stand

**All nine units are merged to `main`.** Nothing from this work is outstanding;
you are starting from a clean, green baseline, not a half-landed branch.

| PR | Unit(s) | Merge commit |
|---|---|---|
| #24 | M1 — trace store core | `b960342` |
| #25 | A1 anchoring, A2 spec + verifier, C0 `requestedBy` | `a078546` |
| #26 | A3 receipt meta bounds, M2 receipt↔trace binding | `cdc79c4` |
| #27 | C1 context provenance, C2 provenance-derived floor | `39ae510` |
| #28 | M3 static lane resolution | `ef140ef` |
| #29 | Dev setup + this plan | `8b94b4d` |
| #30 | `bin/smoke-trace` end-to-end check, wired into `bin/verify` | (open) |
| #31 | **M4** — run poller + durable cursor | (this PR) |

**1005 tests across eight components, 0 failures on Node 24.18.0.**

Verified end-to-end against a live gate process before merge: egress performed
→ receipt carried `traceId` + `traceSha256` → trace store held the matching
per-matter partition → the receipt's `traceSha256` equalled the record's
`contentSha256` → `tools/verify-receipts.mjs` accepted the chain.

**UPDATE 2026-07-27 (later): C3 IS COMPLETE AND MERGED.** Shipped as PRs
#37 (schema + fail-closed loader), #38 (the fold + enforcement at approval
resume), #40 (startup wiring). Design spec: `docs/superpowers/specs/
2026-07-27-c3-matter-access-registry-design.md`. Runbook:
`docs/workflows/matter-access.md`. Live test procedure:
`docs/operator-test-checklist.md` section I.

**One unit remains: M5.** M4 is built but still unscheduled (below).

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

## M4 — Paperclip run poller — SHIPPED (this PR)

`trace-store/src/poller.ts` + `cursor.ts`, 22 tests. Reconstructs the run
skeleton — agent assignment, timing, work products, delegation, cost — from
what the control plane already exposes.

**One decision deliberately left open: nothing schedules it.** A launcher hook,
a cron, or on-demand from firm-overview are all defensible and the choice has
operational consequences (poll frequency vs. control-plane load, and who owns
the failure when a poll silently stops). That belongs to whoever wires it, not
to the PR that built the mechanism.

The design notes below are retained because they explain *why* it is shaped the
way it is — particularly the cursor, which is the part most likely to be
"simplified" into a bug.

### What was built

- Cursor is a **set of emitted source ids**, not a timestamp watermark. Clocks
  move backwards, two items can share a second, and a paused matter can gain an
  item *older* than one already emitted. There is a test for that case.
- Cursor is written **after** the records it accounts for: a crash between the
  two re-emits (visible duplicate), the reverse order drops records (invisible
  gap). In an audit trail, prefer the duplicate.
- Ids are namespaced by kind (`wp:` / `sub:`) so a work product and a sub-issue
  sharing an id cannot collide.
- Polled records carry a `work-product` contextRef and never the `connector`
  ref the gate sink writes, so a reader can distinguish an action the gate
  **witnessed at a control point** from one **reconstructed from the system
  being audited**. Different evidential weight.
- Cost is attributed **once per matter**, not divided across steps — the
  control plane reports per-matter cost and splitting it would invent
  precision.
- A closed config returns before any network call.

### Original contract (retained for reference)

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

## C3 — User→matter access registry — SHIPPED (PRs #37, #38, #40)

**Everything below is retained as the original contract.** What was actually
built differs in three ways worth knowing before touching it:

1. **The principal is the APPROVER, not the requester.** The original sketch
   assumed a human principal that does not exist: the gate authenticates agents,
   `EgressMeta` has no user field, and C0's `requestedBy` was declared but set by
   none of the four `performAndReceipt` call sites. The one verified human in the
   path is `approvals.decidedByUserId`, which paperclip authenticates — an
   injected agent cannot forge it. So C3 enforces at approval resume.
2. **Two orthogonal authorities, and decision authority does NOT imply matter
   entitlement.** An owner can approve a wire on a matter they cannot read
   (the human gate shows only a hash). If seniority implied entitlement, C3
   would hole the ethical walls `--add-wall` exists to build.
3. **Enforcement is opt-in** (`enforcement: "on"` in `matter-access.json`),
   because the roster ships deny-all and enforcing it unpopulated would refuse
   every human-gated egress. This is the one place C3 is deliberately not
   strictly fail-closed. A firm that never flips the switch gets no enforcement.

Denial semantics also changed on operator ruling: **no fabricated answers.** A
screened matter says it is screened; only a genuine not-found returns not-found.
Hiding existence was rejected — a lawyer may legitimately need to know they are
screened in order to raise it.

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

**M5 is what remains.** C3 and M4 are done; M5 deserves the most care and now
benefits from a fully exercised trace spine.

Still open, and unchanged: **nothing schedules M4's poller.** It is built and
inert. A launcher hook, a cron, or on-demand from firm-overview are all
defensible; the choice has operational consequences (poll frequency vs.
control-plane load, and who owns the failure when a poll silently stops).

**Also open — four staged benchmarks with no adapters.** `layer/evals/datasets/`
holds ACORD, LEDGAR, MAUD and UNFAIR-ToS with fetch scripts and METADATA, but
`eval-harness/src/benchmarks.ts` registers only `cuad` and `lab`, so
`./bin/eval run --benchmark ledgar` cannot work. Each needs a loader in
`eval-harness/src/adapters/` plus a `BENCHMARKS` entry, following `cuad.ts`.
They are four different task shapes — classification (LEDGAR, UNFAIR-ToS),
multiple-choice reading comprehension (MAUD), structured field extraction
(ACORD) — so the grader, not the loader, is the real work. Licences differ:
LEDGAR/MAUD/UNFAIR-ToS are CC BY 4.0; **ACORD is research/evaluation only and
must not be redistributed or used commercially.**

---

## Decisions already taken, and why

Do not re-litigate these silently. If one turns out wrong, change it
deliberately and say so.

| Decision | Status |
|---|---|
| Two stores, not one — receipts hash-only and shareable, traces content-bearing and perimeter-bound | ACCEPTED |
| Trace capture defaults OFF, fail-closed on every malformed value | ACCEPTED |
| `hashes-only` proves which prompt ran without storing it | ACCEPTED |
| `capture: full` requires ≥1 `contentRoles` — content nobody may read is liability with no benefit | ACCEPTED |
| Content retention 90 days; record + hash retained forever | **DEFAULT, not a decision** — a firm-policy call nobody has made yet |
| Tracing is fail-soft; every other control fails closed | ACCEPTED |
| Role denial is redaction, not an error path | ACCEPTED |
| Confidentiality is raise-only, including provenance contributors | ACCEPTED |
| M5 adapter wrapper is in scope — customer-tenant deployments need prompt access | APPROVED by the operator |
| NOT adopting a compile-to-logic + SAT solver for policy | ACCEPTED — determinism is the requirement; a lookup table over 6 boundaries × 4 decisions is more auditable than a solver |

## Open questions for the operator

0. **RESOLVED 2026-07-27 — retention.** The operator specified: **5 years for a
   law firm**; legal departments set it by their own policy (90 days to several
   years); and a **litigation hold** must retain per-matter, indefinitely,
   overriding the clock. None of that exists yet — today it is a single global
   `retentionDays: 90`. Tracked as **R1**, spec section 9 of the C3 design doc.
   The sharp edge: a hold that can be silently lifted is worse than none, so
   placement *and* lifting must both be receipted with separation of duties.
   Sequence R1 after C3 — it reuses the same receipted-override machinery.

0b. **RESOLVED 2026-07-27 — email recipient allowlist. Not building it.**
   Operator ruling: recipients are decided by the firm and the user. C3 checks
   the *approver*, not the *recipient*, so "prove no client communication went
   to a non-matter recipient" remains unprovable, and that is accepted.

1. **Retention default (90 days).** Superseded by item 0 above.
2. **Email recipient allowlist.** Dropped early as an email-triage concern,
   which was right on safety grounds. The verification lens later reframed it:
   the human gate is pre-action but *not deterministic*, so "prove no client
   communication went to a non-matter recipient" is not currently provable.
   Whether that reopens it is a firm call.
3. **Scheduling for M4's poller** (above).

## Where this work came from

An evaluation of `github.com/cmtopbas/Sentinel-Gateway`, requested to see
whether anything was worth copying. **Verdict: copy nothing** — a two-file
prototype with no tests, tokens not bound to the calling agent, bypassable
path/URL/SQL filters, and a global cross-matter memory readable by every agent,
which is hostile to ethical walls by design.

Its value was diagnostic. It made visible that we had excellent records of
*what left the building* and almost none of *how the decision was reached*.
Everything in this document followed from that observation.

## Working notes

- `nvm use` before anything. On Node 22 eight tests fail spuriously.
- `pnpm -C <component> test` per component; there is no root test runner.
- Do not commit `.agent/*` or `.claude/history.md` — gitignored by contract.
- Keep PRs small. The work above was landed as six stacked PRs (#24–#29),
  each 1–3 commits, merged bottom-up. Do the same rather than one large branch.
- Register any NEW package in `bin/verify` PACKAGES *and* the CI workflow's
  install list. A runtime contract check fails the build otherwise — this cost
  a full red round across all six PRs when trace-store was added without it.
- Local continuity lives in `.agent/PLAN.md` and `.agent/HANDOFF.md`; they do
  not travel with a fresh clone, which is why this file is committed. If you
  learn something durable, put it HERE, not only there.

### Traps that have already cost time

- **`pnpm file:` snapshots a directory dependency** at install time. Caused
  `ERR_MODULE_NOT_FOUND` at gate startup while every unit test passed. Use
  `link:` for in-repo packages. `bin/smoke-trace` now catches this class.
- **`Buffer.from(s, "hex").buffer` exposes Node's shared 8 KB pool**, not just
  your bytes. Use `Uint8Array.from`.
- **`pkill -f <pattern>` matches your own shell** when the pattern appears in
  the command line, killing the process running the script. Kill by recorded
  PID, or by port via `ss -lntp`.
- **A failed `git cherry-pick` leaves HEAD unchanged**, so a following
  `git commit --amend` silently rewrites the *previous* commit. Check
  `git log` parentage rather than trusting the command sequence.
- **`git commit -m` with unescaped quotes** in a long message half-executes it
  as shell. Use `-F <file>`.
- **Receipt `meta` is bounded** (4096 B total, 512 chars/string, 8 deep). A new
  meta writer with an unbounded string makes `append()` throw — truncate at the
  write site, see `boundedErrorMessage`.
- **Unit tests did not catch either integration bug** in this work. Both needed
  a real process. Run `bin/smoke-trace` before claiming done.
