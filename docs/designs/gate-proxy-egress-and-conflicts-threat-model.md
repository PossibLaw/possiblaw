# Gate Proxy, Egress Credentials, and the Conflicts Threat Model

**Status:** Reference / discussion record. Captured 2026-07-03, immediately
after the matter-isolation A1 + Firm Overview build merged (PR #19 → `main`
@ `d382455`, CHANGELOG 0.38.0).
**Why this exists:** a full record of a security discussion about the
`gate-proxy/` module and the ethical-walls trust model, saved for the
hosted-deployment and upstream-user-separation decisions still ahead. All
mechanisms below were verified against the code as of this session; the
pinned submodule is `paperclip/` @ `c91a0623`.
**Related:** `docs/designs/matter-isolation.md` (the A1 decision),
`docs/known-limitations.md` (the shipped floor), the FINAL REVIEW entry in
`.superpowers/sdd/progress.md`.

---

## The opening question

> The `gate-proxy/` module centralizes egress credentials and routes them
> through policy checks in `companies/legal-operations/gate-policy.yaml`.
> What mechanism prevents an agent from bypassing the gate proxy and directly
> accessing egress credentials if it gained access to the launcher's
> environment?

The honest answer has two halves: a real structural mechanism, and a
documented floor it deliberately does not defend.

---

## The mechanism: credentials are never in any environment an agent inherits

The defense is not that agents are *blocked* from reading the launcher's
environment — it is that the environment agents actually inherit **never
contains the credentials**.

1. **Scrub at spawn.** The launcher enumerates the egress credential
   variables (`EGRESS_CRED_VARS` → `EGRESS_SCRUB_ARGS`) and starts the
   paperclip server with them explicitly removed from its child environment
   (`bin/possiblaw`, the onboard `exec env` carries the scrub args).
   Adapter-spawned agents inherit the *server's* process env (codex-local's
   `execute.ts` merges `process.env`), so what reaches an agent is the
   already-scrubbed set. There is no `GMAIL_TOKEN` there to find.
2. **Exactly one unscrubbed child.** The gate proxy is deliberately the only
   child spawned without the scrub — an invariant re-verified during the
   `start_gate_proxy_for` refactor review this session (the reviewer checked
   every `exec env` in the launcher for it).
3. **The launcher's environment is transient.** The premise "gain access to
   the launcher's environment" mostly cannot happen after startup, because
   the launcher *exits* after the Ready banner (observed directly in the
   e2e). Post-startup, the credentials live in exactly one long-lived place:
   the gate-proxy process.
4. **Broker, not vault.** Agents hold only `GATE_PROXY_URL` (a plain env var,
   harmless by design). The proxy performs the egress *itself* after
   classify → `gate-policy.yaml` policy → anonymize → human gate → citation
   gate; credentials never transit back across that HTTP boundary in either
   direction. Every attempt — including blocked ones — lands on the
   hash-chained receipts, so probing the gate is *detectable*, not just
   refusable.

So a mis-prompted or prompt-injected agent operating at the tool/API level
has no path to the raw credentials: nothing in its env, nothing returned by
the proxy, and tampering with the receipts chain breaks the hash chain.

---

## The floor it does not defend — and says so

On a `local_trusted` deployment, **everything runs as one macOS user**. An
agent whose adapter sandbox permits arbitrary shell execution can do anything
that user can:

- Read the gate-proxy's environment directly (`ps eww` works on your own
  processes on macOS), or the operator's shell env, or `~/.codex` / CLI auth
  state.
- Exfiltrate over raw sockets — the gate proxy is a broker you route
  *through*, not a network firewall; it cannot intercept outbound TCP it
  never sees, and out-of-band exfil leaves no receipt.
- The `BETTER_AUTH_SECRET` finding from this build is the same class: what
  *must* live in the server's env is readable by whatever the server spawns
  — shipped as a boot warning + a known-limitations subsection rather than a
  pretended fix.

