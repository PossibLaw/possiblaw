# Ethical Walls & Firm Overview

How to isolate a conflicts-screened client from the rest of the firm, and how
to see everything in flight across every client from one dashboard. Both are
**opt-in**: a firm or in-house team that never triggers a conflicts screen
never touches either feature, and day-to-day usage of a single company is
unchanged.

## The default: one company holds the whole practice

PossibLaw imports the package as **one Paperclip company** by default. Every
agent in that company can read every matter inside it — that is intentional
(chief-of-staff needs to route across practices) and unrestricted *within*
the company. Client folders, `--teams`, and the `Project` field on an issue
are organizational conveniences, not isolation boundaries — see
`docs/known-limitations.md` → "Agent read scope is company-wide."

## When to wall a client — and when not to

**Wall when a real conflicts screen requires it** — a lateral hire, a
concurrent-representation conflict, a former-client matter — where specific
people (and every agent) must be structurally prevented from seeing one
client's matters, not just asked not to look.

**Don't wall** for:
- Ordinary client/matter organization — use the `Project` field or a client
  folder inside the main company.
- A team subset that simply doesn't do a certain kind of work — use
  `--teams` at import time.
- "Just in case" isolation with no active screen — walls cost a second gate
  proxy, a second receipts chain, and (per the table below) real operator
  overhead. Reserve them for an actual conflicts determination.

A wall is a **separate Paperclip company**: its own 179-agent roster, its own
gate proxy, its own receipts chain. It gives you a hard 403 between the wall
and everything else, but **not** per-matter granularity inside either
company — see "What a wall does not do" below.

## Walling a client: `--add-wall`

Run this against your **already-running** firm (`./bin/possiblaw` in another
shell or a background process). `--add-wall` never starts a server itself.

```bash
./bin/possiblaw --add-wall "Conflicted Client Inc" --variant codex
```

`--variant <name>` is **required** — omit it and the command exits `2`
before any network call:

```
--add-wall requires --variant <name> — the walled company's agents get this
variant's adapter lanes; use the same variant as your running firm (see
--list-variants)
```

Use the **same variant your running firm uses** unless you deliberately want
the walled company on a different model lane.

### The prefix rule

The wall's issue prefix is derived from the client name: strip everything
that isn't an A–Z letter, uppercase what's left, take the first three
letters. `"Conflicted Client Inc"` → `CON`. A name with fewer than three
letters (e.g. `"Q & A"`) is rejected before any network call (exit `2`).

Before creating anything, the launcher fetches `GET /api/companies` and
checks the derived prefix against every existing company's `issuePrefix`. A
collision — including re-running `--add-wall` with the **same** client name a
second time, since that company already holds the prefix — exits `3` with a
precise error naming the conflicting company, and creates nothing:

```
prefix collision: CON already used by company "Conflicted Client, LLC"
```

Re-running `--add-wall` for a wall that already exists is how you **repair**
it (see below) — it is not an error to worry about; it is the intended path
when a wall's gate proxy died or its facade config is missing.

### What gets created

A successful run creates, in order:

1. **A new company** on the same Paperclip server, importing the **full
   179-agent package** — walls get the complete practice, not a subset (there
   is no `--teams`-style partial wall in v1).
2. **A dedicated gate proxy** for that company only — never the firm's own
   proxy. Port is allocated upward from `--gate-port-base` (default: the same
   default as `--gate-port`); receipts land at
   `~/.possiblaw/gate-receipts/<data-dir-basename>-<PREFIX>/receipts.jsonl` —
   a separate hash-chained file, preserving the single-writer invariant per
   proxy.
3. **A per-wall facade config** — only with `--firm-facade` —
   `<data-dir>/firm-facade-mcp-<PREFIX>.json` (mode 600), named by prefix so
   it can never collide with the firm's own `firm-facade-mcp.json` or another
   wall's config.
4. **Routines** — `matter-intake-sweep` is provisioned for the new company
   the same way it is for the main company, unless you pass `--no-routines`.
