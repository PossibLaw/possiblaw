# Matter Isolation A1 + Firm Overview — Design

**Date:** 2026-07-02
**Status:** APPROVED by operator (three-section walkthrough, this session).
**Decision lineage:** `docs/designs/matter-isolation.md` — Architecture **A**
(opt-in walls, company-per-walled-client), mode **A1 + Firm Overview**,
upstream **not now**. Operator chose **all-in one build** (walls +
authenticated multi-lawyer mode + per-lawyer client lists +
approve-from-overview) over phasing.
**Posture:** layer-not-fork. The `paperclip/` submodule stays pinned
(`c91a0623`) and is never modified. Everything below is launcher, new
standalone packages, and docs.

## 1. Problem

Any agent holding the company-scoped key can read every client's matter
(`paperclip/server/src/routes/authz.ts:44`), and paperclip records no agent
reads — cross-client access is unpreventable AND undetectable (S1 finding
G-1). Real ethical screens also bind **humans**: a screened lawyer must not
see the walled client's matters at all. Meanwhile the firm needs one global
"everything in flight" view, which per-company dashboards would fragment
(paperclip's `Dashboard.tsx` renders one `selectedCompanyId` at a time; no
cross-company issues endpoint exists).

## 2. Goals

1. A conflicts-screened client can be **walled** so that no agent outside the
   wall can read its matters (hard 403, even prompt-injected), and no
   screened lawyer can see it (paperclip UI or overview).
2. The firm keeps **one global board**: issues in flight + pending approvals
   + deliveries across every client the viewing lawyer is authorized for,
   deep-linking into paperclip's UI.
3. Lawyers authenticate individually; **membership = client list**; approvals
   can be decided from the overview as the authenticated lawyer.
4. A solo operator on `local_trusted` gets the global board with zero auth
   setup (implicit board).
5. Walls are **opt-in exceptions**: the main company holds the whole practice
   unchanged; day-to-day UX without walls is untouched.

## 3. Non-goals

- Per-matter granularity inside one company (that is upstream option B —
  declined for now; revisit only if operator posture changes).
- Blocking malicious **local processes** (requires hosted `authenticated`
  deployment; documented floor, unchanged).
- Managing memberships/invites in our overview UI (v1 uses paperclip's own
  CompanyAccess/CompanyInvites pages).
- Receipt-level delivery detail in the per-lawyer overview (receipts files on
  disk are whole-firm; surfacing them per-lawyer would bypass paperclip
  authz — deferred as enrichment).
- Remote (non-loopback) access to the Firm Overview server.

## 4. Architecture (four components)

### 4.1 `--add-wall "<Client Name>"` (launcher command)

Run against a **running** instance (walls arise mid-life). Sequence:

1. **Prefix preflight:** derive the issue prefix (first three A–Z letters of
   the client/org name) and check it against existing companies
   (`GET /api/companies`). Collision → precise error naming the conflicting
   company; nothing created. (Upstream's `createCompanyWithUniquePrefix`
   retry is dead code at the pin — `services/companies.ts:127-156`; distinct
   prefixes are our responsibility.)
2. **Import** the full package (all 179 agents — operator decision: full
   capability per wall) as a **new company** on the same server, reusing the
   existing import body build (`target: new_company`, `newCompanyName`).
3. **Per-wall gate proxy:** spawn a dedicated gate-proxy process for the new
   company — next free port (allocated from `--gate-port` upward), own
   receipts chain (`~/.possiblaw/gate-receipts/<data-dir-basename>-<prefix>/`),
   `PAPERCLIP_COMPANY_ID` bound to the walled company. Agents in the wall get
   their own `GATE_PROXY_URL` via the existing post-import PATCH mechanism.
4. **Per-company facade config** (when `--firm-facade` was active):
   `firm-facade-mcp.<prefix>.json` (mode 600) — fixes the verified overwrite
   collision on the fixed filename.
5. **Routines:** provision `matter-intake-sweep` (and other launcher-provisioned
   sweeps) for the new company via the PR #13 REST mechanism.
