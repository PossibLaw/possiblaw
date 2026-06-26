# Phase 3 — Firm-Facing MCP Facade — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: use `superpowers:subagent-driven-development` (or `executing-plans`) to implement task-by-task. Steps use `- [ ]` checkboxes. **This plan is for operator review BEFORE any code** — it opens with design decisions that need sign-off and a spike that must close before the build tasks.

**Goal:** Expose *the firm* as an MCP server that an outside assistant (the lawyer's ChatGPT / Claude / Copilot) can drive through a small **legal-noun** tool surface — create a matter, check its status, list and fetch work products, and *request* (never grant) an approval — where every call is receipted, approvals are a **human-only** signed dashboard deep link, and privileged work-product text never leaves without an explicit per-call opt-in.

**Architecture (recommended; D1 below needs sign-off):** a new in-repo MCP server `mcp-servers/firm-facade/`, built on the same `@modelcontextprotocol/sdk` template the just-merged `mcp-servers/legal-data/` uses. It holds a **fixed allowlist** of legal-noun tools (no raw passthrough, no arbitrary-HTTP tool). Each tool calls paperclip's REST API via a thin client (reuse the shape of `gate-proxy/src/paperclip-client.ts`) and writes a receipt to the **same hash-chained ledger** the gate proxy uses, so firm-facade actions and egress actions share one audit spine. The facade is the *opposite direction* from Phase 1/2 (inbound control by an outside assistant) but the *same trust engine* (allowlist + receipts + human-only approvals).

**Tech stack:** TypeScript on `@modelcontextprotocol/sdk` (`McpServer` + a transport — stdio for a locally-spawned facade, HTTP/SSE if a remote assistant connects; see D3), `zod` for tool input schemas, `node:test` via `tsx`. Reuse `gate-proxy/src/receipts.ts` (the `ReceiptChain`) and the paperclip-client pattern. No new heavyweight deps beyond what `mcp-servers/legal-data/` already vendors.

---

## Why this is the keystone of "the firm layer"

Phases 1–2 made the *outbound* path safe (egress gate, citation gate, receipts). Phase 3 makes the firm *reachable*: a lawyer talks to their everyday assistant, and that assistant can safely operate the firm because the only things it can do are legal nouns, the only way work leaves is through the existing gates, and the only way an action is *authorized* is a human clicking a link. The headline selling point — "drive your whole firm from any assistant, and a regulator can still read exactly what happened" — lives here.

---

## Design decisions — ✅ ALL SIGNED OFF (operator, 2026-06-26)

- **D1 — Where the facade lives → DECIDED: standalone `mcp-servers/firm-facade/` package** (mirrors `mcp-servers/legal-data/`), importing `gate-proxy/src/receipts.ts` for the chain writer (option D1(a)). Resolve the single-writer receipt question in S6 before locking the import vs HTTP-writer detail.
- **D2 — Legal-noun catalog → DECIDED: all five** — `create_matter`, `get_matter_status`, `list_work_products`, `fetch_work_product`, `request_approval`. Fixed allowlist. **No** `approve_gate`/`decide_approval` (risk #1), **no** `run_agent`/`raw_http`/workspace-control.
- **D3 — Transport → DECIDED: stdio only for v1** (assistant spawns the facade locally; no network listener; inherits local-trust). Remote HTTP/SSE + firm-issued auth = an explicit later phase, out of v1 scope.
- **D4 — `fetch_work_product` default → DECIDED: default-closed.** Metadata + dashboard link by default; full privileged text only when `include_text:true` AND policy `firmFacade.allowWorkProductText` is on, and every disclosure is receipted (risk #2).
- **D5 — Approval UX → DECIDED (locked): human-only deep link.** `request_approval` creates a paperclip approval (`POST /companies/:id/approvals`) and returns `{status:"pending_approval", approvalId, deepLink}`; the outside assistant gets pending and **cannot** approve (approve/reject are `assertBoard`; the facade's company-scoped key 403s on decide). A human always closes the loop in the dashboard.

---

## PHASE 3 SPIKE — resolve before building (mirror the Phase 0/2 spike discipline)

Each spike item is `file:line`-verified against the pinned paperclip submodule and recorded back into this plan.

- [ ] **S1 — Matter (issue) create + status endpoints.** Confirm the exact route to create a matter (candidate: a `POST` under `/companies/:companyId/issues` — `paperclip/server/src/routes/issues.ts` has `GET /companies/:companyId/issues` at `:1779`; find the create route + its body validator) and the single-issue status read (`GET /issues/:id` or the `heartbeat-context`/`activity` routes). Record the create body shape (title, description, projectId?, parent?) and the auth scope required.
- [ ] **S2 — Work-product / document endpoints.** Confirm how a finished work product is listed and fetched. `grep` shows `execution-workspaces` + `workspace-operations` but no obvious `/documents` route — determine whether work products are issue comments, attached documents, or workspace artifacts, and the read endpoint + whether full text vs. metadata is separable (drives D4).
- [ ] **S3 — Approval create + deep link.** Re-confirm from the Phase 0 spike: `POST /companies/:id/approvals` body `{type, requestedByAgentId?, payload, issueIds?}`, `assertCompanyAccess` to create, `assertBoard` to decide (`routes/approvals.ts`). Determine the dashboard URL shape for an approval card (so `deepLink` is real, not invented) — inspect the UI route for approvals, or construct from `PAPERCLIP_BASE_URL` + the approval id.
- [ ] **S4 — Facade auth to paperclip.** The facade needs a paperclip credential to create issues/approvals/read documents. On `local_trusted` it can call unauthenticated loopback (like the gate proxy). For a production instance it needs a scoped key. Confirm the facade key is **company-scoped, not board** (it must NOT be able to approve — same invariant as the gate proxy's key, risk #9). Record how the launcher provisions it.
- [ ] **S5 — MCP server template confirmation.** Confirm `mcp-servers/legal-data/src/server.ts` (`McpServer` + `StdioServerTransport` + zod input schemas + `tools/list`/`tools/call`) is the right skeleton to copy, and that a tool handler can be async and return `{content:[{type:"text",text}]}`. (Already ~confirmed by reading the merged file; lock it.)
- [ ] **S6 — Receipt reuse.** Confirm `gate-proxy/src/receipts.ts` `ReceiptChain` can be imported and appended to from the facade package (path import across `mcp-servers/` ↔ `gate-proxy/`), and decide the receipt `kind` for facade actions (extend the union: add `"firm_facade"` — same one-line pattern as the Phase 2 `"quality"` kind). Decide the receipts file path (share the gate's `~/.possiblaw/gate-receipts/<instance>/receipts.jsonl`, or a sibling — sharing gives one audit spine but needs the single-writer caveat addressed if both processes write; if the facade and gate proxy run as separate processes, either use a separate facade ledger or route facade receipts through the gate proxy's HTTP API). **Resolve the single-writer question here** — it gates D1.

**Spike exit criteria:** every endpoint above has a `file:line` citation and a confirmed request/response shape; the single-writer receipt question (S6) is resolved. *(D1–D5 already signed off — operator, 2026-06-26.)*

---

## File structure (after the spike, D1(a) assumed)

```
mcp-servers/firm-facade/
  package.json            # @possiblaw/firm-facade-mcp — sdk + zod; test/typecheck/start scripts
  tsconfig.json
  src/
    server.ts             # thin wiring: McpServer + transport + the fixed tool catalog
    catalog.ts            # the 5 legal-noun tool defs (name, description, zod inputSchema)
    handlers.ts           # one async handler per tool; calls paperclip-client; writes receipts
    paperclip-client.ts   # thin REST client (create issue / get issue / list+fetch work products / create approval) — company-scoped key only
    deeplink.ts           # build the human-only approval dashboard deep link from base url + approvalId
    receipts.ts           # re-export / wire gate-proxy's ReceiptChain (or HTTP-to-gate writer, per S6)
    *.test.ts             # node:test, zero-network, injected fake paperclip-client
gate-proxy/src/receipts.ts # MODIFY: extend ReceiptBody.kind union with "firm_facade"
companies/legal-operations/gate-policy.yaml # ADD firmFacade section (allowWorkProductText default false)
bin/possiblaw             # MODIFY: optional facade launch + scoped key provisioning (behind a flag)
docs/...                  # connectors-inventory / known-limitations / walkthrough updates
```

---

## Task breakdown (TDD, bite-sized; finalize against spike receipts)

> Each task: write the failing test, run it red, implement minimal, run green, typecheck, commit. Tests use a **fake paperclip-client** (zero network) — the same discipline as `legal-data/adapter.test.ts`.

### Task 3.1 — Scaffold + `firm_facade` receipt kind
- Create `mcp-servers/firm-facade/{package.json,tsconfig.json}` copied from `legal-data`. Extend `gate-proxy/src/receipts.ts` kind union to `… | "firm_facade"` (one line) + a round-trip test (mirror the Phase 2 `"quality"` test). Commit `feat(firm-facade): scaffold + firm_facade receipt kind`.

### Task 3.2 — Tool catalog (no handlers yet)
- `src/catalog.ts`: the 5 tool definitions with zod input schemas (`create_matter{title, description, projectId?}`, `get_matter_status{matterId}`, `list_work_products{matterId}`, `fetch_work_product{workProductId, include_text?}`, `request_approval{matterId, action, summary}`). Test: `tools/list` returns exactly these 5 names and no others (the allowlist is the security property — assert the catalog cannot contain a raw/http/approve tool). Commit.

### Task 3.3 — paperclip-client (thin, company-scoped)
- `src/paperclip-client.ts`: `createIssue`, `getIssue`, `listWorkProducts`, `fetchWorkProduct`, `createApproval` against the S1/S2/S3 endpoints; bearer = facade key (company-scoped; **no approve/reject method exists** — grep-able invariant, same as the gate client). Tests with injected fetch: each method hits the right path/shape; the client surface has no decide-approval method. Commit.

### Task 3.4 — Read handlers (status, list, fetch-metadata)
- `get_matter_status`, `list_work_products`, `fetch_work_product` (metadata-only path). `fetch_work_product` returns `{id, title, link, …metadata}` and **omits full text** unless `include_text` AND policy allow (Task 3.7). Every read writes a `firm_facade` receipt (action, matterId/workProductId, outcome, no payload text). Tests: metadata returned, text omitted by default, receipt written. Commit.

### Task 3.5 — `create_matter` handler
- Creates a paperclip issue from `{title, description}`, writes a receipt, returns `{matterId, status, link}`. Test: issue created with the right body; receipt written; invalid input → structured error + error receipt. Commit.

### Task 3.6 — `request_approval` (human-only deep link) — the risk-#1 task
- Creates a paperclip approval (`createApproval`), builds the dashboard `deepLink` (S3), writes a `pending` receipt, returns `{status:"pending_approval", approvalId, deepLink}`. **Invariant test:** the facade exposes no tool and the client no method that can *approve* — assert statically that the catalog has no approve/decide tool and the client has no approve method (the human-only property is structural, not prose). Test the bait-and-switch shape if the approval carries a payload sha (reuse the gate's pattern). Commit.

### Task 3.7 — `fetch_work_product` full-text opt-in + policy (risk #2, the egress side-door)
- `gate-policy.yaml` `firmFacade.allowWorkProductText` (default **false**, fail-closed validation like `citationGate`). `include_text:true` returns full text ONLY when the policy flag is on; otherwise metadata + a "text withheld — enable firmFacade.allowWorkProductText" note. **Every** full-text disclosure writes a receipt recording that privileged text was released (so the side-door is at least always audited). Tests: default withholds; flag-on + include_text releases + receipts the disclosure; flag-on + no include_text still withholds. Commit.

### Task 3.8 — server wiring + transport
- `src/server.ts`: `McpServer` + stdio transport (D3), register the catalog, route `tools/call` to handlers, fail-closed on unknown tool. Boot check: spawn the facade, `tools/list` returns the 5 nouns. Commit.

### Task 3.9 — launcher wiring (behind a flag) + scoped key
- `bin/possiblaw`: optional `--firm-facade` to register the facade (reuse the just-merged MCP-registry/renderer so an outside assistant's config can point at it, OR document the manual MCP-client config). Provision the facade's **company-scoped** paperclip key (S4) into the facade env only — never a board key (risk #9). Dry-run regression unchanged (`177/172/3/3/0/0`). Commit.

### Task 3.10 — docs + honest-limits
- `docs/connectors-inventory.md` (firm-facade tool table), `docs/known-limitations.md` (stdio-only v1, local-trusted approval binding, work-product-text opt-in, no ethical wall yet — risk #4), `docs/operator-walkthrough.md` ("drive the firm from your assistant" demo). README firm-layer note. CHANGELOG 0.28.0. Commit.

### Task 3.11 — validation battery + live e2e
- firm-facade tests + typecheck; gate-proxy tests still green; launcher self-tests + dry-run; **live e2e** on a disposable instance: an MCP client (or curl-equivalent) calls `create_matter` → `get_matter_status` → `request_approval` (gets a pending + deepLink, CANNOT approve) → a human approves in the dashboard → `fetch_work_product` returns metadata (text withheld by default) → `/receipts/verify` shows the firm_facade chain with zero payload text. Never touch port 3100. Commit + continuity + PR.

---

## Risks / landmines (carry into every task)

1. **`approve_gate` over MCP = the headline risk.** Never expose an AI-callable approve. Approval is a human-only dashboard deep link; approve/reject are `assertBoard` (facade key is company-scoped, 403 on decide). Assert this statically (Task 3.6).
2. **Egress side-door.** `fetch_work_product` returning privileged full text to an outside assistant bypasses the firm's own privacy posture. Default metadata+link; full text opt-in + policy flag + receipt (Task 3.7).
3. **No raw passthrough.** The allowlist is the boundary — no arbitrary-HTTP tool, no `run_agent`, no workspace control. The catalog is fixed and tested (Task 3.2).
4. **Ethical wall (deferred).** Cross-matter reads (one assistant fetching another client's matter) need info barriers; v1 scopes every tool to an explicit `matterId` and does NOT add cross-matter search. Document as a known limitation.
5. **Facade key scope.** Company-scoped, never board, never logged/receipted — same class as the gate proxy's key (risk #9 from Phase 1).
6. **Receipt single-writer.** If the facade and gate proxy both write the same ledger from separate processes, the chain interleaves (the documented single-writer caveat). Resolve in S6 — either a separate facade ledger, or facade receipts routed through the gate proxy's HTTP API.
7. **Remote transport (deferred).** stdio v1 inherits local trust; a network listener needs real firm-issued auth — explicit follow-up, not v1.

## Evals (Given/When/Then — finalize after spike)

- **HAPPY:** Given an outside assistant connected to the facade; When it calls `create_matter` then `request_approval`; Then a matter issue is created, an approval is created with a human-only `deepLink`, the assistant receives `pending_approval` and CANNOT approve, a human approves in the dashboard, and the receipt chain shows `create_matter` → `request_approval(pending)` → (human) approved.
- **EDGE (text withheld):** Given `firmFacade.allowWorkProductText:false` (default); When the assistant calls `fetch_work_product{include_text:true}`; Then full text is withheld, metadata+link returned, and the receipt records a withhold (no privileged text in the receipt or the response).
- **EDGE (text released + audited):** Given the flag on; When `fetch_work_product{include_text:true}`; Then full text is returned AND a disclosure receipt is written naming the work product (the side-door is always audited).
- **FAILURE/SECURITY 1 (no AI approve):** Given the connected assistant; When it attempts any approve/decide; Then no such tool exists in `tools/list` and the facade key 403s on the paperclip decide endpoints — approval is structurally human-only.
- **FAILURE/SECURITY 2 (no raw passthrough):** Given a crafted `tools/call` for an unlisted tool name; Then the facade fails closed (unknown-tool error + receipt), never proxies arbitrary HTTP.

---

## Self-review (plan-time)
Spec coverage vs NORTH STAR Phase 3 outline: legal-noun allowlist ✅ (Task 3.2), approval = human-only deep link ✅ (3.6), no raw passthrough ✅ (3.2/3.8), `fetch_work_product` metadata-default + opt-in+receipt ✅ (3.7), built on the gate engine/receipts ✅ (3.1/S6). UNCONFIRMEDs are corralled into the spike (S1–S6) and the five design decisions (D1–D5) are flagged for sign-off rather than silently assumed. No code is presented as final for spike-dependent endpoints — those tasks finalize against spike receipts, matching how Phase 2 closed its spike before building.