5. **A registry entry** in `<data-dir>/walls.json`: `name`, `companyId`,
   `prefix`, `gatePort`, `receiptsPath`, `facadeConfig`, `status`,
   `createdAt`. This file is a **cache** — `GET /api/companies` is the source
   of truth, so a lost or corrupted `walls.json` is recoverable, not fatal.

On success the launcher prints:

```
wall "Conflicted Client Inc" (CON) active — company <uuid>, gate :<port>
screened team setup: invite ONLY this client's lawyers to the new company
(dashboard → Company Settings → Members)
```

The paperclip page that manages membership is titled **Company Access**
(`/:companyPrefix/company/settings/access`); the invite page is **Company
Invites** (`/:companyPrefix/company/settings/invites`). On `local_trusted`
(the default — no `--auth-mode authenticated`), Paperclip has no signed-in
users to invite yet; the membership step matters once you turn on
authenticated mode (below).

### Exit codes

| Code | Meaning |
|---|---|
| `2` | Bad input: missing `--variant`, an unknown `--variant`/`--demo`, or a client name with fewer than three A–Z letters. |
| `3` | Issue-prefix collision — including re-running `--add-wall` for a wall that already exists. |
| `4` | No running instance found at `--port` (health check failed); or an attach/API failure after the health check passed — a non-200 from `GET /api/companies` (401/403 on an authenticated instance hints at `--api-key`), the import itself failing, no company id in the import response, or the `walls.json` registry write failing. In the later cases the wall may be **partially live** — re-run `--add-wall` with the same name to repair it. |

### Re-running `--add-wall` is how you repair a wall

`--add-wall` is idempotent by design: running it again for an existing wall
name detects the company (via the prefix collision) and is meant to repair
missing wiring — a dead gate proxy, an absent facade config, unprovisioned
routines — rather than duplicate anything. If a partial failure (exit `4`)
leaves a wall half-wired, re-running the same command is the fix.

### Against an authenticated instance: `--api-key`

If your firm runs in `--auth-mode authenticated` (see below), `--add-wall`
needs a bearer token to call the running instance's API:

```bash
./bin/possiblaw --add-wall "Conflicted Client Inc" --variant codex \
  --api-key pcp_board_<your-token>
```

A missing or invalid key on an authenticated instance surfaces as exit `4`
with an explicit hint: `authenticated instance? pass --api-key <pcp_board_…>
(minted via the CLI-auth flow)`. Mint one the same way a lawyer connects the
Firm Overview (see "Firm Overview" below) or via
`pnpm -C paperclip paperclipai auth login`.

### What a wall does not do

- **No per-matter granularity inside a company.** A wall isolates one
  **company** from another; it does not let you isolate one matter from
  another matter that share a company. See
  `docs/known-limitations.md` → "Agent read scope is company-wide."
- **No partial-package walls.** Every wall gets the full 179-agent roster.
- **No remote/hosted overview.** Firm Overview is loopback-only regardless of
  auth mode — see below.

## Restart re-wiring <!-- verify-after-T4 -->

> This section documents launcher behavior from a concurrently in-flight
> task. Re-verify against the shipped `bin/possiblaw` before relying on it.

Relaunching `./bin/possiblaw` against the **same `--data-dir`** reads
`walls.json` and brings every registered wall's gate proxy back up — one
process per active wall — before agents wake, in addition to the firm's own
gate proxy. You do not need to re-run `--add-wall` after a restart; it exists
to *create* a wall, not to keep it alive across restarts. Passing
`--no-gate-proxy` skips this the same way it skips the firm's own proxy. A
wall whose `walls.json` entry has `status` other than `active` is left alone.

## Authenticated mode: `--auth-mode authenticated` <!-- verify-after-T4 -->

> This section documents launcher behavior from a concurrently in-flight
> task. Re-verify against the shipped `bin/possiblaw` before relying on it.

By default the launcher runs Paperclip in `local_trusted` mode
(`--auth-mode local_trusted`, the default) — any local process can act as an
implicit board user with no sign-in. `--auth-mode authenticated` turns on
Paperclip's real login (`PAPERCLIP_DEPLOYMENT_MODE=authenticated`) and is
the mode a firm needs once it wants **screened lawyers to genuinely be
invisible** to a walled client rather than merely "not looking":

