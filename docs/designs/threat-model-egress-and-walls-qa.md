# Threat Model Q&A — Gate-Proxy Egress Credentials & Ethical Walls

**Date:** 2026-07-03 (immediately after the 0.38.0 matter-isolation A1 + Firm
Overview merge, PR #19).
**Status:** Reference record of an operator/agent security discussion, saved
verbatim for future deployment decisions. Claims were verified against the
pinned submodule (`c91a0623`) and the 0.38.0 build during the session.
**Related:** `docs/designs/matter-isolation.md` (decision + ground truth),
`docs/known-limitations.md` (trust floors, `BETTER_AUTH_SECRET` subsection),
`docs/workflows/ethical-walls.md` (runbook).

---

## Q1 — What mechanism prevents an agent from bypassing the gate proxy and directly accessing egress credentials if it gained access to the launcher's environment?

The defense isn't that agents are *blocked* from reading the launcher's
environment — it's that the environment agents actually inherit **never
contains the credentials in the first place**:

1. **Scrub at spawn.** The launcher enumerates the egress credential
   variables (`EGRESS_CRED_VARS` → `EGRESS_SCRUB_ARGS`) and starts the
   paperclip server with them explicitly removed from its child environment
   (`bin/possiblaw`, the onboard `exec env` carries the scrub args).
   Adapter-spawned agents inherit the *server's* process env — codex-local's
   `execute.ts` merges `process.env` — so what reaches an agent is the
   already-scrubbed set. There is no `GMAIL_TOKEN` sitting there to find.
2. **Exactly one unscrubbed child.** The gate proxy is deliberately the only
   child spawned without the scrub — an invariant re-verified during the
   `start_gate_proxy_for` refactor review (every `exec env` in the file was
   checked for it).
3. **The launcher's environment is transient.** The launcher *exits* after
   the Ready banner (observed directly in the e2e). Post-startup, the
   credentials exist in exactly one long-lived place: the gate-proxy
   process.
4. **Broker, not vault.** Agents hold only `GATE_PROXY_URL` (a plain env
   var, harmless by design). The proxy performs the egress *itself* after
   classify → `gate-policy.yaml` policy → anonymize → human gate → citation
   gate; credentials never transit back across that HTTP boundary in either
   direction. Every attempt — including blocked ones — lands on the
   hash-chained receipts, so probing the gate is *detectable*, not just
   refusable.

So a mis-prompted or prompt-injected agent operating at the tool/API level
has no path to the raw credentials: nothing in its env, nothing returned by
the proxy, and tampering with the receipts chain breaks the hash chain.

### The floor it doesn't defend — and says so

On a `local_trusted` deployment, **everything runs as one macOS user**. An
agent whose adapter sandbox permits arbitrary shell execution can do
anything your user can:

- Read the gate-proxy's environment directly (`ps eww` works on your own
  processes on macOS), or the operator's shell env, or `~/.codex` / CLI auth
  state.
- Exfiltrate over raw sockets — the gate proxy is a broker you route
  through, not a network firewall; it cannot intercept outbound TCP it never
  sees, and out-of-band exfil leaves no receipt.
- The `BETTER_AUTH_SECRET` finding from the 0.38.0 build is the same class:
  what *must* live in the server's env is readable by whatever the server
  spawns — shipped as a boot warning plus a known-limitations subsection
  rather than pretending to fix it.