6. **Registry:** append the wall to `$DATA_DIR/walls.json`
   (`{ name, companyId, prefix, gatePort, receiptsPath, facadeConfig,
   createdAt, status }`). The registry is a **cache**; the companies API is
   the source of truth (lost/corrupt registry → rebuild from
   `GET /api/companies` + re-derive wiring).

**Idempotent + resumable:** re-running `--add-wall` with an existing wall
name detects the company and repairs missing wiring (gate proxy down, facade
config absent, routines unprovisioned) instead of duplicating.

**Restart:** the launcher's normal startup reads `walls.json` and brings up
one gate proxy per registered wall (before agents wake), not just the main
company's.

### 4.2 Gate proxy: one process per company (decision)

Chosen over a multi-tenant rebuild. Rationale: the hash-chained receipts have
a single-writer invariant that per-process preserves structurally; the gate
proxy is the most security-critical layer component and this approach changes
**none of its core** — the launcher parameterizes the existing env contract
(`GATE_PROXY_PORT` / `GATE_RECEIPTS_PATH` / `PAPERCLIP_COMPANY_ID`,
`gate-proxy/src/index.ts:26-36`); walls are exceptional (single digits), so
process count stays trivial; per-wall egress credentials become possible
later. Trade-off accepted: N processes/ports/PID files to manage — owned by
the launcher + registry.

### 4.3 `firm-overview/` (new standalone package)

Small loopback-only web server (pattern: `gate-proxy/`, node:test, tsc,
stdlib-lean). Serves the global board and proxies its API calls to paperclip
**with the viewing lawyer's own credential**.

**Data flow** (poll ~15–30s, per-company fan-out):
- `GET /api/companies` — paperclip filters to the lawyer's memberships
  (`routes/companies.ts:91-101`); on `local_trusted` implicit board sees all.
- Per company: issues in flight (`GET /api/companies/:companyId/issues`),
  pending approvals, work products (deliveries feed). Company-level
  approvals/work-products listing vs per-issue fan-out is spike item S3.
- Merge → one board grouped by client: issue, assignee agent, status, last
  update; global pending-approvals queue; recent deliveries per client.
- Every row deep-links `${PAPERCLIP_PUBLIC_URL}/:companyPrefix/...`
  (facade-proven shape, `mcp-servers/firm-facade/src/deeplink.ts:5`).

**Lawyer connection:** one-time authorization of the overview against the
lawyer's paperclip account — paperclip's existing user CLI-auth token flow
(`routes/access.ts:2502-2633`) is the candidate mechanism (spike S2).
Credentials held in memory for the session only. On `local_trusted`, no
setup: implicit board.

**Approve/Reject from the overview:** POST to paperclip's own decide
endpoint **as the authenticated lawyer** (spike S4 confirms endpoint +
payload). Paperclip enforces authorization and records the decision exactly
as its native UI would. The overview adds a confirmation step, stores no
approval state, and caches nothing.

**Per-client degradation:** a failing company fan-out renders an error chip
for that client only; the rest of the board stays live. Expired credential →
re-auth prompt.

### 4.4 Authenticated mode (launcher + runbook)

- Launcher option to start paperclip in `authenticated` deployment mode
  (exact config knob = spike S1; mode switch verified to exist at
  `middleware/auth.ts:24-34`).
- Bootstrap: first-admin/board-claim flow (paperclip `BoardClaim` +
  board-auth service); then lawyers are invited per company — **main company:
  everyone; walled company: the screened team only** — via paperclip's
  CompanyInvites/CompanyAccess UI.
- Runbook doc: creating a wall, inviting the team, what a screened lawyer
  sees (nothing), solo-mode differences.

## 5. What each principal can do

| Principal | Main company | Walled company (not on team) |
|---|---|---|
| Agent (main company key) | full read/write per existing authz | **403 everything** |
| Agent (walled company key) | **403 everything** | full read/write within the wall |
| Lawyer on the client team | per membership | sees + acts (own login) |
| Screened lawyer | per membership | **invisible** (not listed, 403 direct) |
| Solo operator (`local_trusted`) | everything (implicit board — existing, documented) | everything |