```bash
./bin/possiblaw --variant codex --auth-mode authenticated
```

The launcher generates and persists a `better-auth` secret at
`<data-dir>/better-auth.secret` (mode 600) the first time authenticated mode
runs against a data dir, and reuses it on every later launch of that same
dir — don't hand-edit or regenerate it, or existing sessions/tokens break.

### Fresh authenticated data dir: bootstrap the first admin

A data dir that has **never** run as `local_trusted` has no implicit board
user to promote. Bootstrap the first admin from the paperclip CLI before or
after the first authenticated launch:

```bash
pnpm -C paperclip paperclipai auth bootstrap-ceo
```

This mints a one-time `bootstrap_ceo` invite; the person who accepts it
becomes the instance's first admin.

### Migrating an existing `local_trusted` data dir

If you're moving a firm that started `local_trusted` into authenticated
mode, Paperclip detects that the instance still only has the implicit local
board as admin and prints a one-time **board claim** URL to the server
console on that launch:

```
BOARD CLAIM REQUIRED
This instance was previously local_trusted and still has local-board as
the only admin.
Sign in with a real user and open this one-time URL to claim ownership:
http://127.0.0.1:<port>/board-claim/<token>
```

The launcher surfaces this as a milestone line if it sees the URL in the
server log. Open it, sign in as the real first admin, and claiming promotes
that user to instance admin with owner membership on every existing
company — including any walls already created.

### Inviting the team, per company

Once there's a signed-in admin, invite lawyers **per company** from
Paperclip's own **Company Invites** page
(`/:companyPrefix/company/settings/invites`) — PossibLaw does not add its own
membership UI (v1 uses Paperclip's):

- **Main company: everyone.** Every lawyer at the firm who isn't specifically
  screened off a wall.
- **Walled company: the screened team only.** Invite exactly the lawyers
  cleared to work the walled matter — nobody else.

A lawyer not invited to the walled company cannot see it in Paperclip's own
dashboard (it's absent from `GET /api/companies`, which is
membership-filtered for non-admin users) **and** cannot see it in Firm
Overview, for the same reason — the overview adds no ACL of its own; every
row it shows came from a call made with the connected lawyer's own
credential.

## Firm Overview

A small, loopback-only dashboard that merges "everything in flight" —
issues, pending approvals, and recent deliverables — across every company
the connected lawyer can see, with working deep links back into Paperclip.
It is **read-mostly with two actions** (approve / reject), and does **zero**
authorization filtering of its own: it forwards every call with the lawyer's
own credential and mirrors whatever Paperclip decides.

### Launch

```bash
PAPERCLIP_BASE_URL=http://127.0.0.1:3100 pnpm -C firm-overview start
```

| Env var | Required | Default | Purpose |
|---|---|---|---|
| `PAPERCLIP_BASE_URL` | yes | — | The Paperclip instance to read from. This is your **one running firm** — walls live as more companies on this same server, not on separate servers, so you point Firm Overview at one URL regardless of how many walls exist. |
| `FIRM_OVERVIEW_PORT` | no | `3860` | The overview's own listening port. |
| `PAPERCLIP_PUBLIC_URL` | no | = `PAPERCLIP_BASE_URL` | Base used to build deep links back into the Paperclip dashboard (e.g. for a hosted Paperclip reachable at a different public URL than the loopback address the overview itself calls). |

The server binds `127.0.0.1` only — it is never reachable over the network,
by design. Open `http://127.0.0.1:3860` (or your `FIRM_OVERVIEW_PORT`).

### Connect flow

Click **Connect**. This is a one-time authorization of the overview against
**your own** Paperclip account — no credential is shared, copied, or stored
on disk:

1. The overview calls Paperclip's `POST /api/cli-auth/challenges`
   (unauthenticated by design) and gets back a pending board token plus an
   `approvalUrl`.
2. The page shows an **Open approval** link to that URL. Open it and sign in
   to Paperclip as yourself (on `local_trusted`, no sign-in exists — see the
   solo note below).
3. Approving in Paperclip's UI resolves the challenge. The overview polls
   until it observes `status: "approved"`, then holds the resulting
   `pcp_board_<48 hex characters>` bearer token **in memory only**, for the
   life of the overview process — it is never written to disk.
4. The button changes to **Connected** with a **Disconnect** button. Every
   subsequent board fetch and every approve/reject action is made with this
   token, as **you**, so Paperclip's own membership-based authorization
   decides exactly what you see and can act on.

The token is valid for **30 days**. Clicking **Disconnect** only clears the
in-memory token in the overview process — it does not revoke the token on
Paperclip's side. To actually revoke it (lost laptop, offboarding, or you
just want it dead now), call Paperclip directly with that same token:

