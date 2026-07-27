# Roadmap & Known Scope

Last updated: 2026-07-27

This document says what PossibLaw controls today, who that is sufficient for,
and what is still open. It is written to be shown to a prospective operator
without editing. Where we do not have a good answer, it says so.

Two companion documents go deeper: `docs/known-limitations.md` (exhaustive,
engineering-level) and `docs/workflows/ethical-walls.md` (isolation mechanics).

---

## Who this fits today

The single biggest determinant of fit is **whether everyone in your
organization is allowed to see everything.**

| Your situation | Fit today |
|---|---|
| Solo or small firm — everyone sees every matter | **Good fit.** The read-scope limit below is not a limit for you. |
| In-house legal department — one client, the company | **Good fit.** Same reason. Internal need-to-know is a policy matter, not a conflicts screen. |
| Mid-size firm, no active conflicts screens | **Workable.** Use a wall per screened client if one arises. |
| Mid-size firm running formal screens | **Partial.** Walls give a hard boundary *between* clients. There is no per-matter boundary *inside* a wall. |
| Large firm with routine screens and need-to-know | **Not yet.** See "Confidentiality & need-to-know" below. This is the top item on the roadmap. |

If you are in the last row, we would rather tell you now than have you find
out during an engagement.

---

## Where we stand on verifiable agent action

Assessed against the five requirements in ICME Labs' *The State of Agent
Verification 2026*, which we did not author and which we think is a fair test.

| # | Requirement | Status |
|---|---|---|
| 1 | The check runs before the agent action | **Met**, for the actions we gate (see scope below) |
| 2 | The verdict is deterministic | **Met.** No model sits anywhere in the enforcement path |
| 3 | Someone outside the system can verify it | **Met.** RFC 3161 external timestamping (A1) plus a published spec and standalone verifier (A2) |
| 4 | The proof travels | **Met.** Per-matter Matter Trust Report, hashes only; checkable with no code or account of ours |
| 5 | It works without exposing the rules or the data | **Met.** Payload hashes and a policy digest, never contents |

### What "the actions we gate" means

The gate classifies eight tools, chosen because each has irreversible external
consequence:

```
send_email, share_external, upload_document   → third-party egress
query_external_model                          → confidential-to-cloud
file_court_document                           → court filing
sign_document                                 → signature
send_payment                                  → money movement
delete_external_resource                      → irreversible external op
```

Anything an agent does that is not one of these — drafting, reading a matter
file, delegating to a specialist — is **not** gated. That is a deliberate
choice: a small, complete, auditable choke point over a broad, shallow one. It
also means we describe what we do as *verified egress at the boundaries where
legal duty attaches*, not "verified agent action." The difference matters and
we would rather be precise about it.

Three egress paths are documented as **not** gated in v1: operator
notifications (Slack/Teams), a cloud-synced deliverables folder if you point
one at iCloud or Dropbox, and legal-research connectors (Westlaw, Lexis,
CourtListener). These are listed in `companies/legal-operations/gate-policy.yaml`
so the boundary is a reviewed decision rather than an accident. Closing them is
on the roadmap.

---

## Confidentiality & need-to-know — the honest position

**We do not have a complete answer for conflicts screening among legal
professionals, and we are not going to pretend otherwise.**

What is true today:

- **Within one workspace, agent read scope is company-wide.** Any agent can
  read any matter in that workspace. This comes from the underlying control
  plane, which has no per-matter read primitive, and we do not patch it.
- **Walls work, at client granularity.** `--add-wall` creates a genuinely
  separate workspace with its own agents, its own gate, and its own receipt
  chain. Crossing it returns a hard 403 enforced by the control plane, not by
  an assertion we add. In authenticated mode the same boundary binds humans.
- **There is no per-matter boundary inside a wall.** Two matters for two
  different clients in the same workspace are not isolated from each other.
- **Context provenance now raises the tier, within the limits of what agents
  declare.** An egress carries the matters that contributed context to it, and
  the confidentiality floor is the highest across all of them — so work filed
  under a standard matter that drew on a privileged one is treated as
  privileged, regardless of what the calling agent claimed. Declaring more can
  only raise the tier, never lower it. The residual gap is omission: an agent
  that fails to declare a source matter evades the raise. The trace store
  records the same references, so an omission is detectable after the fact even
  though it is not prevented.

**What this means in practice.** If everyone in your organization may see
everything — a solo practice, a small firm, an in-house department — none of
the above constrains you. If you run formal screens, use a wall per screened
client and understand that the granularity is the client, not the matter.

