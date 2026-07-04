# Matter Isolation (Ethical Walls) — Architecture Decision

**Status:** DECIDED 2026-07-02 (operator) — **A (opt-in walls), mode A1 + Firm
Overview; upstream: not now.** See Decision section. Research complete
2026-07-02; all claims file:line-verified against the pinned submodule
(`c91a0623`). Build pending (design/spec first).
**Origin:** S1 finding G-1 of the 2026-07-01 atomic-work security review — any
agent holding the company-scoped key can read every client's matter
(`paperclip/server/src/routes/authz.ts:44` is the entire agent-side check).
Sprint δ (0.36.0) hardened egress/ingress; this decides the read side.

## Verified ground truth

1. **Reads have no sub-company guard.** Every issue/document/comment/
   work-product/activity/search GET checks only same-company (22 GET handlers
   in `routes/issues.ts` alone). Writes DO have a finer guard
   (`assertAgentIssueMutationAllowed`, issues.ts:1314) — the natural precedent
   a read ACL would mirror; it just doesn't exist for reads.
2. **Paperclip records no agent reads.** `activity_log` is mutation-only;
   `issue_read_states` is user-only; the HTTP log silences bulk-read routes
   and logs detail reads without actor attribution
   (`middleware/http-log-policy.ts:3-12`). A layer-side sweep **cannot detect
   cross-matter reads after the fact** from any existing artifact.
3. **The company boundary is real, enforced, and multi-company is first-class**
   (agent keys carry one companyId; UI has a `CompanySwitcher`).
4. **Importer prefix collision:** `createCompanyWithUniquePrefix` has a retry
   loop that is dead code at the pinned commit (drizzle wraps the PG error;
   `isIssuePrefixConflict` checks the top-level code — `services/companies.ts:127-156`).
   Zero-code workaround: the prefix derives from the first three A–Z letters of
   the org name, so distinct `--org-name` values import cleanly side by side.
5. **Plugins are barred from auth** (`PLUGIN_SPEC.md:99`); upstream's roadmap
   has no isolation/tenancy milestone; core contributions require
   pre-coordination.
6. **Floor for every option:** on a `local_trusted` instance, any local
   process gets implicit board access (`middleware/auth.ts:24-34`). No option
   here stops a malicious local process; that requires `authenticated` mode +
   hosted deployment.

## Options

### A — one paperclip company per walled client (layer-only)
The launcher imports the package once per walled client; the existing company
boundary IS the wall. **A1**: one instance, N companies, one dashboard with
the company switcher. **A2**: N data dirs / N servers — works today with zero
code (already the documented interim pattern).

- **Guarantees:** mis-prompted agent — hard 403; prompt-injected agent —
  structurally cannot read across the wall (within its own client's company it
  still reads everything, which is the same client). Local process — open.
- **Verified breakages (all launcher wiring, not architecture):**
  - *Gate proxy is the sharpest (A1):* one proxy binds one
    `PAPERCLIP_COMPANY_ID` and one receipts chain keyed by data-dir basename
    (`gate-proxy/src/index.ts:35-65`, `bin/possiblaw:1191,1851`). Two
    companies in one data dir → either mis-wired approvals or two writers on
    one chain (hash-chain break). A1 needs per-company gate port + receipts
    path + company binding.
  - *Firm facade:* per-company config filename needed (second launch would
    overwrite `$DATA_DIR/firm-facade-mcp.json`).
  - *Prefix preflight:* derive + collision-check org-name prefixes at launch
    (see ground-truth 4).
  - *Ops multiplier:* N × 5 routine wirings, N receipts chains to anchor,
    N API-key copies, import minutes per wall (`--teams` subset cuts this).
- **What does NOT break (verified):** firm-wide functions are per-matter
  delegators — no implemented workflow does cross-client rollups today;
  conflicts checking is procedural (operator-confirmed) and crosses no wall
  as implemented; **firm memory need not fragment** — `businesses/<slug>` is
  keyed by `--business` slug, not company, and memory content is
  client-fact-free by construction (0.36.0 wall), so N walled launches can
  share one slug.
- **Effort:** A2 = zero code. A1 = S/M launcher pass + multi-wall runbook.

### B — per-matter ACL upstream in paperclip
Minimal credible design: reuse `principal_permission_grants` (generic
principalType/principalId + `scope` jsonb — **zero new tables**) with
enforcement at ~6 service-layer chokepoints (issues, documents, comments,
work-products, activity, search) plus a read-side twin of
`assertAgentIssueMutationAllowed`, deny-as-404. Matter granularity —
the only option that fits "dozens of matters each needing walls."
- **Honest scope: L**, on a timeline this repo does not control (no upstream
  roadmap item; pre-coordination required). Interim state = today (or A).
- Coverage bugs are the classic risk (search/activity/attachments misses);
  default-open-vs-closed semantics touch every existing deployment.

### B-lite — fork-patch applied at launch (REJECTED by analysis)
Technically plausible (theme-overlay precedent) but fails FOUNDATION.md's
stated legibility rationale — a runtime source patch to the authz path is a
hidden fork of the most security-sensitive code, re-validated by hand at
every submodule bump. The repo has declined this move twice on smaller
stakes (sidebar virtualization; learning-loop lock events).