This floor is documented deliberately (`docs/known-limitations.md`, and
ground-truth #6 in `docs/designs/matter-isolation.md`): the layer's
guarantees bind agents at the prompt/API level; stopping a hostile *process*
on the same box requires things outside layer-not-fork's reach.

### What narrows the residual gap today, and what would close it

Currently narrowing it: adapter sandboxes (codex defaults to a read-only
sandbox), the walls (a compromised walled agent's blast radius is one
client), and receipts-based detection for anything that does go through the
gate. Options to close it further: run `authenticated` + hosted/
user-separated (different UID for agent execution — an upstream/deployment
change, not a launcher patch), OS-level egress control (macOS network filter
allowing only the gate-proxy process outbound), or an upstream env-allowlist
for adapter spawns — recorded as a follow-up when the `BETTER_AUTH_SECRET`
issue surfaced.

**Short version:** bypass-by-reading-the-environment is structurally closed
for the environments agents actually get; bypass-by-arbitrary-code on the
same UID is an acknowledged trust floor, documented, partially mitigated by
adapter sandboxes and walls, and only truly closable at the deployment or
upstream layer.

---

## Q2 — What is the downside to narrowing it further?

The downsides are different for each option, and they share one structural
problem: each buys marginal protection against an attacker who has *already*
won bigger prizes, while charging real costs against the product's core
posture.

**Hosted / user-separated `authenticated` deployment.** The "real" fix, and
the most expensive. It kills the one-command clone-to-demo story — the
product's main adoption asset — and replaces it with infrastructure work: a
second UID or host for agent execution, cross-UID file sharing for the repo
checkout and `businesses/` store, TLS and base-URL configuration. Worse, it
breaks the subscription-auth model the whole variant system is built on:
`codex`/`claude` CLIs authenticate per-user with interactive device flows
into `~/.codex`/`~/.claude`, so a separate agent UID can't reuse your login —
you'd be pushed back toward per-call API keys, the billing surface the
project explicitly rejected early on. It's the right call *eventually* — as
a deployment tier for firms running real multi-lawyer walls, not as the
default.

**OS-level egress control.** The practical problem is that everything here
is the same binary: the gate proxy, the paperclip server, and agent tool
calls are all `node`/`python`/`curl` running as you. macOS's per-app
firewalls key on executable identity, so "only the gate proxy gets outbound"
isn't expressible without a signed Network Extension — at which point you're
building an endpoint-security product, not a launcher flag. And there's a
hole no firewall closes: agents *must* reach model providers (that's the
job), so "send the privileged text to the LLM API as a prompt" remains an
exfil path that per-destination filtering can't distinguish from legitimate
work — that's what the CONFIDENTIAL_TO_CLOUD gate and local-model lanes
address at a different layer. Meanwhile every new connector or variant
changes the rule set, and rule breakage presents as mysteriously flaky
agents.

**Upstream env-allowlist for adapter spawns.** Cheapest and least
disruptive — but it's not ours to ship (paperclip core, pre-coordination
norm, upstream engagement currently declined; the fork-patch alternative was
already rejected as a hidden fork of security-critical code). And it's
partial: it closes env *inheritance*, but a shell-capable agent on the same
UID can still `ps eww` the gate-proxy process or read `~/.codex` directly.
Upstream coordination cost for a fence with two open gates.

**Tightening adapter sandboxes** fights the product itself: agents need to
write work products, run pandoc, call the deadline engine and learning-loop
CLIs. Clamping to read-only breaks the atomic-work workflows; tuning
per-agent across 179 agents × 11 variants is a permanent maintenance tax.

**The cross-cutting point:** the marginal attacker here is an agent already
executing arbitrary hostile code as your user. That attacker has *also* got
the repo, the firm-memory store, your CLI auth tokens, and your documents —
egress credentials are one loss among many. Below that line, the honest
control is the one already documented: treat agent code and skills as
trusted, keep provenance on what you import (the license-gated vendoring
tool exists for exactly this), and rely on receipts for detection of
in-band attempts. Half-hardening also carries a brand risk specific to this
repo: its trust posture is built on *honest* limitations — shipping a
partial fence and calling the floor closed would be worse than the
documented floor.

**Where to draw the line:** keep `local_trusted` + documented floor for
solo/demo use; treat "a firm runs multi-lawyer walls on real client
matters" as the trigger that justifies paying the hosted/user-separated
cost — the point where Model Rule 1.6 exposure outweighs the convenience,
and the same threshold the matter-isolation design doc flags (crux question
3). Until then, the cheapest defensible increment is none of the four
above — it's finishing the operator-side §H test and keeping the "agents
are trusted code" line loud in the docs.

---

## Q3 — What does paying the hosted/user-separated cost me in detail? If I host in my tenant, is the risk exfiltration — or a conflicts risk (a lawyer seeing client files they aren't authorized for)?

The risk taxonomy is mostly right, but worth being precise, because the two
risks live in different places and hosting fixes them unevenly.

### The risk model, corrected slightly