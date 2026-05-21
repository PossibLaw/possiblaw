# FOUNDATION.md — How PossibLaw layers onto paperclip

## Why a layer, not a fork

PossibLaw exists to demonstrate legal-business operations on top of an AI control plane. Forking paperclip would mean absorbing its entire release cadence, resolving upstream merges by hand, and permanently diverging from improvements in the base runtime. A layer approach keeps PossibLaw's value — its agents, skills, workflows, and guardrails — in `layer/` where it can evolve independently. Upstream paperclip improvements are pulled in by bumping the submodule pointer; no internal paperclip files are ever modified. This also makes the architecture legible: everything under `layer/` is PossibLaw's, everything under `paperclip/` is upstream.

---

## How paperclip is wired

paperclip is included as a **git submodule** at `paperclip/`. The submodule is pinned to a specific upstream commit (see "Pinned paperclip commit" below). The `paperclip/` directory is never modified directly.

### Bump procedure

To advance to a newer paperclip release:

```bash
git -C paperclip fetch
git -C paperclip checkout <new-sha>
git add paperclip
git commit -m "chore: bump paperclip submodule to <new-sha>"
```

Always verify the new SHA in FOUNDATION.md after bumping.

---

## Pinned paperclip commit

| Field | Value |
|---|---|
| SHA | `c91a06232625d1939858fcdfbdc0c9b3a64a8296` |
| Pinned on | 2026-05-20 |
| Source | `git -C paperclip rev-parse HEAD` |

---

## Paperclip extension-point inventory

All stability ratings are **UNCONFIRMED** pending a Sprint 0 deep-dive into paperclip's source.

| Primitive | Paperclip API surface (UNCONFIRMED) | Stability rating (UNCONFIRMED) | PossibLaw use-case |
|---|---|---|---|
| Identity & access | UNCONFIRMED | UNCONFIRMED | Lawyer / paralegal identity; role-based routing |
| Org chart / roles | UNCONFIRMED | UNCONFIRMED | Chief Counsel → Lead → Specialist hierarchy |
| Work / task system | UNCONFIRMED | UNCONFIRMED | Routing legal tasks through the agent tree |
| Heartbeat execution | UNCONFIRMED | UNCONFIRMED | Periodic compliance checks, deadline monitoring |
| Budgets | UNCONFIRMED | UNCONFIRMED | Token / cost budgets per matter |
| Governance / approvals | UNCONFIRMED | UNCONFIRMED | Human-in-the-loop sign-off on finalized work product |
| Workspaces | UNCONFIRMED | UNCONFIRMED | Per-matter or per-client isolation |
| Plugins | UNCONFIRMED | UNCONFIRMED | MCP server integration (legal research, court dockets) |
| Model adapters | UNCONFIRMED | UNCONFIRMED | Swapping underlying LLM per task type |
| Company portability | UNCONFIRMED | UNCONFIRMED | Multi-org / white-label legal practice support |

**All stability ratings here are UNCONFIRMED pending a Sprint 0 deep-dive into paperclip's source.**

---

## Risks if a primitive is internal / unstable

If a paperclip primitive turns out to be internal (not part of its public API surface), two mitigations apply:

1. **Vendor it into `layer/`** — reimplement the minimum interface needed in `layer/` so PossibLaw is not coupled to a paperclip internal. This is the preferred path for primitives that are small and well-understood.
2. **Contribute upstream first** — if the primitive is valuable to the broader paperclip ecosystem, open a PR upstream to stabilize/expose it before depending on it in PossibLaw.

In either case, document the decision in CHANGELOG.md and record the primitive as UNCONFIRMED until verified.

---

## How Sprint 1a stubs the integration

Sprint 1a runs **standalone** against `layer/` content only. It does not invoke the paperclip runtime. The CLI (`bin/possiblaw`) resolves commands directly from `layer/agents/`, `layer/skills/`, and `layer/workflows/` using the local file tree.

Full paperclip integration — handing off work items to paperclip's task system, using its org chart for role routing, applying its budget primitives — is wired **progressively from Sprint 2 onward**, once the Sprint 0 extension-point inventory is confirmed.

This means Sprint 1a output (agent routing, NDA draft, guardrail stubs) is fully demonstrable without paperclip running at all.