**What we are building.** C3 — a user→matter access registry checked outside
the model, so a request for work the requester is not entitled to is refused
by the gate rather than adjudicated by an agent. That is enforcement at the
outlet, not the source: it stops content reaching an unentitled person and
makes every attempt visible, but the agent can still read the underlying
matter, so a real conflicts screen still needs a wall.

---

## Shipped

- **Deterministic egress gate.** Boundary classification → policy decision →
  anonymize / human approval / block, all before the action runs.
- **Hash-chained receipts.** Tamper-evident, fail-closed on corruption; a
  corrupt chain returns an error rather than a falsely clean report.
- **External anchoring (A1).** The chain head is timestamped by an RFC 3161
  authority outside our trust domain, so the chain cannot be silently
  regenerated or backdated. Tokens verify with standard `openssl ts -verify`.
- **Independent verification (A2).** `docs/receipt-verification.md` specifies
  the format, canonical JSON, and hash construction precisely enough to
  implement a verifier in any language, with a worked example you can
  reproduce using nothing but `printf` and `openssl dgst`. A zero-dependency
  reference verifier ships at `gate-proxy/tools/verify-receipts.mjs` and is
  cross-checked against the producer in CI. Checking a chain requires no code
  of ours and no account with us.
- **Matter Trust Report.** Per-matter evidence bundle, hashes only, rendered
  as Markdown for a client, auditor, or court.
- **Citation gate.** Filings carrying legal citations are blocked until a
  citation verification bound to that exact text is registered. Optional
  authority-provenance flagging for cited-but-never-retrieved authorities.
- **Tier floor.** Confidential and privileged matters cannot reach a cloud
  lane whose contracted data terms do not permit them.
- **Ethical walls.** Client-granularity isolation with a separate workspace,
  gate, and receipt chain.
- **Execution trace spine (M1).** Records how a decision was reached — model,
  lane, timing, context and connector references, cost, and optionally the
  prompt itself. Default off; role-gated; retention purge strips content while
  preserving the record and its hash.

---

## In progress and planned

Ordered by cost of deferring, not by size.

### Evidence track

| | Item | Status |
|---|---|---|
| A1 | External RFC 3161 anchoring | **Shipped** |
| A2 | Published verification spec + standalone verifier, so checking a chain needs no code of ours | **Shipped** |
| A3 | Enforce the no-payload-content rule on receipt metadata rather than documenting it | **Shipped** |

### Trace track

| | Item | Status |
|---|---|---|
| C0 | Requesting human recorded alongside the acting agent | **Shipped** |
| M1 | Trace store core | **Shipped** |
| M2 | Bind traces into the receipt chain | **Shipped** |
| M3 | Static model-lane resolution | Planned |
| M4 | Run-skeleton reconstruction from the control plane | Planned |
| M5 | Adapter-level prompt capture, opt-in | Planned |

### Confidentiality track

| | Item | Status |
|---|---|---|
| C1 | Context provenance — record the source matter of every context pull | **Shipped** |
| C2 | Derive the confidentiality floor from provenance, so contamination raises the tier regardless of what the agent claims | **Shipped** |
| C3 | User→matter access registry, enforced outside the model, with receipted and time-bounded admin override | Planned |

C3 is enforcement at the outlet, not at the source: it stops content reaching
someone not entitled to it and makes every attempt visible, but the agent can
still read the underlying matter. A true conflicts screen still needs a wall.
We would rather ship an honest partial control than describe it as more than
it is.

### Coverage track

| | Item | Status |
|---|---|---|
| — | Gated notification tool, replacing the ungated Slack/Teams webhook | Planned |
| — | Proxied legal-research connectors | Planned, needs firm demand to prioritize |

---

## Deliberately not building

- **A solver-based rule engine.** Determinism is the requirement; a constraint
  solver is one way to get it. Our decision surface is six boundaries by four
  decisions — a lookup table is more auditable than a solver over the same
  space, and is already fully deterministic.
- **Our own timestamp or CMS verifier.** We produce standards-compliant
  evidence and let established tools verify it. Reimplementing a verifier
  would add risk without adding trust.
- **Prompt-level security instructions as a control.** Telling a model to
  ignore injected instructions is a mitigation, not a boundary. Controls live
  outside the model or they are not controls.
- **Patching the pinned control-plane submodule.** Where a limitation
  originates upstream, we document it rather than fork.