## 6. Security invariants (each becomes a test)

1. Agent keys stay company-scoped; nothing broader is ever minted for an
   agent. Cross-company agent read → 403 (live e2e).
2. The overview does **zero authorization filtering of its own** — every
   upstream call carries the individual lawyer's credential; paperclip
   decides. No shadow ACL exists in layer code.
3. The overview holds per-lawyer credentials in memory only; no
   super-credential; loopback bind only.
4. Approvals remain human-only: agents and the facade still cannot approve;
   the overview approve path is an authenticated human against paperclip's
   endpoint.
5. One gate proxy per company; one receipts chain per proxy (single-writer
   preserved); egress credentials live only in gate-proxy processes.
6. Facade configs are per-company files, mode 600, company-scoped keys.
7. Shared firm memory across walls stays safe via the 0.36.0 fail-closed
   sanitizer (client-fact-free by construction); one `--business` slug shared
   by default.

## 7. Spikes (resolve before build tasks; UNCONFIRMED until receipted)

- **S1** — exact paperclip config knob/env for `authenticated` deployment
  mode + first-admin bootstrap path at the pinned commit.
- **S2** — user-credential mechanism for the overview: CLI-auth token flow
  (`routes/access.ts:2502-2633`) vs session-cookie forwarding; token
  lifetime/revocation (`/cli-auth/me`, `/cli-auth/revoke-current`).
- **S3** — company-level listings for pending approvals and work products
  (else per-issue fan-out; `GET /issues/:id/approvals` at issues.ts:3068 and
  `GET /issues/:id/work-products` at issues.ts:2407 confirmed per-issue).
- **S4** — approval decide endpoint + payload shape for a user actor (the
  facade spike mapped these for the 403 case; confirm the allow case).
- **S5** — free-port allocation + PID/log file conventions for N gate
  proxies under one data dir; health-check loop reuse.
- **S6** — `--teams`-subset import interaction with `--add-wall` (declined
  for v1 walls — full package — but must not break the main import path).

## 8. Eval walkthrough (gates implementation — repo TDD contract)

**Happy path.** Given a running firm with the main company and the overview
connected, when the operator runs `--add-wall "Conflicted Client"`, then a
new company exists with its own gate proxy (own port + receipts chain),
facade config file, and provisioned routines; `walls.json` records it;
the overview shows both clients' issues, approvals, and deliveries merged,
grouped by client, with working deep links into paperclip.

**Edge.** Given an existing company whose prefix collides with the new wall
name, when `--add-wall` runs, then it errors precisely (naming the
collision) and creates nothing. Given a full instance restart, when the
launcher starts, then every registered wall's gate proxy is back up before
agents wake, and a lost `walls.json` rebuilds from the companies API.

**Failure/security.** Given a walled company's agent (company-scoped key),
when it attempts any read of a main-company issue, then paperclip returns
403 (live disposable e2e). Given a screened lawyer's login, when they open
paperclip or the overview, then the walled client appears nowhere, and a
direct decide attempt on a walled approval returns 403. Given one company's
fan-out failing, when the overview polls, then that client shows an error
chip and every other client stays live.

## 9. Testing

- `firm-overview/`: node:test suite (fan-out merge, per-client degradation,
  credential handling, approve confirmation flow) + tsc clean.
- Launcher: `bash -n` + extended python self-tests (`walls.json` handling,
  prefix preflight, per-wall env derivation).
- Gate proxy: existing 439-test suite unchanged (core untouched); new
  launcher-level tests for N-proxy wiring.
- Live disposable e2e on the 3199/3899 convention: wall creation, 403
  proof, overview merge, approve-as-lawyer. **Port 3100 (operator's live
  server) is never touched.**

## 10. Deferred / follow-ups

- Receipt-level delivery enrichment in the overview (whole-firm receipts vs
  per-lawyer authz needs a design of its own).
- Membership management from the overview (v1: paperclip UI).
- Remote/hosted overview access.
- Upstream read-audit proposal (operator: not now).