### C — accept + compensate (status quo hardened)
Everything shipped in 0.36.0 is egress/ingress-side. **None of it prevents or
even observes a cross-matter read** (ground-truth 2). Against a
prompt-injected agent, C reduces exfiltration bandwidth but not what the
agent has seen — and Model Rule 1.6 exposure is about access, not only
egress. Defensible only for single-client / in-house deployments where no
wall is ethically required.
- *Discovered upgrade (bounded value):* the server honors a pre-set
  `PAPERCLIP_API_URL` (`server/src/index.ts:666,678`), so the launcher could
  interpose a read-logging reverse proxy without touching paperclip — but
  agents also inherit `PAPERCLIP_RUNTIME_API_URL` pointing at the real
  address, so an injected agent can go direct. Full audit for compliant
  traffic; a wall against mis-prompted agents only. Useful as C's detection
  layer or as evidence for the upstream read-audit proposal.

## Comparison

| | A | B (upstream) | B-lite | C |
|---|---|---|---|---|
| Mis-prompted agent | **Blocked today** | Blocked when landed | Blocked while patch holds | Open |
| Prompt-injected agent | **Blocked cross-wall** | Blocked if coverage complete | Same | Open (egress friction only) |
| Detection of violations | N/A (prevented) | 403s loggable | Same | **None** (audit-proxy partial) |
| Granularity | Client cluster | Matter | Matter | — |
| In repo's control | **Yes** | No | Yes, at posture cost | Yes |
| Effort | A2: 0 / A1: S-M | L + wait | M + per-bump tax | 0 (S/M audit proxy) |

## Crux questions (operator)

1. **How many concurrently walled clients?** A is comfortable at 2–5,
   painful at 20+; per-matter walls at scale only fit B.
2. **Is automated cross-client work (conflicts screening, firm-wide finance
   rollup) real or planned?** Nothing implemented crosses clients today; if
   planned, the wall-crossing service must be designed WITH this decision.
3. **Deployment mode?** On single-machine `local_trusted`, walls bind agents
   only. If the wall must stop humans/software on the box, the fix is
   `authenticated` + hosted — which shifts the calculus toward B. The full
   cost/benefit of that move (what hosting buys, the same-UID agent tier it
   does *not* close, and the conflicts-vs-exfiltration taxonomy) is worked
   out in `docs/designs/gate-proxy-egress-and-conflicts-threat-model.md`.

## Recommendation (research verdict)

**Adopt A now** (A1 launcher pass; A2 documented as the zero-code fallback);
**file the B proposal upstream** without depending on it (include the
`principal_permission_grants` reuse, the chokepoint list, and the small
separable agent-read-audit event — the piece upstream is likeliest to accept
quickly); **reject B-lite**; **treat C as insufficient** for any multi-client
deployment — unpreventable and undetectable cross-client reads are the one
unacceptable steady state for a legal-privilege product.

## Decision

**Decided 2026-07-02 (operator, via clarifying Q&A):**

- **Architecture: A — as an opt-in capability, not a partition.** One main
  company holds the whole practice on one board, unchanged day-to-day. A
  client gets its own walled company ONLY when an ethical screen requires it.
  The operator's crux ("a firm wants to see everything in flight, not just
  one client") is satisfied because walls are the exception and because of the
  Firm Overview below. Humans/board always see everything under every option;
  the wall binds agent keys only.
- **A-mode: A1 + Firm Overview.** Walled clients run as additional companies
  on the same instance (company switcher). To preserve the firm-wide
  "everything in flight" view that per-company dashboards would fragment, the
  layer adds a read-only **Firm Overview** dashboard: fan out
  `GET /api/companies` (`server/src/routes/companies.ts:91`) →
  `GET /api/companies/:companyId/issues` (`server/src/routes/issues.ts:1779`),
  merge into one all-clients board, each row deep-linking into paperclip's UI
  via the facade-proven `${PAPERCLIP_PUBLIC_URL}/:companyPrefix/...` shape
  (`mcp-servers/firm-facade/src/deeplink.ts:5`). Human/board surface only —
  agents are never pointed at it and their keys stay company-scoped, so the
  wall holds. No cross-company issues endpoint exists upstream; the merge is
  layer work by design. A2 (N data dirs / N ports) remains the documented
  zero-code fallback until the A1 launcher pass ships.
- **Upstream proposal: not now.** Nothing filed to paperclip (operator
  explicitly does not want an upstream dependency or engagement). Revisit only
  if posture changes; the read-audit event remains the likeliest quick accept
  if it ever does.

**Build scope (operator chose ALL-IN, one build; design approved
2026-07-02):** the A1 launcher pass (`--add-wall`, per-company gate-proxy
port + receipts chain + company binding; per-company facade config filename;
org-name prefix preflight; `walls.json` registry) + the Firm Overview
package + `authenticated`-mode support with per-lawyer client lists
(membership-scoped visibility, `routes/companies.ts:91-101`) and
approve-from-overview as the authenticated lawyer. Approved spec:
`docs/superpowers/specs/2026-07-02-matter-isolation-a1-firm-overview-design.md`.
The `docs/known-limitations.md` read-scope rewrite shipped with the build
(CHANGELOG 0.38.0): cross-client agent reads are now preventable via opt-in
walls; within-company reads remain unrestricted.