```bash
curl -X POST http://127.0.0.1:3100/api/cli-auth/revoke-current \
  -H "Authorization: Bearer pcp_board_<your-token>"
```

If the token expires or is revoked while the overview is still holding it,
the next board poll gets a 401 from Paperclip; the overview treats that as
a stale session, clears it, and asks you to reconnect — it never fabricates
a "still connected" state.

### What a screened lawyer sees

Nothing. A lawyer who isn't invited to a walled company never sees that
client anywhere: not as a row in the merged board, not in the per-client
error state, not as a name in a deep link. The overview only ever knows
about the companies `GET /api/companies` returns for **your** token, and
that list is Paperclip's own membership filter — the same filter that keeps
the client out of Paperclip's native dashboard for that lawyer.

### Solo operator on `local_trusted`

If you're a solo operator and never turned on `--auth-mode authenticated`,
there's nothing to connect. `GET /api/companies` on a `local_trusted`
instance returns every company via the implicit local board, so the overview
shows the whole firm — every wall included — with **zero setup**. This is
the same floor documented for the gate proxy and the firm-facing MCP facade:
`local_trusted` trusts any local process, walls or no walls.

### The merged board

Per company, the overview fetches: the dashboard tiles, in-flight issues
(`backlog`, `todo`, `in_progress`, `in_review`, `blocked`), agents (to resolve
assignee names), and pending approvals (`pending` and `revision_requested`).
Deliverables are pulled from the work products of the **10 most recently
updated in-flight issues per client** — a bounded fan-out, not a full-history
scan; if a client has more than 10 in-flight issues, the panel shows a
truncation indicator rather than silently dropping older deliverables. If one
client's fetch fails, that client renders as a single error chip and every
other client on the board stays live — a bad company never takes down the
whole board.

### Approve / reject from the overview

Every approval row's Approve/Reject button POSTs to the overview, which
proxies straight through to Paperclip's own decide endpoint using your
token. The overview never synthesizes a success: whatever status and body
Paperclip returns (200 on success, 403 if you lack the membership to decide
it, etc.) is what you see. Approvals remain human-only in every sense that
matters elsewhere in this repo — no agent, facade, or automation path can
call this endpoint; only a lawyer who clicked Connect and is looking at the
overview in a browser can.

## Shared firm memory across walls

`--business <slug>` is orthogonal to walls. Running

```bash
./bin/possiblaw --add-wall "Conflicted Client Inc" --variant codex \
  --business acme-legal
```

reuses the **same** `businesses/acme-legal/` firm-memory store the main
company already uses — the walled company's agents get the same firm-wide
preferences overlay. This is safe by construction, not by policy: the
0.36.0 continuous ethical-wall sanitizer (`learning-loop/`) keeps everything
that reaches `firm-memory.md` client-fact-free — client-identifying content
is stripped or the memory file fails closed and is never overlaid at all —
so sharing one memory store across a wall boundary cannot leak one client's
facts into another's agent context. See `docs/known-limitations.md` →
"Memory propagation is next-launch, not live (v1)" for the store's other
honest limits.

## See also

- `docs/known-limitations.md` → "Agent read scope is company-wide (no
  per-matter isolation)" and "Firm Overview (v1)" for the honest residual
  limits of both features.
- `docs/operator-walkthrough.md` → "Walling a conflicted client" and "Firm
  Overview" for the same material in walkthrough voice.
- `docs/operator-test-checklist.md` → "Walls + Firm Overview (authenticated
  multi-lawyer)" for the operator-side live test this build defers.
