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

This preflight is fail-closed: if any returned company lacks a valid
`issuePrefix`, the launcher refuses to create the wall. The credential-free
`bin/verify` suite also checks the pinned Paperclip source contract that
membership filters `GET /api/companies`, exposes `issuePrefix`, and derives
it from the company name. A Paperclip pin change therefore fails loudly
instead of silently disabling the collision control.

A collision on the **same** client name means "already walled" — the command
deliberately creates nothing and does not re-wire the existing wall. A dead
wall gate proxy comes back on the next successful relaunch (see "Restart
re-wiring" below), not by re-running `--add-wall`.

### What gets created

A successful run creates, in order:

1. **A new company** on the same Paperclip server, importing the **full
   179-agent package** — walls get the complete practice, not a subset (there
   is no `--teams`-style partial wall in v1).
2. **A dedicated gate proxy** for that company only — never the firm's own
   proxy. Port is allocated upward from `--gate-port-base` (default: the same
   default as `--gate-port`); receipts land at
   `~/.possiblaw/gate-receipts/<data-dir-basename>-<custody-id>-wall/<company-id>/receipts.jsonl`
   — a separate hash-chained file, preserving the single-writer invariant per
   proxy. Its key, PID, and log files are likewise named with the immutable
   Paperclip company ID, not the three-letter display prefix.
3. **A per-wall facade config** — only with `--firm-facade` —
   `<data-dir>/firm-facade-mcp-<company-id>.json` (mode 600), named by
   immutable company ID so it cannot collide with the firm's own
   `firm-facade-mcp.json` or another wall's config.
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
| `4` | No running instance found at `--port` (health check failed); or an attach/API failure after the health check passed — a non-200 from `GET /api/companies` (401/403 on an authenticated instance hints at `PAPERCLIP_API_KEY` / `--api-key-file`), the import itself failing, no company id in the import response, or the `walls.json` registry write failing. In the later cases the wall may be **partially live** — see "Repairing a half-wired wall" below. |

### Repairing a half-wired wall

The launcher treats the steps after the import as best-effort, so an exit
`4` (or a warning) can leave a wall's company live but its wiring
incomplete. What actually repairs each piece:

- **Gate proxy failed to start** (warn-only at creation): the wall is still
  recorded in `walls.json`, so the next **successful relaunch** of the
  launcher brings the proxy up (see "Restart re-wiring" below).
- **`walls.json` write failed** (exit `4` after a live import): the wall's
  company and gate proxy are live but unrecorded, so a relaunch will not
  restore its proxy. The launcher's error output suggests re-running
  `--add-wall` — but a same-name re-run stops at the prefix collision (exit
  `3`, the company already exists), so in practice restore the registry
  entry by hand: the record fields (`name`, `companyId`, `prefix`,
  `gatePort`, `receiptsPath`, `facadeConfig`, `status: "active"`,
  `createdAt`) are all printed in the command's output and derivable from
  `GET /api/companies`.
- **Facade config absent or routines unprovisioned**: no automated repair
  path yet — re-create the facade key/config or the routine via the
  Paperclip UI/API (see `--firm-facade` in `docs/operator-walkthrough.md`
  and the routines section of `docs/workflows/matter-intake.md`).

### Against an authenticated instance: private board-key input

If your firm runs in `--auth-mode authenticated` (see below), `--add-wall`
needs a bearer token to call the running instance's API:

```bash
./bin/possiblaw --add-wall "Conflicted Client Inc" --variant codex \
  --api-key-file "$HOME/.possiblaw/board-api-key"
```

The key file must be a regular file owned by the current user, mode `0600`,
with exactly one link and no final-component symlink. The launcher also
accepts `PAPERCLIP_API_KEY`; choose one source, not both. Literal
`--api-key <token>` is rejected because command arguments are visible in
process listings on many shared hosts. A missing or invalid key on an
authenticated instance surfaces as exit `4` with an explicit credential
hint. Mint a board token via `pnpm -C paperclip paperclipai auth login`, then
store it with an editor or password-manager workflow that does not put the
token on a command line. Finally, enforce its permissions:

```bash
chmod 600 "$HOME/.possiblaw/board-api-key"
```

### What a wall does not do

- **No per-matter granularity inside a company.** A wall isolates one
  **company** from another; it does not let you isolate one matter from
  another matter that share a company. See
  `docs/known-limitations.md` → "Agent read scope is company-wide."
- **No partial-package walls.** Every wall gets the full 179-agent roster.
- **No remote/hosted overview.** Firm Overview is loopback-only regardless of
  auth mode — see below.

## Restart re-wiring

Relaunching `./bin/possiblaw` against the **same `--data-dir`** reads
`walls.json` and brings every registered wall's gate proxy back up — one
process per active wall, right after the firm's own gate proxy. You do not
re-run `--add-wall` after a restart; it exists to *create* a wall, not to
keep it alive across restarts. Passing `--no-gate-proxy` skips this the same
way it skips the firm's own proxy. A wall whose `walls.json` entry has
`status` other than `active` is left alone, and a malformed entry is skipped
with a warning — a bad registry row never aborts the launch.

**The guarantee is conditional: the launcher must reach the restore stage.**
When it attaches to an already healthy non-production server with existing
companies, it reuses the existing company and skips import. When it starts a
new server process, it imports before restoring walls, so an import failure
still stops before the restore stage. Two cases need particular care:

- **Same data dir + the same (or default) `--org-name`** → import fails
  HTTP 500: the server derives the same issue prefix from the same org name
  and hits its unique-prefix constraint (the "Repeated `--target new`
  imports collide on the issue prefix" limitation in
  `docs/known-limitations.md`). **Workaround: relaunch with a distinct
  `--org-name`** — any unused name works. The import is additive, so each
  successful relaunch under a new name adds another company to the
  instance; the walls come back regardless of which name the relaunch used.

  ```bash
  ./bin/possiblaw --variant codex --data-dir <same-data-dir> \
    --org-name "Acme Legal (restarted)"
  ```

- **Authenticated launch without a board credential** → company discovery or
  import fails with 401/403. Supply `PAPERCLIP_API_KEY` or
  `--api-key-file <0600-path>`; the main import path and `--add-wall` use the
  same private curl configuration. Production deliberately refuses
  reattachment to an unattested pre-existing process.

## Authenticated mode: `--auth-mode authenticated`

By default the launcher runs Paperclip in `local_trusted` mode
(`--auth-mode local_trusted`, the default) — any local process can act as an
implicit board user with no sign-in. `--auth-mode authenticated` turns on
Paperclip's real login (`PAPERCLIP_DEPLOYMENT_MODE=authenticated`) and is
the mode a firm needs once it wants **screened lawyers to genuinely be
invisible** to a walled client rather than merely "not looking":

```bash
./bin/possiblaw --variant codex --auth-mode authenticated
```

Any value other than `local_trusted` or `authenticated` is rejected before
any pre-flight or filesystem work (exit `2`: `--auth-mode must be
'local_trusted' or 'authenticated' (got: '<value>')`).

The launcher generates and persists a `better-auth` secret at
`<data-dir>/better-auth.secret` (mode 600) the first time authenticated mode
runs against a data dir, and reuses it on every later launch of that same
dir — don't hand-edit or regenerate it, or existing sessions/tokens break.
Two caveats on that secret: it necessarily sits in the paperclip server's
process env, which agent processes inherit — the launcher warns about this
at every authenticated boot (see `docs/known-limitations.md` →
"Authenticated mode: `BETTER_AUTH_SECRET` is visible to agent processes") —
and even a `--dry-run` combined with `--auth-mode authenticated` writes the
persistent secret file (the secret is generated before the server boots,
upstream of the dry-run exit).

### First migration boot before a board token exists

An authenticated boot gets you the persisted secret, a healthy server in
authenticated mode, and (on a migration boot) the board-claim milestone.
Before the first real board user claims the instance, no board token exists
to authorize company discovery/import, so that first launcher run can still
stop with HTTP 403. Run the server manually long enough to claim/bootstrap
the board and mint a token, reusing the persisted secret (this mirrors the
launcher's own server invocation):

```bash
env PAPERCLIP_DEPLOYMENT_MODE=authenticated \
    BETTER_AUTH_SECRET="$(cat <data-dir>/better-auth.secret)" \
    PORT=<port> \
    pnpm -C paperclip paperclipai onboard --data-dir <data-dir> --bind loopback --yes
```

Note the manual boot starts only the paperclip server — no gate proxies. For
membership and visibility work (claims, invites, the overview) that is
enough; do not run agent egress against a manually-booted instance without
also starting the gate proxies.

The practical migration order is therefore: **launch and import on
`local_trusted` first** (create walls there too — `--add-wall` needs no key
on `local_trusted`), run one authenticated boot to mint the secret and
surface the claim URL, boot manually, claim and mint a board token, then
invoke the launcher with `--api-key-file` while that non-production server
is healthy so it reattaches without re-importing and restores the gates.

### Fresh authenticated data dir: bootstrap the first admin

A data dir that has **never** run as `local_trusted` has no implicit board
user to promote. Bootstrap the first admin from the paperclip CLI:

```bash
pnpm -C paperclip paperclipai auth bootstrap-ceo
```

This mints a one-time `bootstrap_ceo` invite; the person who accepts it
becomes the instance's first admin. After acceptance, mint a board token and
run the launcher with `PAPERCLIP_API_KEY` or `--api-key-file`; authenticated
company discovery and import then carry that credential.

### Migrating an existing `local_trusted` data dir

If you're moving a firm that started `local_trusted` into authenticated
mode, Paperclip detects that the instance still only has the implicit local
board as admin and prints a one-time **board claim** URL to the server
console (wrapped in ANSI color codes). The launcher strips the ANSI codes
and surfaces the clean URL from its log as a milestone:

```
AUTHENTICATED MODE — claim board ownership (first admin): http://127.0.0.1:<port>/board-claim/<token>?code=<code>
```

When no claim URL is present (already claimed, or a genuinely fresh dir),
the launcher prints a fallback milestone pointing back at this runbook:
`authenticated mode active; manage lawyer accounts via company invites (see
docs/workflows/ethical-walls.md)`.

Open the claim URL, sign in as the real first admin, and claiming promotes
that user to instance admin with owner membership on every existing
company — including any walls already created. Paperclip mints a fresh
claim URL on each boot while the local board is still the only admin, so a
URL that expired with a stopped server is not lost — the next boot (manual
or launcher) prints a new one.

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