This floor is documented deliberately (`docs/known-limitations.md`;
ground-truth #6 in `docs/designs/matter-isolation.md`): the layer's
guarantees bind agents at the prompt/API level; stopping a hostile *process*
on the same box is outside layer-not-fork's reach.

**What narrows the residual gap today:** adapter sandboxes (codex defaults to
read-only), the walls (a compromised walled agent's blast radius is one
client), and receipts-based detection for anything that does go through the
gate.

---

## Narrowing it further — the four levers and their downsides

The marginal attacker here is an agent **already executing arbitrary hostile
code as your user** — an attacker who has therefore also got the repo, the
firm-memory store, your CLI auth tokens, and your documents. Egress
credentials are one loss among many. Each lever buys protection against that
already-winning attacker at real cost to the product's posture.

### 1. Hosted / user-separated `authenticated` deployment (the "real" fix)
- Kills the one-command clone-to-demo story (the main adoption asset).
- Requires a second UID/host for agent execution, cross-UID sharing of the
  repo checkout and `businesses/` store, TLS + base URL.
- **Breaks subscription auth:** `codex`/`claude` CLIs authenticate per-user
  via interactive device flows into `~/.codex`/`~/.claude`; a separate agent
  UID cannot reuse the login → pushed toward per-call API keys, the billing
  surface the project rejected early.
- Right *eventually*, as a deployment tier for firms running real
  multi-lawyer walls — not as the default.

### 2. OS-level egress control
- Everything is the same binary (`node`/`python`/`curl` as you); macOS
  per-app firewalls key on executable identity, so "only the gate proxy gets
  outbound" is inexpressible without a signed Network Extension — that is
  building an endpoint-security product, not a launcher flag.
- Unclosable hole: agents *must* reach model providers, so "send the
  privileged text to the LLM API as a prompt" is an exfil path per-destination
  filtering cannot distinguish from legitimate work (addressed instead by the
  CONFIDENTIAL_TO_CLOUD gate + local-model lanes).
- Every new connector/variant changes the rule set; breakage looks like
  flaky agents.

### 3. Upstream env-allowlist for adapter spawns
- Cheapest and least disruptive — but not ours to ship (paperclip core,
  pre-coordination norm; operator said "not now" to upstream; fork-patch was
  already rejected as a hidden fork of security-critical code).
- Partial: closes env *inheritance*, but a shell-capable agent on the same
  UID can still `ps eww` the gate proxy or read `~/.codex` directly.

### 4. Tightening adapter sandboxes
- Fights the product: agents need to write work products, run pandoc, call
  the deadline engine and learning-loop CLIs. Read-only breaks the
  atomic-work workflows; per-agent tuning across 179 agents × 11 variants is
  a permanent maintenance tax.

**Brand risk cutting across all four:** this repo's trust posture is built on
*honest* limitations. Shipping a partial fence and calling the floor closed
would be worse than the documented floor.

**Where to draw the line:** keep `local_trusted` + documented floor for
solo/demo use; treat "a firm runs multi-lawyer walls on real client matters"
as the trigger that justifies the hosted/user-separated cost — the point
where Model Rule 1.6 exposure outweighs convenience (the same threshold as
matter-isolation crux question 3). Until then, the cheapest defensible
increment is *none* of the four — it is finishing the operator-side §H test
and keeping the "agents run trusted code" line loud in the docs.

---

## The risk is mostly conflicts, not exfiltration — the corrected taxonomy

Operator's framing: "It's not an exfiltration risk — it's a conflicts risk
inside the firm, a lawyer seeing client files they aren't authorized for."
Mostly right. Precisely:

**Conflicts risk (a human/agent seeing screened files)** — three tiers on a
hosted tenant:

1. **Lawyers through the UI/overview** — *solved by this build.* In
   `authenticated` mode membership is the wall: paperclip filters companies
   per login (`companies.ts:91-101`); switcher and Firm Overview inherit it;
   a screened lawyer sees nothing. Hosting is what *activates* this — the
   reason to pay the cost at all.
2. **Whoever operates the tenant** — instance admins bypass membership
   filtering by design; anyone with root/SSH reads the Postgres data dir,
   receipts, and on-disk secrets. The screen does not bind custodial access.
   This is normal, not a defect — paper-era firms are the same: IT/records
   staff have custodial access under a duty of confidentiality; screens bind
   the lawyers/staff *on the matter*. Implication: the tenant admin must be
   someone permissibly unscreened — an explicit policy decision.
3. **Agents with shell access** — *this is also a conflicts risk, not only
   exfiltration.* The wall is enforced at the API (company-scoped keys, hard
   403 — proven live). But agents run as children of the server process, same
   UID, and the whole firm's matters sit on that UID's disk in the Postgres
   data dir. A prompt-injected agent on the adverse client's matter that can
   run shell could read the screened client's files *from disk*, never
   touching the API, and fold what it learned into its work. This is the
   "access, not only egress" Model Rule 1.6 point. **Hosting alone does not
   close it — user separation does, and that is the upstream piece we cannot
   ship from this repo.**

**Exfiltration risk** — hosting does not meaningfully change it. A
shell-capable agent sends data out from your tenant as it could from your
laptop; the gate proxy governs the *sanctioned* channels either way. Hosting
*does* change network *ingress* surface (auth endpoints reachable from
outside) — managed by keeping exposure private (VPN/Tailscale) rather than
public.

---

## What "paying the hosted/user-separated cost" itemizes to

**Hosted `authenticated` in your tenant:**
- **Infra:** VM/container, persistent volume for the data dir, backups,
  supervision (systemd — the launcher is laptop-shaped, and production
  deliberately refuses to attach to a pre-existing unattested process),
  TLS + stable base
  URL if exposure is public (`authenticated` + explicit
  `PAPERCLIP_AUTH_PUBLIC_BASE_URL` enforced at boot; private/VPN exposure is
  much lighter).
- **Auth ops:** `BETTER_AUTH_SECRET` custody, `bootstrap-ceo` first-admin
  flow, per-company invites, 30-day board-key hygiene for overview
  connections.
- **The big economic one — model auth:** subscription CLIs authenticate via
  device flows tied to a human's machine. Headless tenant → realistically
  switch to the `codex-api`/`claude-api` variants: metered API billing + key
  management in-tenant, instead of the flat subscription the local posture
  assumed. The variant system supports this out of the box, but the cost
  model changes.
- **Loopback-by-design components:** firm-overview and gate proxy bind
  `127.0.0.1` deliberately. Remote lawyer access to the overview means
  fronting it (reverse proxy/tunnel) or a follow-up build to make it
  network-safe — today it trusts loopback.
- **Secrets:** egress credentials move from the laptop env into tenant
  secrets management.

**User separation on top (the agent-tier fix):** an upstream ask (spawn
agents under a different UID with no read of the data dir) + a permission
matrix to maintain (repo readable, work-product paths writable, data dir not
readable) + per-UID model auth. Real cost, blocked on upstream regardless.

---

## Bottom line

- **Bypass-by-reading-the-environment is structurally closed** for the
  environments agents actually get.
- **Bypass-by-arbitrary-code on the same UID is an acknowledged trust
  floor** — documented, partially mitigated by adapter sandboxes and walls,
  only truly closable at the deployment (hosted + user-separated) or upstream
  (env-allowlist / separate-UID spawn) layer.
- The dominant residual risk is **conflicts, not exfiltration**, and it does
  *not* reduce to "a lawyer seeing the wrong files" — the same-UID
  agent-on-disk path makes it a conflicts risk at the agent tier too.
- **Trigger for paying the hosted cost:** a firm running multi-lawyer walls
  on real client matters. Below that, `local_trusted` + the honest documented
  floor is the defensible posture.
- **Natural next step if heading hosted:** a hosted-deployment runbook
  (private exposure, `-api` variants, fronting the overview) — and the moment
  to revisit the deferred upstream conversation, since user separation is the
  one lever neither the launcher nor a layer patch can pull.
