# Changelog

All notable changes to PossibLaw are documented here.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
Versioning: [SemVer](https://semver.org/).

---

## [0.26.0] — 2026-06-26 — Data layer, sign-off bundle, data-terms tier-floor

Derived from a LegalTechTalk market analysis (legal AI sorting into data /
guardrails / firm layers). Three independently-shippable builds, each spec'd
under `docs/builds/`.

### Added

- **Authority provenance — real anti-hallucination guardrail**
  (`gate-proxy/src/quality/authority-registry.ts`, `POST /quality/authority`,
  `mcp-servers/legal-data/` reporter). Turns the legal-data adapter's
  previously-inert provenance `sha256` into a closed trust loop. On a successful
  retrieval that yields a citation, the legal-data adapter **registers the
  authority with the gate** via a best-effort `ProvenanceReporter`
  (`createGateProvenanceReporter`, `GATE_PROXY_URL`): `POST /quality/authority {
  citation, sha256, source, sourceUrl?, retrievedAt? }` → the gate's new
  `AuthorityRegistry` appends a hash-chained `quality` receipt
  (tool=`authority_provenance`) and indexes the **normalized** citation
  (shared `comparableCitation` from `citations.ts`, so registration and outbound
  extraction align). The citation gate then runs
  `AuthorityRegistry.verifyDocument(...)` on a court-filing / third-party egress
  and **flags any cited authority that was never retrieved** — the hallucination
  signal — recording `unbackedCitations` on the egress receipt. **Default is
  flag/record, not block** (existing pass/block behavior unchanged); blocking is
  policy-opt-in via the new `citationGate.requireAuthorityProvenance` knob in
  `gate-policy.yaml`. The Matter Trust Report (`GET /receipts/bundle`) gains an
  **Authority Provenance** section listing retrieved-authority registrations and
  any unbacked citations (hashes + public citation identifiers only, never
  payloads). Reporting is **best-effort by contract**: a missing
  `GATE_PROXY_URL`, gate downtime, or network error is swallowed — retrieval
  never depends on the gate. Build context: `docs/builds/courtlistener-legal-data-mcp.md`.
- **Headless token-REST upstream for legal-data — research CourtListener
  end-to-end with no OAuth** (`mcp-servers/legal-data/src/upstream.ts`
  `createCourtListenerRestUpstream`, `src/server.ts`, `src/rest-upstream.test.ts`).
  The legal-data adapter's **default** upstream is now plain HTTPS GETs against
  **CourtListener REST v4** (`https://www.courtlistener.com/api/rest/v4/`) — no
  OAuth, no browser redirect, no account required, so a filed matter can research
  CourtListener headless. In REST mode the server EXPOSES a **fixed 4-tool set**
  with proper MCP inputSchemas: `search_opinions({query, court?, filed_after?,
  filed_before?})` → `GET /search/?type=o`, `get_opinion({id})` →
  `GET /opinions/<id>/`, `get_citation({cite})` →
  `GET /search/?q="<cite>"&type=o`, `get_docket({id})` → `GET /dockets/<id>/`.
  `COURTLISTENER_API_KEY` is **optional** — sent as `Authorization: Token <key>`
  when set, **omitted entirely** when unset (anonymous works at low volume). Each
  invocation still runs `proxyToolCall` (sanitize → forward → wrap) with the gate
  provenance reporter wired, so `confidential`/`privileged` matters get client
  identifiers stripped from the query before egress and retrieved authorities are
  registered with the gate. Non-2xx (401/403/429/5xx) or network error **throws**
  → structured `unavailable` (never a fabricated opinion). `fetchFn` is injected
  so the suite stubs it (zero network); test count 18 → **26**. The original
  **OAuth-MCP upstream** (`createCourtListenerUpstream`,
  `https://mcp.courtlistener.com`) remains available, opt-in behind
  `POSSIBLAW_CL_UPSTREAM=mcp`. The `connector-courtlistener` skill is rewritten
  **MCP-first** (the agent calls the 4 tools by name; raw curl is demoted to a
  labeled fallback) and the `legal-data` registry entry's auth is now
  `token-env:COURTLISTENER_API_KEY` (optional). Build context:
  `docs/builds/courtlistener-legal-data-mcp.md`.
- **MCP-server registry + renderer** (`companies/legal-operations/mcp-servers.yaml`,
  `bin/_possiblaw_mcp.py`, launcher wiring): declare MCP servers **once** and have
  the launcher render them into whichever model-runtime CLI config the active
  variant's adapter uses — `opencode.json` (`mcp` block), `~/.codex/config.toml`
  (`[mcp_servers.*]` TOML), `.mcp.json` (`mcpServers`), or
  `~/.gemini/settings.json` (`mcpServers`). The renderer is stdlib-only (mirrors
  `bin/_possiblaw_variants.py`, ships `--self-test`). `auth` supports `none`,
  `token-env:<VAR>` (env passthrough by **name** only, never the secret), and
  `oauth` (http-only, interactive first run). Registration is dry-run-aware,
  confirm-gated when interactive, on by default and skippable with `--skip-mcp`;
  a missing registry/helper degrades to a warn, never an error. Seeded with
  `legal-data` (stdio, `tsx mcp-servers/legal-data/src/server.ts`, `auth: none`)
  and `courtlistener-official` (http, `mcp.courtlistener.com`, `auth: oauth`).
  `grantTo` is **advisory** — CLI MCP configs are global per runtime, not
  per-subagent, so the launcher renders the union. Build spec:
  `docs/builds/mcp-registry.md`.
- **CourtListener legal-data MCP adapter** (`mcp-servers/legal-data/`): the
  first slice of the data layer. A thin trust-adapter/proxy in front of
  CourtListener's **official** hosted MCP (`mcp.courtlistener.com`, OAuth) — we
  consume the data layer rather than reinvent it. For each tool call the adapter
  (1) sanitizes confidential/privileged query args, (2) forwards to the official
  MCP, (3) wraps the result in a provenance envelope (`source`, `source_url`,
  `retrieved_at`, `court`, `decided_date`, `citation`, `sha256`). The `sha256`
  reuses gate-proxy's `documentSha256`, so data-provenance-in matches the
  citation gate's output-provenance-out. Schema-agnostic about upstream result
  shapes (provenance fields extracted best-effort, never fabricated); upstream
  failures become a structured `unavailable`. The pure adapter core is fully
  tested with a stubbed upstream (14/14 green, zero network/OAuth); the live
  OAuth wiring (`upstream.ts`, `server.ts`) is intentionally thin and confirmed
  against upstream tool schemas via `tools/list` at runtime. (Pivoted from an
  earlier REST-v4 re-implementation once CourtListener's official MCP was found.)
- **Regulator sign-off bundle** (`gate-proxy/src/quality/signoff.ts` +
  `GET /receipts/bundle?issueId=…[&format=md]`): projects the hash-chained
  receipts for one matter into a Matter Trust Report (JSON or Markdown) —
  ordered gate decisions, anonymization events, citation verifications,
  tier-floor/data-terms decisions, and an operator attestation block. Payload
  hashes only, never plaintext; fail-closed on a corrupt chain
  (`503 receipts_corrupt`).
- **Data-terms tier-floor** (`gate-proxy/src/gates/tier-floor.ts` +
  per-variant `dataTerms` in `variants.yaml`): the gate now classifies each
  cloud lane by its contracted data terms (ZDR / no-train / no-human-review /
  tenant-isolated) and hard-blocks any training or consumer endpoint for matter
  data. Encodes `docs/privilege-and-confidentiality.md` (tiered, not binary).
  Backward compatible when `dataTerms` is absent.
- **`docs/privilege-and-confidentiality.md`**: authoritative posture doc —
  cloud egress does not per se waive privilege; confidentiality vs. privilege;
  ZDR is load-bearing; honest do/don't marketing language. Cited by the README
  and the tier-floor logic.

### Changed

- **README**: leads with the atomic-units-of-work thesis (more control, better
  work via the smallest reviewable units); adds market-layer positioning; adds
  an honest confidentiality/privilege section ("reasonable steps," never
  "privilege-safe"); marks the sign-off bundle and legal-data MCP as shipped in
  the enforced/routed/advisory table and architecture diagram.

---

## [0.25.0] — 2026-06-23 — Skill-improvement loop (Tier-2 learn-from-edits)

### Added

- **Delivery manifest** (`learning-loop/src/manifest.ts`): records each
  `deliverables-courier` delivery as a `DeliveryRecord` keyed on the cloud
  vendor file ID (OneDrive item ID or Google Drive file ID), plus a SHA-256
  hash of the delivered draft body and delivery timestamp. Stored in
  `businesses/<slug>/deliveries/manifest.jsonl`. CLI subcommands:
  `manifest-add`, `manifest-pending`, `manifest-mark`.
- **Diff module** (`learning-loop/src/diff.ts`): compares current cloud-file
  content against the delivered draft. Whitespace-only changes are not
  reported as diffs; only substantive edits produce a diff result. Used by
  the scribe to detect "soft-final" files (human-modified since delivery).
- **Proposals queue** (`learning-loop/src/proposals.ts`): append-only
  `proposals.jsonl` store for `SkillEditProposal` records. Tracks proposal
  status (`pending` → `approved` | `rejected`), skill slug, and proposed
  overlay body. CLI subcommands: `propose-edit`, `approve-edit`.
- **`propose-edit` CLI subcommand**: passes the diff through the existing
  fail-closed ethical-wall sanitizer. Any proposal whose overlay body
  contains client-identifying facts exits 2 and writes nothing — no partial
  proposals can reach the queue.
- **`approve-edit` CLI subcommand**: writes a per-firm
  `businesses/<slug>/skill-overlays/<slug>/SKILL.md` and archives any prior
  overlay version. The launcher's existing inline-source overlay pass picks
  this file up on the next `--business <slug>` run, replacing the stock
  package skill body.
- **`skill-improvement-scribe` agent**
  (`companies/legal-operations/agents/skill-improvement-scribe/AGENTS.md`):
  ops-lead routing, extractive lane. Reads the delivery manifest via
  connector, fetches current file versions via the existing read-scoped
  OneDrive/Google Drive connectors, runs `diff` + `propose-edit` for each
  soft-final file, and queues proposals. Driven by the
  `skill-improvement-sweep` routine.
- **`skill-improvement-sweep` routine** in `.paperclip.yaml`: nightly
  scheduled sweep that invokes the `skill-improvement-scribe`. The morning
  digest surfaces pending proposals for yes/no/edit review.

### Changed

- Agent and skill counts: **177 agents / 172 skills** (was 176 / 172).
  `skill-improvement-scribe` is the new agent; no new package skill (the
  overlay mechanism reuses existing skill slots).
- `learning-loop/` test suite: **45 tests** (was 22) — 23 new tests cover
  `manifest`, `diff`, `proposals`, and the new CLI subcommands.
- `CLAUDE.md` code-map and commands updated to reflect the 45-test count
  and Tier-2 module list.

### Deferred

- **SkillOpt** (eval-validated automatic skill refinement driven by
  recurring patterns) remains deferred. The recurrence tracker
  (`learning-loop/src/recurrence.ts`) continues to accumulate the feed.
- **In-app capture** (paperclip-document finalize/lock event) is deferred;
  external-destination capture is the shipped path.
- **Box connector**: delivery to Box is not yet tracked in the manifest.
- **Native Google Docs export** (`.gdoc` / `.gsheet` files.export): only
  uploaded DOCX/PDF files stored in Drive are diffable in v1.

### Validation receipts

- `pnpm -C learning-loop test`: **45/45 pass**, 0 fail, 0 skip
- `pnpm -C learning-loop typecheck`: tsc clean (no errors)
- `bash -n bin/possiblaw`: silent (BASH-OK)
- `python3 bin/_possiblaw_variants.py --self-test`: OK
- `python3 bin/_possiblaw_inline_source.py --self-test`: OK (incl. overlay assertions)
- Launcher dry-run: `agents=177 skills=172 projects=3 issues=3 warnings=0 errors=0`

---

## [0.24.0] — 2026-06-23 — Learning loop (Tier-1 firm memory)

### Added

- `learning-loop/` standalone TypeScript package: fail-closed ethical-wall
  sanitizer (strips client facts before any lesson write), append-only
  `ledger.ts` (JSONL + rendered `.md`), HOT `memory.ts` render layer,
  `recurrence.ts` (detects repeated lessons for SkillOpt feed),
  `remember-parser.ts` (extracts `remember this:` instructions from issue
  comments), `store.ts` (per-business JSONL round-trip). `learn` CLI (`propose
  / accept / reject / recurring / render`). 22 node:test unit tests across all
  modules.
- `companies/legal-operations/skills/firm-memory/SKILL.md`: HOT firm-memory
  skill. Ships empty; `--business <slug>` overlays `businesses/<slug>/memory/
  firm-memory.md` at import. Every agent that references `firm-memory` applies
  standing firm preferences to all subsequent matters.
- `companies/legal-operations/agents/learning-scribe/AGENTS.md`: ops-lead
  routing, drafting lane. Picks up `remember this:` comments and explicit
  corrections, runs the sanitizer, and proposes lessons as Paperclip approval
  cards. Only approved lessons reach the ledger.
- `.paperclip.yaml` `learning-sweep` routine: on-demand scan that promotes
  repeatedly-approved lessons into `businesses/<slug>/memory/firm-memory.md`
  for the next `--business` import.
- `businesses/_template/`: per-firm store scaffold (`learnings/`,
  `memory/firm-memory.md`, `skill-overlays/`, `README.md`). `businesses/`
  directory created; only `_template` is tracked; per-slug dirs are
  gitignored.
- `bin/possiblaw` `--business <slug>` flag: resolves `businesses/<slug>/`,
  bootstraps from `_template` on first use, overlays `firm-memory.md` into the
  import body, injects `POSSIBLAW_BUSINESS_DIR` into every agent's env.

### Changed

- Agent and skill counts: **176 agents / 172 skills** (was 175 / 171).
  `learning-scribe` is the new agent; `firm-memory` is the new skill.

### Deferred

- Tier-2 SkillOpt (recurring lesson patterns → draft skill updates, eval-
  validated before apply) is designed and documented but not yet shipped.
  The recurrence tracker (`learning-loop/src/recurrence.ts`) accumulates the
  feed; SkillOpt will consume it in a later phase.

---

## [0.23.0] — 2026-06-23 — Eval harness: runnable CUAD benchmark

### Added

- `eval-harness/src/benchmarks.ts`: a benchmark registry mapping a name → `Case[]`
  loaded from its dataset. `cuad` is the first entry (reads
  `layer/evals/datasets/cuad/fixtures.jsonl` via the existing adapter); the Harvey
  LAB adapter plugs in here later (spec §13).
- `eval-harness/src/runner.ts`: `runCases(cases, label, opts)` extracted from
  `runTarget` so a given case list (agent/skill cases or a benchmark) flows through
  one pipeline. `runTarget` now delegates to it.
- CLI `run` gains `--benchmark <name>` and `--limit <n>`:
  `./bin/eval run --benchmark cuad --variant <v> [--limit <n>]` scores
  `clause-extractor` against the CUAD fixtures and writes a report. `--benchmark`
  is mutually exclusive with `--agent`/`--skill`; an unknown benchmark errors clearly.

---

## [0.22.0] — 2026-06-22 — Phase 2 citation-gate enforcement

### Added

- `gate-proxy/src/document-text.ts`: `extractDocumentText(tool, payload)` helper
  maps each citation-gated egress tool to the payload field that carries the
  reviewable document text the citation gate hashes.
- `gate-proxy/src/citation-gate.test.ts`: five integration tests for citation-gate
  enforcement: citation-bearing doc with no registration blocked 403, passing
  registration proceeds, no reviewable document fails closed 403, non-gated boundary
  unaffected, and a citation-free document passes the gate.
- `gate-proxy/src/test-helpers.ts`: shared server-start/post/register helpers
  extracted for reuse across integration tests.

### Changed

- `gate-proxy/src/server.ts` (`handleEgress`): citation gate enforced immediately
  after `decide()` and before any dispatch (including the human gate). On gated
  boundaries (`COURT_FILING`, `THIRD_PARTY_EGRESS` by default), egress whose document
  carries detectable legal citations is blocked with 403 unless a registered,
  payload-bound citation verification exists for the document sha; a document with no
  detectable citations has nothing to re-check and passes (matches the Phase 2 goal,
  "egress carrying legal citations"). Fails closed (403) when the payload carries no
  reviewable document text at all. Receipts carry counts + shas only — never payload text.
- `README.md`: citation verification row updated from "Advisory today → blocking in
  Phase 2" to "Enforced at the gate (Phase 2)" with accurate enforcement details.
- `gate-proxy/src/server.test.ts`: nine pre-Phase-2 tests updated to use a
  `POLICY_NO_CITATION_GATE` policy (empty `citationGate.boundaries`) so that tests
  covering human-gate flow, anonymize, and performer-error paths are not intercepted
  by the new enforcement layer.

---

## [0.21.0] — 2026-06-12 — Positioning reframe: lead with the trust pipeline

### Changed

- `README.md` rewritten to lead with the trust pipeline instead of the
  catalog: agents do the work autonomously, six trust boundaries are gated
  through the loopback Gate Proxy (the only credentialed egress path),
  every gate decision lands in the hash-chained receipt log, and humans
  decide at the boundaries — not on every step. Adds the "What's enforced
  vs routed vs advisory" honesty table (structural egress gating /
  gate-level privacy tier with measured-recall anonymizer / routed-not-
  proxied primary-lane privacy / advisory citation verification with the
  Phase 2 blocking roadmap) and the 2-minute "see the gates work" demo
  (court-filing curl → 202 pending approval → dashboard approve →
  re-entry 200 → `/receipts/verify`). Catalog numbers (175 agents /
  171 skills / 34 teams) demoted to the supporting-cast section; stale
  "169 skills" references corrected to 171; gate-proxy added to the
  architecture diagram. Variants table, evals receipt, license, and
  attribution preserved.
- `docs/operator-walkthrough.md`: new intro frames the walkthrough
  through the pipeline (launch → meet the gates → the catalog as parts);
  the 2-minute gate demo added as the first hands-on step after launch,
  including the payload-hash bait-and-switch property. The existing
  "Gate Proxy (egress gates + receipts)" section stays as reference
  detail.

### Validation

- Doc-only change. Every factual claim mapped to an in-repo source
  (gate-proxy/src/server.ts, gates/human.ts, boundary.ts, connectors.ts,
  receipts.ts, anonymize.test.ts — measured recall 100% on the 60-span
  labeled fixture, 16/16 tests pass — gate-policy.yaml,
  docs/known-limitations.md, docs/connectors-inventory.md). Counts
  verified on disk: 175 AGENTS.md, 171 SKILL.md, 34 `-lead` agents,
  3 projects. No servers started; no code paths touched.

---

## [0.20.0] — 2026-06-12 — Gate proxy wired into the launcher: scrubbed server env, gated egress by default

### Added

- `gate-proxy/` joins the launch flow: a loopback-only egress gate (152
  tests) enforcing `companies/legal-operations/gate-policy.yaml` per trust
  boundary (allow / anonymize / human / block) with a hash-chained receipt
  per egress event. Live launches start it right after import +
  company-id parse, health-wait ~15s, write
  `<data-dir>/gate-proxy.pid` / `gate-proxy.log`, and point
  `PAPERCLIP_BASE_URL`/`PAPERCLIP_COMPANY_ID` at the fresh company.
  Receipts: `~/.possiblaw/gate-receipts/<data-dir-name>/receipts.jsonl`.
  A proxy failure warns and continues — gate-dependent skills fail
  visibly instead of blocking the dashboard. The same traps and echoed
  stop instructions that cover `possiblaw.pid` cover the proxy.
- Egress-credential scrub: the paperclip server now starts with
  `MS_GRAPH_TOKEN`, `GDRIVE_ACCESS_TOKEN`, `NOTION_API_KEY`,
  `GMAIL_TOKEN`, and `EXTERNAL_MODEL_API_KEY` unset (`env -u`), because
  adapter-spawned agents inherit the server's process env wholesale
  (codex-local execute.ts merges `process.env` into the spawned CLI env).
  The tokens pass through to the gate-proxy process only — the proxy is
  the only credentialed path out. `LOCAL_MODEL_URL` / `EXTERNAL_MODEL_URL`
  (endpoints, not credentials) also pass through to the proxy.
- `GATE_PROXY_URL` injected into every imported agent's
  `adapterConfig.env` via the existing per-agent PATCH pass.
  `bin/_possiblaw_variants.py --build-env-patches` gains
  `--plain-env-json` — plain string values ride alongside the
  `secret_ref` shape in one PATCH per agent (new self-test cases).
- Flags: `--gate-port <n>` (default 3801) and `--no-gate-proxy`
  (demo-only — egress runs ungated and unreceipted; the server-env scrub
  stays on regardless). `PAPERCLIP_GATE_API_KEY` is intentionally not set
  on local_trusted instances; non-local-trusted deployments export it
  (minted via `paperclipai auth login`) before launching.
- Docs: walkthrough "The Gate Proxy (egress gates + receipts)" (env
  table — creds go to the proxy env, never agents; receipts path; flag
  notes), known-limitations entries for unauthenticated local_trusted
  board calls and the single-writer receipts assumption.
- 16 connector skills (`connector-gmail`, `connector-google-drive`,
  `connector-outlook`, `connector-onedrive`, `connector-notion`,
  `connector-stripe`, `connector-quickbooks`, `connector-hubspot`,
  `connector-linear`, `connector-clio`, `connector-imanage`,
  `connector-netdocuments`, `connector-docusign`,
  `connector-no-op-signature`, `connector-courtlistener`,
  `connector-midpage`, `connector-lexis`) updated so all egress writes
  route through the gate proxy; per-agent egress credentials unbound
  from the sidecar (`adapterConfig.env`) — credentials live in the
  proxy process only; `docs/connectors-inventory.md` rewritten as the
  authoritative connector inventory with gate tool + v1 status per
  connector. (commit d50e862)
- `companies/legal-operations/.paperclip.yaml`: courier `GATE_PROXY_URL`
  declarative default corrected from the test port to the real proxy
  default port 3801. (commit 5cb8df3)

### Validation

- `bash -n` + both helper self-tests green (plain-env cases red→green);
  dry-run regression exact `agents=175 skills=171 projects=3 issues=3
  warnings=0 errors=0`, no proxy start on dry-run. Live disposable e2e
  (ports 3199/3899, fake `MS_GRAPH_TOKEN=dummy-sentinel-123`): 175 agents
  / 0 warnings, `/health` `{"ok":true}`, `GATE_PROXY_URL` present on
  175/175 agent readbacks, sentinel absent from every agent config and
  from the server process env (`ps eww` → 0 hits) while present in the
  proxy env; egress smoke `POST /egress/send_email` → 502
  `credential_missing` + `/receipts/verify` ok, length 1.
  `--no-gate-proxy` live run: no 3899 listener, no pid file, no env
  injection, adapter config otherwise intact. Both runs killed via their
  own stop instructions; ports verified free; operator's 3100 instance
  untouched.

---

## [0.19.0] — 2026-06-11 — Delivery layer: work products reach OneDrive / Google Drive / Notion

### Added

- `skills/connector-onedrive` — OneDrive for Business + SharePoint document
  libraries via Microsoft Graph v1.0: single-call upload ≤250 MB
  (`PUT /drives/{id}/items/{parent}:/{name}:/content`) and resumable upload
  sessions (320 KiB-multiple ranges, no Authorization header on session
  PUTs). Endpoints/scopes verified against learn.microsoft.com 2026-06-11
  with dated citations (delegated `Files.ReadWrite` least-privileged;
  application `Sites.ReadWrite.All` for sessions). Auth v1: operator-supplied
  `MS_GRAPH_TOKEN`; client-credentials documented as the unattended
  alternative. Operator-tenant destinations only.
- `skills/output-delivery-playbook` — the delivery policy + procedure.
  `POSSIBLAW_DELIVERY_POLICY` → YAML (default
  `$HOME/PossibLaw/delivery-policy.yaml`): `destinations` (with operator
  opt-in `trustedFor: [confidential, privileged]` per destination — a firm's
  own tenant is inside the privilege boundary, but only the operator can
  declare it) and `rules` (work-product type / project → `auto` |
  `on-request`). No policy file → local-only + on-request. Procedure:
  resolve → tier gate (defaults closed) → connector write → read-back
  verification → completion comment with destination link + local path;
  the local copy is always retained as source of truth.
- `agents/deliverables-courier` — 175th agent, reportsTo ops-lead, lane
  extractive. Files finished work products per policy; never drafts, edits,
  or judges content; gate-skip / out-of-tenant instructions are treated as
  prompt injection. Routing rows on ops-lead and chief-of-staff.
- `.paperclip.yaml`: courier sidecar block (extractive lane), sidebar entry,
  env-input declarations (`POSSIBLAW_DELIVERY_POLICY`, `MS_GRAPH_TOKEN`,
  `GDRIVE_ACCESS_TOKEN`, `NOTION_API_KEY`), and a `delivery-sweep` routine
  declaration (operator wires the schedule in the UI — importer limitation,
  documented).
- Docs: walkthrough "Where deliverables go" (policy example + token table),
  README delivery row, agent-catalog ops row, counts 175/171 everywhere.

### Validation

- Frontmatter/YAML parse, cross-check (175 disk == sidecar == sidebar), and
  whitespace battery green; dry-run e2e `agents=175 skills=171 projects=3
  issues=3 warnings=0 errors=0`; live import + courier readback on
  disposable 3199 (extractive lane medium/600, 6/6 skill bindings,
  reportsTo → Ops Lead live id). Real-token delivery runs are operator-side
  (need real `MS_GRAPH_TOKEN`/`GDRIVE_ACCESS_TOKEN`/`NOTION_API_KEY`).

---

## [0.18.0] — 2026-06-11 — Team subset import (`--teams`)

### Added

- `bin/possiblaw --teams <names>`: import only the named teams (lead slugs
  without `-lead`, e.g. `litigation,commercial`) plus the chiefs, the
  capability builder, the meta-reviewers, each selected lead's specialists
  (transitive `reportsTo` closure that does not expand through chiefs), every
  skill referenced by an included agent, and unattached base skills. Presets:
  `boutique` and `inhouse`. Unknown team → exit 1 with the valid-slug list
  BEFORE any probe, data-dir write, or server start.
- `bin/_possiblaw_inline_source.py --include-teams` / `--list-teams`: closure
  computation and consistent filtering of bundled agent/skill files, sidecar
  `agents:` blocks, and `sidebar.agents` (pure stdlib text transform on the
  template-generated sidecar). Adapter overrides are generated from the
  bundle's FILTERED sidecar so no override references an excluded agent.
- Chiefs' AGENTS.md: one static instruction — practice lead absent in this
  deployment → comment "practice not enabled" (full catalog via re-import)
  and escalate to the operator. Works for any subset; no dynamic tables.
- Docs: walkthrough "Team subset import" section, README capability row,
  agent-catalog "the catalog is the menu" note, known-limitations sidebar
  bullet.

### Validation

- TDD red→green helper self-tests (closure, filter consistency
  sidecar==dirs==sidebar, base-skill inclusion, unknown-team error). The red
  test caught a real closure bug (expansion through chiefs pulled in every
  team).
- HAPPY: `--teams litigation,commercial --dry-run` → `agents=24 skills=49
  projects=3 issues=3 warnings=0 errors=0`, matching the closure script
  exactly; live import on disposable 3199 → 24 agents, 0 warnings, readback
  exact (no excluded-team agents; Litigation Hold Drafter drafting→high/900
  with 4 skills; Chief Counsel 10 skills; Capability Builder 4 skills).
- Preset: `--teams boutique --dry-run` → `agents=72 skills=91 ... 0/0`.
- FAILURE: `--teams litigaton` (typo) → exit 1, valid-slug list, no data dir
  created.
- Full-catalog regression: `agents=174 skills=169 projects=3 issues=3
  warnings=0 errors=0`. `bash -n` + all three helper self-tests green;
  port-3100 untouched.

---

## [0.17.0] — 2026-06-11 — Sidebar scale mitigation on themed launches

### Added

- Themed launches (`--theme possiblaw` / `--theme light`) now inject a
  `<style id="possiblaw-sidebar-perf">` block into the UI overlay applying
  `content-visibility: auto; contain-intrinsic-size: auto 32px` to sidebar
  agent rows, so off-screen rows skip layout/paint at 174-agent scale.
  Selector is the Tailwind named-group class on `SidebarAgentItem`'s row
  wrapper (`ui/src/components/SidebarAgents.tsx`), verified verbatim in the
  built bundle. `--theme dark` removes the whole overlay as before; paperclip
  source stays untouched (layer-not-fork).

### Validation

- TDD red→green on `bin/_possiblaw_theme.py --self-test` (perf block present
  exactly once per overlay theme, escaped `.group\/agent` selector, inside
  `<head>`).
- EDGE: `--theme dark --dry-run` removed the overlay and the dry-run
  regression returned `agents=174 skills=169 projects=3 issues=3 warnings=0
  errors=0`.
- HAPPY: live themed launch on disposable port 3199 (mktemp data dir,
  `--skip-model-probe`): 174 agents imported, 0 warnings; curl readback of
  the served UI shows the perf block exactly once with the escaped selector,
  overlay marker intact; overlay re-applied cleanly after the dark removal.
- `bash -n bin/possiblaw` green; operator's port-3100 server untouched.

---

## [0.16.0] — 2026-06-11 — The catalog expansion: 174 agents / 169 skills across 34 teams

### Added

- **122 new atomic agents + 98 new skills** — the 100–200 expansion landed in one sprint.
- **20 new legal practice teams** under chief-counsel (lead + specialists each): tax, real estate, M&A, banking & finance, securities, restructuring & bankruptcy, immigration, healthcare, antitrust, trade compliance (sanctions/export/tariff), insurance, construction, government contracts, environmental & ESG, trusts & estates, family law, investigations & white collar, AI governance, advertising & consumer protection, benefits & executive compensation.
- **1 new business team** under chief-of-staff: legal operations (outside-counsel engagement, invoice audit, spend reporting).
- **Extensions to all 13 existing teams**: litigation (+6: discovery request/response, deposition summaries, settlement agreements, mediation statements, privilege logs), commercial (+4: MSA, SOW, amendments, obligation extraction), privacy (+3: DSRs, DPIAs, breach notifications), IP (+3: DMCA, assignments, trademark portfolio), corporate (+3: board minutes, entity compliance, cap tables), employment (+3: contractor classification, investigation intake, CBAs), regulatory (+3: license renewals, AML/KYC intake, COI screening), research (+3: 50-state surveys, case summaries, plain-language), finance (+2: prebills, trust accounting), ops (+2: conflicts screening, engagement letters), admin (+2: CLE tracking, proofreading), marketing (+2: client alerts, newsletters), BD (+2: experience database, competitive intel).
- `docs/agent-catalog.md` — generated full catalog (every team, agent, lane, and capability) for demos and orientation.
- Sensitive-data teams (estates, family law, investigations, plus visa petitions, privilege logs, breach notifications, workplace-investigation intake, DSRs) attach `privacy-encoder`; every agent carries no-external-transmission and operator-approval-gate rules; screening agents (sanctions, FCPA, conflicts, HSR) are flag-only by construction — they never clear, conclude, or file.
- Chief-counsel routing table now routes all 28 legal practices; chief-of-staff routes legal-ops; every new specialist has a routing row in its lead's table.
- `.paperclip.yaml`: 122 new sidecar blocks (lane-correct adapter params copied from the package-standard template, `adapterDecision: codex-local-default-2026-06-11`) + sidebar entries. Lane census: 3 primary / 33 routing / 52 drafting / 40 review / 46 extractive.

### Validation

- Roster validator: all 122 new agents match the planned roster exactly (frontmatter field order, skills block lists, reportsTo, verbatim Execution Contract, whitespace); all 98 new skills have frontmatter + Boundaries; every `skills:` ref across all 174 agents resolves.
- Cross-check: 174 disk == 174 sidecar == 174 sidebar; reportsTo graph fully resolves; chief-counsel/chief-of-staff routing targets all exist; zero lane-param violations.
- Dry-run e2e (disposable port 3199, fresh data dir): `agents=174 skills=169 projects=3 issues=3 warnings=0 errors=0`.
- Live import + readback on the same disposable server (`--skip-model-probe`, $0): 174 agents created; lane-inheritance spot checks exact (will-drafter drafting→high/900 with 4/4 skill bindings incl. privacy-encoder; lease-abstractor + privilege-log-builder extractive→medium/600; tax-lead routing→medium/600; legal-invoice-auditor + msa-drafter review/drafting→high/900); reportsTo resolved to live agent IDs (will-drafter→Trusts & Estates Lead, legal-ops-lead→Chief of Staff). Server killed, smoke dir removed, operator's port-3100 untouched.
- Static battery: `bash -n bin/possiblaw`, both helper `--self-test`s green.

### Notes

- The known-limitations sidebar-scale caveat is now live (174 agents); docs updated.
- Authored via 16 + 10 parallel subagents against a shared SPEC with a canonical roster JSON; integration (sidecar, sidebar, executive routing, docs, catalog) done centrally.

---

## [0.15.0] — 2026-06-10 — PossibLaw circuit-tree favicon on themed launches

### Added

- `branding/possiblaw-circuit-tree.png` (source logo) + `branding/favicon/` — full favicon set generated from it: `favicon.ico` (PNG-embedded 16/32/48), `favicon.svg` (SVG-wrapped 512px), `favicon-16x16.png`, `favicon-32x32.png`, `apple-touch-icon.png` (180), `android-chrome-192x192.png` / `-512x512.png`.
- Theme overlay now copies the branded set over the stock paperclip favicons. The stock `index.html` links and `site.webmanifest` reference these root files by name, so the swap needs zero HTML changes and survives the server's startup favicon-block rewrite. `--theme dark` reverts everything with the overlay.

### Validation

- `file` confirms a well-formed 3-icon ICO; `bash -n` green.
- Live e2e on a disposable themed server: `favicon.ico`, `favicon.svg`, `favicon-16x16.png`, `favicon-32x32.png`, `apple-touch-icon.png` each served byte-identical to `branding/favicon/`.

---

## [0.14.0] — 2026-06-09 — Practice-management, email, and drive connectors (18 connectors, 71 skills)

### Added

- **`connector-clio`** — Clio Manage API v4 (matters, contacts, time entries, bills). Regional base URLs and endpoints extracted from the official OpenAPI spec (docs.developers.clio.com, accessed 2026-06-09); OAuth 2.0 with 30-day access / non-expiring refresh tokens; bills read-only; matter content privacy-encoder-gated.
- **`connector-gmail`** / **`connector-outlook`** — matter email via the Gmail API and Microsoft Graph: read + draft creation ONLY. Sending is contractually blocked (`[CONNECTOR:*_SEND_BLOCKED]`; the send scopes are never requested) — drafts are work products for operator review, matching the package-wide no-external-transmission posture.
- **`connector-google-drive`** — Drive v3 doc store (list, fetch, upload to a matter folder); `drive.file` least-privilege scope recommended; no sharing or permission changes.
- All endpoint claims carry official-doc citations dated 2026-06-09 or explicit `UNCONFIRMED` flags (imanage-style) for the few unverified details.

### Validation

- Cross-check: 52 agents == sidecar == sidebar; 71 skills; all refs resolve; whitespace clean; new connector frontmatter parses with `name` == slug.
- Dry-run: `agents=52 skills=71 projects=3 issues=3 warnings=0 errors=0`.

---

## [0.13.0] — 2026-06-09 — Synthetic demo profiles (--demo) for three launch personas

### Added

- **`--demo <profile>`** on the launcher, merging a demo profile's synthetic projects/tasks into the import. Three profiles under `companies/demos/`, each a self-contained story with a README demo script (org name + mission to paste, run-the-demo task order, expected delegation chain per task):
  - `law-firm` — **Harbor & Finch LLP**, a fictional 12-lawyer boutique firm: client NDA + MSA review, client employment matters, firm BD (RFP with conflicts-check prerequisite, CRM hygiene), firm ops (invoice summary, intake SOP).
  - `inhouse-legal` — **Meridian Robotics Legal**, a fictional 5-person in-house department: vendor MSA review, partner NDA, DPA with SCC placeholders, data-incident tabletop, offer letter, handbook review, board consent, regulatory-change intake.
  - `biglaw-practice-group` — **Whitfield Sterling — Tech Transactions**, a fictional 40-lawyer group in a global firm: patent/know-how license, OSS compliance, due-diligence extraction, clause inventories, connector-backed research memo, citation check, litigation hold, docket monitoring.
- `bin/_possiblaw_inline_source.py --extra-root` (TDD red→green): merges only importer-discoverable PROJECT.md/TASK.md from extra roots (READMEs stay out of the import body); path collisions raise errors.
- Launcher: pre-server profile validation with available-profile listing; demo project/task counts logged with the README pointer.
- Docs: walkthrough demo section, README capability rows (demos + theme).
- Every entity, person, citation, case number, and statute in the demo data is fictional; each README carries the regulated-practice note once.

### Validation

- Helper self-tests green (incl. new extra-root merge + collision tests); `bash -n`; unknown-profile error path exits 2 before any server starts.
- Dry-run e2e ×3 (one per profile): all `agents=52 skills=67 projects=7 issues=11 warnings=0 errors=0`.
- Live import + readback (law-firm profile): 7 projects (4 demo in backlog + 3 base), all 8 demo tasks created in backlog with correct titles, 0 warnings.

---

## [0.12.0] — 2026-06-09 — Expansion batches 4–5: research, BD, ops teams + layer conversions (52 agents / 67 skills)

### Added

- **Legal research team** (reports to Chief Counsel): `research-lead` (routing) + `legal-research-analyst` (review; runs the 4 research connectors — CourtListener, Lexis, Westlaw, midpage — with a hard no-fabricated-citations rule) and `legal-citation-checker` (extractive; per-citation verification table, currency checks as operator follow-ups). Skills: `legal-research-playbook`, `citation-verification-checklist`.
- **Business development team** (reports to Chief of Staff): `bd-lead` (routing) + `bd-proposal-drafter` (drafting; never invents credentials, never sends to prospects, conflicts-check prerequisite for named adverse parties) and `bd-crm-coordinator` (extractive; HubSpot hygiene, merge/delete proposed as operator follow-ups). Skills: `bd-proposal-playbook`, `bd-crm-hygiene-checklist`.
- **Internal ops team** (reports to Chief of Staff): `ops-lead` (routing) + `ops-vendor-intake` (extractive), `ops-sop-curator` (drafting), `hr-internal-coordinator` (drafting; employment-LAW questions route to the employment practice). Skills: `ops-vendor-intake-checklist`, `ops-sop-playbook`, `hr-internal-onboarding-playbook`.
- **Layer conversions** (the last 6 unconverted layer/ agents): `clause-extractor` (extractive, under commercial-lead), `risk-spotter` (review, additive-only second-pass risk registers), `debate-judge` (review, adjudicates conflicting work products — operator decides), `reconciler` (drafting, merges resolved positions with a change log), `expense-categorizer` (extractive, under finance-lead), `pitch-polisher` (drafting, under marketing-lead). Skills: `clause-extraction-checklist`, `risk-spotting-checklist`, `debate-adjudication-playbook` (shared by judge + reconciler).
- Routing: chief-of-staff gains BD + internal-ops rows; chief-counsel gains research, second-pass-review, and adjudication rows; commercial/finance/marketing leads gain their new specialist rows with narrowed catch-alls.

### Validation

- Cross-check: 52 agents on disk == sidecar == sidebar; 67 skills; every skill ref and reportsTo resolves; lanes 3 primary / 16 drafting / 9 review / 12 routing / 12 extractive; whitespace clean.
- Dry-run preview: `agents=52 skills=67 projects=3 issues=3 warnings=0 errors=0`.
- Live import + readback on a disposable server: 52 agents, 0 warnings; lane spot-checks exact across all 5 new teams; skill bindings match frontmatter counts (research analyst 7/7 incl. 4 connectors); reportsTo resolved to live agent IDs.

---

## [0.11.0] — 2026-06-09 — Launch theme: light-first dashboard with the PossibLaw palette

### Added

- **`--theme possiblaw|light|dark`** on the launcher (default `possiblaw`; env override `POSSIBLAW_THEME`). paperclip already ships a complete light theme behind a per-browser localStorage toggle; the launcher now seeds new browsers to light mode and layers a warm cream-and-coral palette over the stock light tokens — without modifying the submodule. Mechanism: one-time UI build → patched copy of `index.html` served from `paperclip/server/ui-dist/` (the server's first static lookup path) + `PAPERCLIP_UI_DEV_MIDDLEWARE=false` for launcher-started servers. The in-app toggle always wins once a user sets it.
- `bin/_possiblaw_theme.py` — stdlib-only patch helper with `--self-test` (TDD): injects a localStorage seed script at the top of `<head>` (runs before the stock theme script, minification-proof) and the `possiblaw-theme` style block before `</head>`.
- Company `brandColor` warmed to `#F97316` (company avatar + picker badges).
- Docs: walkthrough theme section, known-limitations overlay caveats.

### Validation

- Helper self-test green; `bash -n`; all prior helper self-tests green.
- Live e2e on a disposable server: UI built once, overlay created with marker; served HTML asserts — seed script present at top of `<head>` (before the stock script), `possiblaw-theme` style present, hashed asset URLs return HTTP 200 through overlay symlinks.
- Failure paths: build failure warns and falls back to stock dark vite-dev UI; existing non-possiblaw `server/ui-dist` is never touched; `--theme dark` removes the overlay (marker-gated).

---

## [0.10.0] — 2026-06-09 — Gemini variants (10 variants total)

### Added

- **`gemini` variant** — Google models via paperclip's `gemini_local` adapter and the gemini CLI's OAuth subscription login. Lanes: `gemini-2.5-pro` (primary/drafting/review, 900s on drafting/review), `gemini-2.5-flash` (routing), `gemini-2.5-flash-lite` (extractive); pins date-stamped 2026-06-09 against the adapter catalog. No reasoning-effort knob exists on `gemini_local` (documented in known-limitations).
- **`gemini-api` variant** — same lanes, billed via `GEMINI_API_KEY` through the existing dual-auth secret_ref machinery (`gemini_local` accepts `adapterConfig.env` like claude/codex adapters).
- Launcher: gemini case in the preflight model probe (`gemini -m <model> -p`), stray-key warning on the subscription variant when `GEMINI_API_KEY`/`GOOGLE_API_KEY` is set, help-text updates.
- Docs: walkthrough setup section, README variant table (10 variants), known-limitations note.

### Validation

- `bash -n`, both helper self-tests, `--lint` (10 variants), `--list-variants` showing both new variants with requirements.
- Override mapping verified per-lane against the real `.paperclip.yaml`: chief-counsel → `gemini-2.5-pro`/600s, privacy-lead → `gemini-2.5-flash`, drafters/reviewers → `gemini-2.5-pro`/900s, extractive → `gemini-2.5-flash-lite`, no effort key emitted.
- Dry-run e2e on a disposable server: missing gemini CLI warns (dry-run) as designed; preview `agents=36 skills=57 projects=3 issues=3 warnings=0 errors=0`.
- Not validated machine-side: live gemini runs (gemini CLI not installed on this machine); the launch-time probe covers it operator-side.

---

## [0.9.0] — 2026-06-09 — Expansion batches 2–3: privacy, litigation, corporate, regulatory teams (36 agents / 57 skills)

### Added

- **Privacy/data-protection team** (reports to Chief Counsel): `privacy-lead` (routing) + `privacy-dpa-drafter` (drafting, SCC/IDTA placeholder rules, privacy-encoder gated), `privacy-policy-reviewer` (review), `privacy-incident-triage` (extractive; notification regimes and deadlines framed only as operator follow-ups). Skills: `privacy-dpa-playbook`, `privacy-policy-review-checklist`, `privacy-incident-intake-checklist`.
- **Litigation team** (reports to Chief Counsel): `litigation-lead` (routing; team-wide standing rule — never files, serves, or transmits to courts or opposing parties) + `litigation-hold-drafter` (drafting), `litigation-docket-monitor` (extractive, `connector-courtlistener`), `litigation-demand-response-drafter` (drafting; settlement-authority gate). Skills: `litigation-hold-playbook`, `litigation-demand-response-playbook`.
- **Corporate team** (reports to Chief Counsel): `corporate-lead` (routing) + `corporate-entity-drafter` (drafting; official-form preparation sheets, never files with any government office), `corporate-governance-reviewer` (review), `corporate-diligence-extractor` (extractive; privileged-document stop rule). Skills: `corporate-formation-playbook`, `corporate-governance-review-checklist`, `corporate-diligence-intake-checklist`.
- **Regulatory/compliance team** (reports to Chief Counsel): `regulatory-lead` (routing) + `regulatory-filing-drafter` (drafting; never submits to any regulator; enforcement/examination/subpoena → immediate chief-counsel escalation), `compliance-policy-reviewer` (review), `regulatory-change-monitor` (extractive; operator-supplied inputs only, dates flagged for confirm-and-calendar). Skills: `regulatory-filing-playbook`, `compliance-policy-review-checklist`, `regulatory-change-intake-checklist`.
- Chief Counsel routing: privacy, litigation, corporate, and regulatory rows now delegate to the new leads; the no-specialist catch-all narrows to real estate, tax, and other unstaffed practices.

### Changed

- `.paperclip.yaml`: 16 new agent blocks with per-lane adapter config and date-stamped adapter decisions; sidebar lists 36 agents.
- README / CLAUDE.md / operator walkthrough counts updated to 36 agents / 57 skills.

### Validation

- Cross-check: 36 agents on disk == sidecar == sidebar; 57 skills; every frontmatter skill ref resolves; every agent has a model lane (3 primary / 11 drafting / 6 review / 9 routing / 7 extractive); whitespace clean.
- Dry-run preview on a disposable server: `agents=36 skills=57 projects=3 issues=3 warnings=0 errors=0`.
- Live import + API readback on a disposable server (`--skip-model-probe`): 36 agents created; lane spot-checks exact (drafting → high/900s, review → high/900s, routing/extractive → medium/600s); skill bindings match frontmatter counts.

---

## [0.8.0] — 2026-06-09 — Expansion batch 1: employment + IP teams (20 agents / 46 skills)

### Added

- **Employment team** (reports to Chief Counsel): `employment-lead` (routing) + `employment-offer-letter-drafter` (drafting), `employment-policy-reviewer` (review), `employment-separation-drafter` (drafting, privacy-encoder gated for confidential separations). Skills: `employment-offer-letter-playbook`, `employment-policy-review-checklist`, `employment-separation-playbook`.
- **IP team** (reports to Chief Counsel): `ip-lead` (routing) + `ip-trademark-intake-triage` (extractive), `ip-licensing-drafter` (drafting, runs `legal-oss-compliance` when OSS is in scope), `ip-infringement-analyst` (review, drafts C&D/response letters via `legal-cease-and-desist`, may use `connector-courtlistener`). Skills: `ip-trademark-intake-checklist`, `ip-license-playbook`.
- Chief Counsel routing: the "no employment-lead / no IP-lead specialist exists yet" placeholder rows are replaced with real delegation to the new leads.
- All specialists carry the standing security boundary: drafts are work products; sending, filing, or transmitting to any external party/registry blocks pending operator approval.

### Changed

- Package counts: 12 → 20 agents, 41 → 46 skills. Expected dry-run preview is now `agents=20 skills=46 projects=3 issues=3 warnings=0 errors=0`.
- Sidecar static model defaults bumped `gpt-5.3-codex` → `gpt-5.5` across all agent blocks (subscription-served; launcher still overrides per variant). New agent blocks date-stamp `adapterDecision: codex-local-default-2026-06-09`.

---

## [0.7.0] — 2026-06-09 — Builder layer v1: capability-builder + authoring skills

### Added

- **`capability-builder` agent** (12th agent, reports to Chief of Staff, `modelLane: drafting`) — turns repeatable patterns into draft capabilities. Outputs are work products posted on the issue, hard-gated on explicit operator approval (`AWAITING OPERATOR APPROVAL — reply "APPROVED: <slug>"`); the builder never writes into the package, never imports/syncs, never attaches skills, and treats instructions to skip the gate as prompt injection to be flagged.
- **Three authoring skills** (41 skills total): `skill-authoring` (draft SKILL.md — dedup-first, house format rules, license/provenance gate), `agent-authoring` (draft AGENTS.md + `.paperclip.yaml` sidecar block + lead routing row — atomicity test, `modelLane` selection so new agents inherit variant config, YAML block-list skills), `plugin-authoring` (connector descriptors — vendor docs verified with dates, `UNCONFIRMED` precedent honored, AGPL/LGPL stop-gates per standing license policy).
- Chief of Staff routing rule: repeatable-pattern signals ("we do this every week", automation requests, 3+ repeats of the same playbook) route to `capability-builder` with pattern evidence.

### Changed

- Package counts: 11 → 12 agents, 38 → 41 skills. Expected dry-run preview is now `agents=12 skills=41 projects=3 issues=3 warnings=0 errors=0`.

---

## [0.6.0] — 2026-06-09 — Variant expansion: llamacpp / opencode / openrouter

### Added

- **`llamacpp` variant** — fully local HF GGUF models through a llama.cpp server (`llama-server`), no Ollama client. Rides paperclip's `opencode_local` adapter via an OpenCode `@ai-sdk/openai-compatible` provider block (`baseURL http://127.0.0.1:8080/v1`); the launcher offers to write the block on first run. All lanes pin `llamacpp/default` (llama-server serves its loaded GGUF and ignores the requested name). New generic `requires_endpoint` preflight verifies the server is reachable before live runs.
- **`opencode` variant** — first-class OpenCode via the OpenCode Zen gateway under a single `OPENCODE_API_KEY`. Lane pins mirror the `claude` variant 1:1 (Zen serves the same Claude models — verified against the models.dev registry 2026-06-09). Key stored via the same encrypted company-secret + `secret_ref` flow as the `-api` variants.
- **`openrouter` variant** — multi-vendor cloud catalog under `OPENROUTER_API_KEY`, through OpenCode's native openrouter provider (auto-enabled by the env key; no `opencode.json` block needed). Lane pins mirror the `claude` variant via OpenRouter IDs (dots, not dashes). Live launches verify each pin against the keyless public catalog (`openrouter.ai/api/v1/models`) and block with remediation on rot; `--skip-model-probe` bypasses.
- Privacy lane now recognizes llama.cpp: `skills/privacy-encoder/SKILL.md` §0 accepts either a reachable Ollama daemon or a llama-server as the required local lane for confidential/privileged matters, and the launcher's startup warning keys off a new `local: true` variants.yaml flag (ollama, llamacpp) instead of hardcoding Ollama.
- `bin/_possiblaw_variants.py --lint` — structural validation of variants.yaml (adapterType/model presence, mapping shapes, OpenCode `provider/model` model-id format on `opencode_local` variants), covered by `--self-test`.

### Changed

- Environment preflights (variant CLI presence, Ollama daemon, endpoint reachability, OpenCode provider config) now **warn on `--dry-run` instead of blocking** — the preview is server-side and never invokes the variant runtime. Live runs still block. This matches the existing dry-run behavior of the API-key checks.
- The launcher's auto-written OpenCode config template is now per-provider (ollama and llamacpp templates shipped; other providers get manual instructions).

### Fixed

- Missing `~/.config/opencode/opencode.json` on a live non-interactive run now exits non-zero; previously it printed errors and continued into a launch that would fail at the first agent run.

---

## [0.5.0] — 2026-06-09 — Dual-auth: API-key variants + preflight model probe

### Added

- `codex-api` and `claude-api` variants in `companies/legal-operations/variants.yaml` — same models/lanes as their subscription twins, billed against `OPENAI_API_KEY` / `ANTHROPIC_API_KEY`. After import the launcher stores the key once as a paperclip company secret (provider `local_encrypted`, encrypted at rest) and binds all 11 agents to it via `adapterConfig.env` `secret_ref` references. The raw key never appears in package files, the import body, logs, or temp files (validated by grep against a live e2e run).
- Preflight model probe: live launches of CLI variants probe each distinct lane model with one minimal request (`claude -p` / `codex exec`), so "you don't have access to this model" errors block at launch with remediation options instead of failing mid-issue. New `--skip-model-probe` flag; dry-runs never probe.
- Preflight key checks: `*-api` variants block (live) or warn (dry-run) when the required key is missing; subscription variants warn when a stray matching API key in the shell would silently flip CLI billing to the API account.
- `bin/_possiblaw_variants.py` new modes: `--show-secret-env`, `--list-models`, `--build-env-patches` (all covered by `--self-test`).

### Fixed

- **Codex subscription variant repinned `gpt-5.3-codex` → `gpt-5.5`.** Probed live on codex 0.137 (2026-06-09): ChatGPT-subscription accounts get `"The 'gpt-5.3-codex' model is not supported when using Codex with a ChatGPT account"` (same for `gpt-5.5-codex`); the default `gpt-5.5` works. This was the root cause of subscription launches failing with model-access errors. `codex-api` pins `gpt-5.5-codex` (codex-tuned, API-served; verified at launch by the probe). Full subscription e2e validated: probe pass → 11 agents imported → 0 warnings, no API key in the environment.
- Probe hardening: stdin redirected from `/dev/null` (codex exec reads non-TTY stdin) and codex probes force `model_reasoning_effort=low` so they stay fast and cheap regardless of the operator's codex config.
- `bin/possiblaw --port` was never passed to `paperclipai onboard` (which reads `$PORT`), so custom ports health-checked an address nothing listened on. Worked before only because port 3100 was free or already running paperclip.
- `json_get_str` fed its Python program through stdin via heredoc, clobbering the JSON the caller piped in — `company.id` always parsed empty on live imports, silently skipping the mission PATCH. Both stdin-reading helpers now use `python3 -c`. Mission PATCH verified working live for the first time.
- Model-probe diagnostics fall back to stdout when the CLI prints access errors there (claude does).

---

## [0.4.0] — 2026-06-09 — Phase 1 reset: standalone CLI runtime removed

### Removed

- `cli/` — the entire standalone CLI runtime (pipeline, provider registry, eval harness, test/guardrail runners, connectors, audit, privacy filter). Paperclip natively provides everything this reimplemented: orchestration, UI, auth, adapters, budgets, audit, approvals. All code remains in git history (`git log --oneline -- cli/`).
- `bin/possiblaw.dev` (tsx stub for the deleted CLI), top-level `package.json`, `tsconfig.json`, `pnpm-lock.yaml`, `.github/workflows/ci.yml` (CI for the deleted runtime).
- CLI-era docs: `docs/sprint-{2,4,5,6,7,8,9,10,11}-demo.md`, `docs/sprint-2-handoff.md`, `docs/DEMO-SCRIPT.md`, `docs/getting-started.md` (superseded by `docs/operator-walkthrough.md`), `docs/auth.md`, `docs/evals.md`, `docs/workflows.md`, `docs/test-and-guardrail-model.md`, `docs/customize-your-team.md`, `docs/extending/` (5 guides).

### Changed

- `README.md` — capability table, architecture diagram, evals section, and documentation index rewritten for the package-first reality; historical CUAD receipt retained.
- `docs/announcement.md` — getting-started link now points at `docs/operator-walkthrough.md`.
- `CLAUDE.md` — Stack / Commands / Code Map rewritten for the package + launcher layout.

### Fixed

- `bin/possiblaw` — `yaml_to_json` resolved `js-yaml` from the repo's top-level `node_modules` (a dependency of the deleted CLI runtime), so it would break on any clone that never ran the old `pnpm install`. It now resolves js-yaml inside paperclip's pnpm store and fails with a clear `pnpm -C paperclip install` hint when absent.

### Kept deliberately

- `layer/` — unconverted source material (eval datasets + scorer concepts, workflow shapes, agent prompts). Converts into the package incrementally; delete only after conversion completes.

---

## [0.3.0] — 2026-05-23 — Branded one-command onboarding + multi-variant package

### Added

- `bin/possiblaw` — branded one-command launcher. Prompts for variant / org name / mission, runs `paperclipai onboard --yes` in the background, builds and POSTs the company import body directly to `/api/companies/import` (so the full `adapterOverrides` schema is available — model, reasoning effort, timeout per agent), PATCHes the mission as company description, and opens the dashboard URL. Replaces the older `bin/possiblaw-launch`.
- `companies/legal-operations/variants.yaml` — variant matrix for `codex` / `claude` / `ollama`. Pivots on each agent's `metadata.possiblaw.modelLane` so new agents inherit the right adapter config automatically.
- `bin/_possiblaw_variants.py` and `bin/_possiblaw_inline_source.py` — pure Python (stdlib-only) helpers with `--self-test` modes. The bash launcher converts YAML → JSON via paperclip's bundled `js-yaml`, then feeds JSON to these helpers to build the import body.
- `companies/legal-operations/skills/privacy-encoder/SKILL.md` — Ollama health check at the top of "When To Invoke". Confidential/privileged matters now BLOCK at runtime if Ollama isn't reachable, with install hints in the comment.
- `bin/possiblaw` preflight — scans the package for matters with `privacyTier: confidential|privileged` and warns (non-blocking) if Ollama is not running at launch time.
- `companies/legal-operations/evals/` — README documenting the eval convention (routine → eval-runner skill → judge agent → `eval-results` project) and a `cases/.gitkeep` placeholder.
- `companies/legal-operations/projects/eval-results/PROJECT.md` + `.paperclip.yaml` entry — placeholder project, lead = chief-of-staff until the eval-judge agent ships.
- `docs/known-limitations.md` — importer non-atomicity, sidebar jank at scale, Ollama variant quality caveat, hybrid-variant deferral.

### Changed

- `docs/operator-walkthrough.md` — rewritten for the one-command launcher flow. Adds per-variant setup (codex / claude / ollama + OpenCode global config example) and the Ollama+OpenCode prerequisite section.
- `README.md` — "Current Direction" quickstart now points at `./bin/possiblaw`.

### Removed

- `bin/possiblaw-launch` — the v1 launcher. The new `bin/possiblaw` replaces it with variant support, direct HTTP POST (so `adapterOverrides.adapterConfig` is no longer stripped), and a cleaner single-entrypoint UX. Same preflight + health-poll + signal-trap machinery, lifted in.

### Validation

End-to-end dry-run smoke (`codex` variant) against a fresh data dir: `agents=11 skills=38 projects=3 issues=3 warnings=0 errors=0` in ~18 seconds. Live runs for `claude` and `ollama` variants are operator-side validation (covered in the operator walkthrough).

---

## [0.2.0] — 2026-05-21 — Sprint 11: Subscription-auth providers

### Added

- `claude-cli/*` and `codex-cli/*` providers — route LLM calls through local Claude Code / Codex CLI subscriptions instead of API keys.
- `--provider <name>` flag on `possiblaw run` and `possiblaw eval` — uniform provider override per run (`anthropic | claude-cli | codex-cli | ollama`).
- `--model <name>` flag — override the per-provider default model for a single run (defaults: `claude-sonnet-4-6` / `sonnet` / `gpt-5.5` / `llama3.1:8b`).
- `--max-budget-usd` automatically forwarded to `claude -p` when running evals with `--provider claude-cli --budget <n>`.
- `docs/auth.md` — provider comparison and choice guide.
- `docs/sprint-11-demo.md` — same NDA prompt run four ways.

### Changed

- Subscription provider rows in the cost report show the literal string `subscription` instead of `$0.0000`, so subscription billing is visually distinct from truly free local/offline runs.
- Privacy Filter cloud-mode now covers `claude-cli/*` and `codex-cli/*` in addition to `anthropic/*`. `ollama/*` remains local-only and is not masked.
- LLM-judge tests route through the provider registry so soft tests respect `--provider` (no longer hard-coded to the Anthropic SDK).

### Fixed

- `team set-model` model-string regex extended to accept `claude-cli/*` and `codex-cli/*` provider prefixes.

### Internal

- `cli/anthropic.ts` reduced to a thin shim that re-exports from the new `cli/llm.ts` provider registry. `cli/llm.ts` is now the single dispatch point for all four providers.
- Commit map: `1f63fa7` (llm.ts providers) → `0118bf3` (--provider / --model flags) → `abdfbae` (LLM-judge tests routed through provider registry).

---

## [Unreleased]

### Governance — PossibLaw Agent Starter Pack adoption (2026-05-21)

- Bootstrapped the official PossibLaw Agent Starter Pack contracts via `scripts/bootstrap-project.sh --preserve-progress`.
- **New tracked files:**
  - `AGENTS.md` — Codex project instruction file with full startup contract + routing + contract pipeline rules
  - `CLAUDE.md` — replaced the session-written stub with the canonical scaffold; filled in Repo Root, project description, Stack, Code Map sections with PossibLaw specifics
  - `docs/roles/{product-strategist,engineering-planner,reviewer,security-reviewer,qa-validator,docs-releaser,README}.md` — canonical role contracts
  - `docs/workflows/{contracts,evals,wiki,graphify}.md` — typed PLAN→TEST→REVIEW→HANDOFF contract + evals + optional wiki/graphify modes
  - `docs/vendor/{README,supabase}.md` — vendor reference contract (Supabase is the canonical example; not used by PossibLaw but the example pattern is the canonical one)
  - `docs/glossary.md` — shared term definitions
  - `.agent/{CONTEXT,TASKS,REVIEW,TEST,WIKI,LEARNINGS}.md` — scaffolded contract artifacts (LOCAL-only per Starter Pack convention; tracked here for the v0.1.0 baseline)
  - `.agent/integrations/{run-checkpoint.sh,run-checkpoint.ps1,mempalace-ingest.sh,mempalace-ingest.ps1,README.md}` — optional continuity-checkpoint helpers
  - `.claude/skills/{closing-sprint-and-syncing-state,running-novice-safe-git-cycle}/SKILL.md` — repo-local workflow skills
- **`.gitignore`** updated by the bootstrap to mark `.agent/PLAN.md`, `.agent/HANDOFF.md`, `.claude/history.md`, and the new scaffolds as local-only going forward.
- **`.agent/PLAN.md`, `.agent/HANDOFF.md`, `.claude/history.md`** preserved (real Sprint 0–10 + Sprint 11 content); HANDOFF carries a note that they remain tracked despite the new convention because the next coding agent needs them.

---

## [0.1.0] — 2026-05-21 — Public launch readiness (Sprint 10)

### Sprint 10 — Public launch readiness

- **`README.md`** — Rewritten announcement-quality (≤260 lines): hero section with disclaimer in lead, "Try it in 5 minutes" with expected output, capabilities table, ASCII architecture diagram, What's NOT in this PoC, posture, evals placeholder, full docs index, license, acknowledgements. Shields.io badges added.
- **`SECURITY.md`** — New. PoC-realistic security posture: supported versions, reporting via GitHub Security Advisory, in-scope and out-of-scope, 7 known threats (Privacy Filter offline fallback, cloud call without filter, key store plain-text, audit log writability, connector credentials in env, UNCONFIRMED connector schemas, key store no expiry).
- **`.github/ISSUE_TEMPLATE/bug_report.md`** — New. Structured bug report: what happened, expected, repro, env table, audit log path, screenshots.
- **`.github/ISSUE_TEMPLATE/feature_request.md`** — New. Feature request: what, why, alternatives, willingness to PR.
- **`.github/ISSUE_TEMPLATE/connector_request.md`** — New. Connector request: service, API docs, auth flow, capabilities, sandbox availability.
- **`.github/ISSUE_TEMPLATE/config.yml`** — New. Contact links: Discussions + Security Advisory. Disables blank issues.
- **`docs/getting-started.md`** — New. Stranger-friendly Quickstart ~150 lines: prerequisites, install, first workflow, API key, switch templates, customize, connectors, Privacy Filter, cost reporting, what now.
- **`docs/extending/add-a-specialist.md`** — New. Step-by-step guide: create agent file, frontmatter reference, add to template, add offline fixture, verify. Ends with `team list | grep <new-specialist>`.
- **`docs/extending/add-a-workflow.md`** — New. Step-by-step guide: all 7 step kinds, 3 YAML patterns (minimal, parallel, debate), YAML validation, build + verify. Ends with `workflows show <new>`.
- **`docs/extending/add-a-test.md`** — New. Step-by-step guide: soft vs hard distinction, LLM-judge and rule types, frontmatter reference, calibration, add to workflow, verify.
- **`docs/extending/add-a-guardrail.md`** — New. Step-by-step guide: hard guardrail vs soft test when-to-use table, rule and LLM-judge types, frontmatter reference, add to workflow, verify.
- **`docs/extending/add-an-mcp-connector.md`** — New. Step-by-step guide: 3 patterns (SDK, HTTP-only, OAuth), full copy-paste TypeScript for SDK and HTTP patterns, register in index, YAML descriptor, `.env.example`, wire to agent, verify.
- **`docs/outreach/outside-operator.md`** — New. 200-word email template for outside operator ask: PoC disclaimer, Privacy Filter, cost transparency, audit trail.
- **`docs/outreach/outside-reviewer.md`** — New. 200-word email template for outside dev reviewer ask: specific extending-docs task, time estimate, acknowledgements.
- **`docs/announcement.md`** — New. 300-word launch post drafts for Hacker News and LinkedIn.
- **`docs/getting-started.md`** (Sprint 10 Quickstart) — verified in fresh-clone simulation (Step 9).
- **`docs/sprint-10-demo.md`** — New. Fresh-clone simulation walkthrough and results.
- **`package.json`** — Version bumped `0.0.1 → 0.1.0`. Added `keywords`, `repository`, `homepage`, `bugs` fields.
- **`CONTRIBUTING.md`** — Updated clone URL from placeholder `<repo-url>` to canonical GitHub URL; corrected `cd possiblaw-v2` to `cd possiblaw`.

## [Unreleased]

### Sprint 9 — Eval suite (CUAD, MAUD, ACORD, UNFAIR-ToS, LEDGAR)

- **`layer/evals/datasets/cuad/fetch.ts`** — HF `theatticusproject/cuad-qa` fetch script. Idempotent. `--limit N` flag. Writes `cache/samples.jsonl` + updates `METADATA.json` timestamp. Exports `loadSamples()` / `isCached()`. Falls back to bundled `fixtures.jsonl`.
- **`layer/evals/datasets/maud/fetch.ts`** — HF `theatticusproject/maud` fetch script. Same interface.
- **`layer/evals/datasets/acord/fetch.ts`** — Synthetic ACORD-schema samples (research use; no real ACORD form content). 3 hand-curated samples for ACORD 25/27 field extraction. Falls back to in-memory defaults when cache absent.
- **`layer/evals/datasets/unfair-tos/fetch.ts`** — HF `lex_glue/unfair_tos` fetch script. CC BY 4.0.
- **`layer/evals/datasets/ledgar/fetch.ts`** — HF `lex_glue/ledgar` fetch script. CC BY 4.0.
- **`layer/evals/datasets/<name>/METADATA.json`** — License, citation, source URL, paper URL recorded for all 5 datasets.
- **`layer/evals/datasets/cuad/fixtures.jsonl`** — 3 hand-curated CUAD samples (Governing Law, Termination For Convenience, Agreement Term) for offline / CI use.
- **`cli/eval-scorers.ts`** — Per-dataset scoring functions: `scoreCuad` (word-level F1 over spans), `scoreMaud` (substring exact-match), `scoreUnfairTos` (binary keyword classifier), `scoreLedgar` (substring topic match), `scoreAcord` (per-field presence match). `buildConfusionMatrix()` helper.
- **`cli/eval-adapters.ts`** — Per-dataset matter-prompt adapters: `adaptCuad`, `adaptMaud`, `adaptAcord`, `adaptUnfairTos`, `adaptLedgar`, plus `adaptSample()` dispatcher. `KnownDataset` union type.
- **`cli/eval.ts`** — Main eval harness: `runEval(opts)` loads samples, runs workflow per sample (or stub in dry-run), scores, aggregates (mean/median/std-dev), builds confusion matrix for classification tasks, writes Markdown + JSON reports. Budget abort at 95% utilization (exit code 2). Offline path uses source-tree fixtures with no dynamic import.
- **`cli/index.ts`** — `eval` command fully activated (was placeholder):
  - `eval list-datasets` — 5-row table with cache status and license.
  - `eval fetch <dataset> [--limit N]` — runs fetch script.
  - `eval --dataset --workflow [--sample-size --budget --output --dry-run]` — main run command.
- **`tsconfig.json`** — `include` extended to `layer/evals/datasets/**/*.ts`.
- **`package.json`** — Build script copies `cuad/fixtures.jsonl` to `dist/`; ensures `layer/evals/results/` exists.
- **`.gitignore`** — Dataset cache dirs and `layer/evals/results/` added (with `.gitkeep`).
- **`README.md`** — "Evals" section with placeholder table, dry-run and offline demo commands.
- **`docs/evals.md`** — Full reference: each dataset's license + citation, each adapter's prompt template, each scorer's tolerance, budget mechanism, output format, offline mode.
- **`docs/sprint-9-demo.md`** — Step-by-step walkthrough: list-datasets, dry-run, offline fixture eval, HF fetch, real run, deep-review, exit codes.

### Sprint 8 — Workflow library (Deep Review, Stress Test, Roundtable + per-surface variants + CLI workflow picker)

- **`cli/types.ts`** — Extended `PipelineStep` union with three new step kinds:
  - `parallel: { count, temperatures, resolved_by }` — N-branch parallel specialist dispatch
  - `reconcile: { agent }` — merge N parallel outputs into a single deliverable
  - `debate: { participants, rounds, judge }` — multi-round adversarial exchange + judge verdict
  - New types: `BranchOutput`, `DebateRound`, `BranchRecord`. `RunReport` extended with `branches?: BranchRecord[]`. `RunStepResult` extended with `branchRecord?: BranchRecord`.
- **`cli/anthropic.ts`** — `RunAgentOpts` extended with optional `temperature?: number`; passed to Anthropic API via spread. `offlineFixture()` now handles `reconciler`, `risk-spotter`, and `debate-judge` with realistic multi-paragraph stubs. `marketingLeadRoute()` added: routes to `pitch-polisher` for pitch/polish/deck/proposal prompts, `intake-form-drafter` otherwise.
- **`cli/pipeline.ts`** — Major extension:
  - Refactored Phase 2 into `runOneAgent()` (accepts temperature) + `runSpecialist()` wrapper.
  - New parallel branch: detects `parallel` step, dispatches specialist N times with `Promise.all` and diverse temperatures; collects `BranchOutput[]`.
  - New reconcile branch: formats labeled blocks, calls reconciler agent, sets deliverable.
  - New debate branch: multi-round round-robin; each participant sees all other positions from prior round; judge synthesizes verdict.
  - All `buildReport()` calls updated to pass `branches: branchRecords`.
- **`cli/loader.ts`** — `listWorkflowNames()` helper added (returns sorted list from `layer/workflows/`).
- **`cli/index.ts`** — `workflows` subcommands expanded:
  - `workflows list` — table: name, shape summary, estimated cost for all 9 workflows.
  - `workflows show <name>` — updated to render `parallel`, `reconcile`, `debate` step kinds; uses new `resolveAgentsForCost()` helper that multiplies specialist calls for parallel/debate shapes.
  - `workflows pick` — interactive numbered picker via `readline`; prints name and exits.
- **Meta-agents** (workflow primitives, not domain specialists):
  - `layer/agents/specialists/legal/_meta/reconciler.md` — model `claude-opus-4-7`. Merges N labeled blocks; required `## Reconciliation notes` section.
  - `layer/agents/specialists/legal/_meta/debate-judge.md` — model `claude-opus-4-7`. Verdict + Dissent + Risks structure.
  - `layer/agents/specialists/legal/_meta/risk-spotter.md` — model `claude-sonnet-4-6`. Adversarial worst-case scenarios, missing clauses, ambiguous language.
- **New cross-surface workflows:**
  - `layer/workflows/deep-review.yaml` — router → 3× parallel (temps 0.2/0.7/1.0) → reconcile → tests → guardrails.
  - `layer/workflows/stress-test.yaml` — router → debate(nda-drafter + risk-spotter, 3 rounds, judge: debate-judge) → guardrails.
  - `layer/workflows/roundtable.yaml` — router → debate(nda-drafter + billing-prep + pitch-polisher, 3 rounds, judge: debate-judge) → guardrails.
- **New per-surface variants:**
  - `layer/workflows/quick-pitch-polish.yaml` — chief-of-staff → marketing-lead → pitch-polisher → tests.
  - `layer/workflows/quick-expense-categorize.yaml` — chief-of-staff → finance-lead → expense-categorizer → no tests.
- **Docs:**
  - `docs/workflows.md` (new) — workflow schema reference: all 7 step kinds, meta-agent catalog, workflow catalog, extension guide.
  - `docs/sprint-8-demo.md` (new) — end-to-end demo: all 4 cross-surface workflows on the same NDA prompt, comparison table.
  - `docs/DEMO-SCRIPT.md` — "Workflow library" section appended.

---

### Sprint 7 — Roster customization (team add/remove/rename/export/diff + customize-your-team guide)

- **`cli/template-overrides.ts`** — New module: `.possiblaw/template-overrides.yaml` read/write. `addToTemplateRoster()`, `removeFromTemplateRoster()`, `renameInTemplateOverrides()`, `applyRosterOverrides()`. Schema: `templates.<name>.roster.<section>.add/remove` lists.
- **`cli/loader.ts`** — `loadAgent()` now searches `.possiblaw/custom-agents/` before `layer/agents/` (custom agents shadow layer agents on name collision). `loadTemplate()` applies `applyRosterOverrides()` overlay. `listAgentNames()` merges both directories. New `listCustomAgentNames()` helper.
- **`cli/anthropic.ts`** — `offlineFixture()` fallback returns `[OFFLINE STUB FOR <name>]` for any unrecognized agent (dynamic stub pattern; works for all future custom agents). `commercialLeadRoute()` added for content-based routing to employment/handbook specialists offline.
- **`cli/index.ts`** — New team subcommands:
  - `possiblaw team add specialist <domain/name> --lead <lead> [--template <t>]` — scaffolds `.possiblaw/custom-agents/<name>.md` + patches `template-overrides.yaml`.
  - `possiblaw team add lead <domain/name> --router <router> [--template <t>]` — same pattern for lead agents.
  - `possiblaw team add router <name> [--template <t>]` — same pattern for router agents.
  - `possiblaw team remove <name> [--template <t>]` — removes from roster; preserves custom-agent file; refuses if another agent's `manages` list references the target.
  - `possiblaw team rename <old> <new>` — renames file + frontmatter `name:` + refs in `template-overrides.yaml` and `overrides.yaml`; custom agents only.
  - `possiblaw team list --diff` — shows added/removed vs. base template.
  - `possiblaw team export <template> --output <path>` — full effective snapshot YAML (roster, per-agent frontmatter with overrides applied, custom_agents list, overrides_applied log).
  - `possiblaw team diff <a> <b>` — structured diff: routers/leads/specialists added/removed, per-agent model changes, workflows added/removed.
- **`.possiblaw/custom-agents/employee-handbook-drafter.md`** — Demo custom specialist created via Sprint 7 `team add` workflow; real system prompt filled in (PTO policy focus, US federal defaults, required disclaimer).
- **`.possiblaw/template-overrides.yaml`** — Sprint 7 demo state: `employee-handbook-drafter` added to `small-firm.specialists`.
- **`docs/customize-your-team.md`** — Non-engineer-facing guide: concepts in 30 seconds, 6 common-task recipes with copy-paste CLI examples, full frontmatter cheat-sheet, recovery instructions, what-you-can't-do-yet list.
- **`docs/sprint-7-demo.md`** — End-to-end Sprint 7 demo walkthrough: add specialist, fill in prompt, verify roster, run offline, export, remove.

---

### Sprint 6B — Live adapters for remaining named connectors + v1 inventory

- **Legal enterprise connectors** (paid tier, HTTP-only adapters):
  - `cli/connectors/imanage.ts` — iManage Work API v2. Bearer-token auth (OAuth documented in `imanage.README.md`). Capabilities: `documents.list`, `documents.get`, `documents.put`, `folders.list`. Stand-in: `local-fs-doc-store`.
  - `cli/connectors/netdocuments.ts` — NetDocuments REST API v2. OAuth bearer token. Capabilities: `documents.list`, `documents.get`, `documents.put`, `workspaces.list`. Stand-in: `local-fs-doc-store`.
  - `cli/connectors/westlaw.ts` — Thomson Reuters Westlaw Edge API. UNCONFIRMED: base URL `https://api.westlaw.com/v1/` and request shapes are placeholders; enterprise TR contract required. Capabilities: `cases.search`, `cases.get`, `citations.kbcheck`. Stand-in: `courtlistener`.
  - `cli/connectors/lexis.ts` — LexisNexis API. UNCONFIRMED: base URL `https://api.lexis.com/v1/` and request shapes are placeholders; enterprise LN contract required. Capabilities: `cases.search`, `cases.get`, `citations.shepardize`. Stand-in: `courtlistener`.
- **Business open-access connectors** (official SDKs):
  - `cli/connectors/quickbooks.ts` — QuickBooks Online via `node-quickbooks` SDK. OAuth 1.0a. Free Intuit Developer sandbox. Capabilities: `customers.list`, `invoices.create`, `invoices.list`, `accounts.list`.
  - `cli/connectors/hubspot.ts` — HubSpot CRM via `@hubspot/api-client` SDK. Private app access token. Capabilities: `contacts.list`, `contacts.create`, `companies.list`, `deals.create`.
  - `cli/connectors/notion.ts` — Notion workspace via `@notionhq/client` SDK. Internal integration token. Capabilities: `pages.create`, `pages.update`, `databases.query`, `search`.
  - `cli/connectors/linear.ts` — Linear issue tracker via `@linear/sdk`. Personal API key. Capabilities: `issues.list`, `issues.create`, `teams.list`, `projects.list`.
- **Per-connector READMEs** for non-obvious setups:
  - `cli/connectors/imanage.README.md` — Bearer token + OAuth 2.0 client credentials flow walkthrough.
  - `cli/connectors/westlaw.README.md` — UNCONFIRMED reconciliation checklist for TR enterprise contract holders.
  - `cli/connectors/lexis.README.md` — UNCONFIRMED reconciliation checklist for LN enterprise contract holders.
- **`layer/connectors/<id>.yaml`** — Declarative descriptors for all 8 new connectors.
- **`cli/connectors/index.ts`** — Updated to import all 8 new connector modules (14 total registered).
- **`package.json`** — Added `@hubspot/api-client ^11`, `@linear/sdk ^29`, `@notionhq/client ^2`, `node-quickbooks ^2` (dependencies); `@types/node-quickbooks ^2` (devDependencies).
- **`.env.example`** — New grouped sections for all 8 connectors; all marked NOT REQUIRED for offline demo.
- **Agent wiring** (connector declarations only; runtime dispatch is Sprint 7):
  - `pitch-polisher` — Added `connectors: [hubspot, notion]`.
  - `intake-form-drafter` — Added `connectors: [hubspot, notion]`.
  - `billing-prep` — Extended from `[stripe]` to `[stripe, quickbooks]`.
  - `calendar-coordinator` — Added `connectors: []` with comment noting Google Workspace / M365 are deferred to Sprint 6B+ (see `docs/connectors-inventory.md`).
- **`docs/connectors-inventory.md`** — v1 connector inventory: 14 live connectors (3 stand-ins + 11 live) listed in full, plus 14 deferred v1 targets documented (Clio, MyCase, Rocket Matter, Filevine, Smokeball, Tabs3, Litera, Kira, Relativity, Slack, Zoom, Google Workspace, Microsoft 365, Salesforce, Zapier) with name, category, API surface, status, and stand-in equivalents.
- **`docs/sprint-6-demo.md`** — Sprint 6B walkthrough added: updated architecture diagram, 5 new demo commands, UNCONFIRMED connector guidance, and connector inventory reference.
- **`docs/DEMO-SCRIPT.md`** — Sprint 6 section updated to reflect 14-connector total.

---

### Sprint 6A — Connector framework + open-access stand-ins + 3 reference live connectors

- **`cli/connectors/types.ts`** — `ConnectorMetadata`, `ConnectorClient`, `ConnectorFactory`, `HealthcheckResult` interfaces. Every connector implements `ConnectorClient`.
- **`cli/connectors/registry.ts`** — `registerConnector()`, `getConnector()`, `listConnectors()`, `listConfigured()`. Self-registration pattern: each module calls `registerConnector` at load time.
- **`cli/connectors/index.ts`** — Connector loader: imports all 6 connector modules (triggering registration) and re-exports registry helpers.
- **Open-access stand-ins** (no credentials required, always work):
  - `cli/connectors/local-fs-doc-store.ts` — iManage / NetDocuments stand-in. Reads/writes `layer/connectors/local-docs/`. Capabilities: `documents.list`, `documents.get`, `documents.put`.
  - `cli/connectors/no-op-signature.ts` — DocuSign stand-in. Writes JSON to `layer/connectors/local-signatures/<uuid>.json`. Capabilities: `signature.request`, `signature.status`.
  - `cli/connectors/courtlistener.ts` — Westlaw / Lexis stand-in. CourtListener free public API (`/search/` endpoint). Capabilities: `cases.search`, `cases.get`.
- **Reference live connectors** (demonstrate the 3 SDK patterns Sprint 6B will replicate):
  - `cli/connectors/stripe.ts` — official SDK pattern. `stripe` npm package. Env: `STRIPE_API_KEY`. Capabilities: `customers.list`, `customers.create`, `invoices.create`, `payment_links.create`.
  - `cli/connectors/midpage.ts` — HTTP-only pattern. Plain `fetch` with Bearer token. Env: `MIDPAGE_API_KEY`. UNCONFIRMED schema — see `cli/connectors/midpage.README.md`.
  - `cli/connectors/docusign.ts` — OAuth-ish enterprise pattern. `docusign-esign` npm package. JWT auth flow. Env: `DOCUSIGN_INTEGRATION_KEY`, `DOCUSIGN_USER_ID`, `DOCUSIGN_ACCOUNT_ID`, `DOCUSIGN_PRIVATE_KEY_PATH`, `DOCUSIGN_BASE_PATH`. Capabilities: `envelopes.create`, `envelopes.status`.
- **`layer/connectors/<id>.yaml`** — Declarative descriptors for all 6 connectors.
- **`cli/types.ts`** — `Agent` extended with `connectors: string[]` field.
- **`cli/loader.ts`** — `loadAgent()` maps `fm['connectors']` to the new field.
- **`layer/agents/specialists/finance/billing/billing-prep.md`** — Added `connectors: [stripe]`.
- **`layer/agents/specialists/legal/commercial/nda-drafter.md`** — Added `connectors: [local-fs-doc-store]`.
- **`cli/index.ts`** — New command group: `possiblaw connectors list / check <id> / capabilities <id>`.
- **`.env.example`** — Created with grouped env vars for all 3 live connectors. Stand-ins need no env vars.
- **`package.json`** — Added `stripe ^17`, `docusign-esign ^6`, `@types/docusign-esign ^5`.
- **`docs/DEMO-SCRIPT.md`** — Sprint 6A connectors section appended.
- **`docs/sprint-6-demo.md`** — Full Sprint 6 walkthrough scaffold (6A complete; 6B roadmap).

---

### Sprint 5 — Per-agent model overrides + cost transparency

- **`cli/overrides.ts`** — Per-operator model overrides. Reads `.possiblaw/overrides.yaml` (repo-local, gitignored); falls back to `~/.possiblaw/overrides.yaml`. `loadOverrides()`, `getEffectiveModel()`, `writeOverride()`.
- **`cli/loader.ts`** — `loadAgent()` now calls `getEffectiveModel()` and logs any override applied to stderr. New `listAgentNames()` helper for CLI validation.
- **`cli/pricing.ts`** — Token pricing module. Snapshot: 2026-05-20. `costForCall()`, `estimateWorkflowCost()`, `formatCost()`. Prices: Opus 4.7 $15/$75, Sonnet 4.6 $3/$15, Haiku 4.5 $0.80/$4.00 per 1M tokens. `ollama/*` and offline runs are $0.
- **`cli/anthropic.ts`** — Now routes to `cli/ollama.ts` for `ollama/<model>` provider. Falls back to offline fixtures if Ollama is unreachable. Existing `anthropic/` and bare model names are unchanged.
- **`cli/ollama.ts`** — `chat()` now accepts optional `model` parameter to override `OLLAMA_MODEL` env default.
- **`cli/pipeline.ts`** — `buildReport()` calls `computeCost()` to compute `CostBreakdown` from step records. Phases: routing / specialist / tests / guardrails.
- **`cli/printer.ts`** — `printReport()` calls `printCostReport()` after each run. Offline runs show `(offline — model costs not incurred)`.
- **`cli/types.ts`** — `RunReport` extended with optional `cost: CostBreakdown`.
- **`cli/index.ts`** — New commands:
  - `possiblaw workflows show <name>` — pipeline shape + resolved agents + estimated typical cost.
  - `possiblaw team set-model <agent> <provider/model>` — writes override; validates agent + model format.
  - `possiblaw team show-model <agent>` — prints effective model after overrides.
- **`layer/agents/specialists/finance/billing/expense-categorizer.md`** — `model` changed to `ollama/llama3.1:8b`; `fallback_model` set to `anthropic/claude-haiku-4-5`.
- **`.gitignore`** — `.possiblaw/` added.
- **`docs/DEMO-SCRIPT.md`** — "Cost transparency" section added.
- **`docs/sprint-5-demo.md`** — Detailed Sprint 5 demo walkthrough.

---

### Sprint 4 — Privacy Filter (encoder-decoder via local LLM with reversible entity substitution)

- **`cli/ollama.ts`** — Thin Ollama HTTP client using built-in `fetch`. `isOllamaAvailable()` pings `/api/version`; `chat()` streams `/api/chat` NDJSON and assembles full response. Configurable via `OLLAMA_HOST` and `OLLAMA_MODEL` env vars (default: `http://localhost:11434`, `llama3.1:8b`). Clear error messages distinguish "not installed" from "not running".
- **`cli/privacy-filter.ts`** — Encoder + Decoder + KeyStore module.
  - `encode(text, matterId, opts?)` — loads key store, applies alias hints, calls Ollama encoder (with offline-fallback to rule-based regex encoder when Ollama is unreachable). Returns `MaskedPayload` with `masked_text`, `key_store`, and `mode` tag.
  - `decode(text, keyStore)` — deterministic find-and-replace (fast path) + optional Ollama cleanup pass for LLM-introduced token variants. Pre-delivery scan throws `PrivacyFilterError` if any `«ENT_` prefix leaks.
  - `loadKeyStore(matterId)` / `saveKeyStore(matterId, store)` — per-matter persistence at `layer/privacy-filter/keys/<matter-id>.json`.
  - Rule-based offline encoder: regex patterns for EIN, SSN, MONEY, EMAIL, PHONE, ORG, ADDRESS.
  - `PrivacyFilterError` class for hard pre-delivery failures.
- **`cli/pipeline.ts`** — Privacy filter wired in before/after specialist call. `shouldApplyPrivacyFilter()` checks profile + model. Encode/decode steps logged to audit. `PipelineOpts` extended with `privacyProfile` and `matterTag`.
- **`cli/types.ts`** — `RunContext` extended with `privacyProfile` and `matterTag`; `GuardrailRuleConfig` extended with `privacy-profile-check` kind.
- **`cli/guardrail-runner.ts`** — New `runPrivacyProfileCheck()` handler for rule kind `privacy-profile-check`.
- **`cli/index.ts`** — `--privacy-profile <always|cloud-only|off>` and `--matter-tag <tag>` flags on `run` command; new `possiblaw privacy show <matter-id>` subcommand.
- **`layer/guardrails/risk-gates/privacy-filter-required.yaml`** — Escalates when active profile is `off` for matters tagged `sensitive`, `privileged`, or `client-confidential`.
- **`layer/workflows/quick-counsel.yaml`** — `privacy-filter-required` added to guardrail suite (runs before `signed-document`).
- **`layer/privacy-filter/adversarial-tests/`** — 8 JSON adversarial test cases covering: detector miss, entity ambiguity, rehydration failure, key-store concurrency, profile misconfiguration, token variant normalization, unknown token passthrough, offline NDA demo.
- **`docs/privacy-filter.md`** — Threat model: 5 failure modes, detection methods, recovery steps, token format reference, adversarial test index.
- **`docs/sprint-4-demo.md`** — End-to-end demo walkthrough: offline mode, live Ollama + Anthropic mode, failure path.
- **`docs/DEMO-SCRIPT.md`** — "Privacy Filter walkthrough" section appended pointing to `docs/sprint-4-demo.md`.

---

### Sprint 3 — Non-legal surfaces (Marketing, Finance, Admin)

- **3 new Leads** (all `reports_to: chief-of-staff`):
  - `layer/agents/leads/marketing/marketing-lead.md` — manages `intake-form-drafter`, `pitch-polisher`; model `claude-sonnet-4-6`.
  - `layer/agents/leads/finance/finance-lead.md` — manages `billing-prep`, `expense-categorizer`; model `claude-sonnet-4-6`.
  - `layer/agents/leads/admin/admin-lead.md` — manages `calendar-coordinator`; model `claude-sonnet-4-6`.
- **5 new Specialists**:
  - `intake-form-drafter` — produces ~30-field intake form spec (marketing); model `claude-sonnet-4-6`.
  - `pitch-polisher` — before/after pitch polish with change notes; model `claude-sonnet-4-6`.
  - `billing-prep` — draft invoice with line items, rates, totals, signature block; model `claude-sonnet-4-6`; `guardrails: [signed-document]`.
  - `expense-categorizer` — JSON output with category + deductibility; model `claude-haiku-4-5` (categorization tier per plan §7.1; Sprint 5 swaps to local Ollama).
  - `calendar-coordinator` — proposes ≤3 time slots in a markdown table; model `claude-sonnet-4-6`.
- **5 new Skills**: `intake-form-playbook`, `pitch-polish-playbook`, `billing-playbook`, `expense-categorization-playbook`, `calendar-coordination-playbook`.
- **2 new Workflows**: `quick-invoice-review` (router: chief-of-staff, guardrail: signed-document), `quick-intake-reply` (router: chief-of-staff, no guardrail).
- **New starter template**: `small-firm` (2 routers + 4 leads + 6 specialists, 3 workflows).
- **Offline fixtures** for all 5 new specialists; `chief-of-staff` OFFLINE routing updated to dispatch marketing/finance/admin by prompt-content analysis.
- **Chief of Staff** updated: `manages` extended to include the 3 new Leads; routing table updated for Sprint 3 domain coverage.
- **Printer** (`cli/printer.ts`): `printTeamList` now shows domain color tags (magenta = marketing, blue = finance, yellow = admin) for non-legal agents.
- **Build script** fixed: `package.json` build now uses `cp cli/fixtures/* dist/cli/fixtures/` to avoid nested `fixtures/fixtures/` on incremental builds.
- **`docs/DEMO-SCRIPT.md`**: added "Multi-surface day (small-firm template)" walkthrough (Demo 4) with three commands covering team list, marketing intake-reply, and finance invoice-review.

---

### Sprint 1b — Architecture decisions + Chief of Staff prototype

- **Chief of Staff agent** (`layer/agents/chief-of-staff.md`): top-level domain router (`manages: [chief-counsel]`, model `anthropic/claude-opus-4-7`). Routes legal matters to `chief-counsel`; all other domains escalate to `human-escalation` until Sprint 3.
- **`quick-counsel-with-cos` workflow** (`layer/workflows/quick-counsel-with-cos.yaml`): opt-in prototype identical to `quick-counsel` except `router: chief-of-staff` (3-hop chain: cos → chief-counsel → commercial-lead → specialist). `quick-counsel.yaml` remains the canonical workflow.
- **`docs/ARCHITECTURE.md`**: two locked decisions — (1) defer Chief of Staff to Sprint 3 (zero routing value at 1-domain scale, +$0.011/run overhead); (2) lock model-field schema as plain string `provider/name` per plan §11.2. Includes decision log table and forthcoming-decisions placeholders cross-referencing resolving sprints.
- **`docs/sprint-2-handoff.md`**: typed interface contracts for Sprint 2 — test-runner (input/output/failure-hook), guardrail-runner (input/output/escalation-hook), failure-handling hooks (`retry_with`, `escalate_to`, `route_to`), audit-log JSONL shape, breaking changes (RunReport additions, MAX_HOPS fix, call sites in `cli/pipeline.ts` and `cli/printer.ts`), and stubs to replace.

---

## [0.0.1] - 2026-05-20

Initial release: Sprint 0 + Sprint 1a per plan §9.

### Sprint 0 — Foundation

- Repo scaffolding: full directory tree (`layer/`, `bin/`, `cli/`, `plugins/`, `docs/`, `.github/`)
- Apache 2.0 license (`LICENSE`, `NOTICE`) with paperclip MIT preserved
- paperclip wired as git submodule at `paperclip/` (pinned SHA recorded in `FOUNDATION.md`)
- `package.json` with `commander`, `js-yaml`, `gray-matter`, `@anthropic-ai/sdk` deps
- `tsconfig.json` strict TypeScript / NodeNext / ES2022
- `bin/possiblaw` executable shim (prod) and `bin/possiblaw.dev` (tsx dev mode)
- Lean CI workflow (`.github/workflows/ci.yml`): typecheck + lint + test on PR and push to main. No release steps.
- `FOUNDATION.md` with extension-point inventory and Sprint 1a stub integration notes
- `CONTRIBUTING.md`, `CHANGELOG.md`, `README.md`
- `.editorconfig`, `.npmrc`, `.gitignore`

### Sprint 1a — Minimal vertical slice (stubs)

- **Agents**: `chief-counsel` (router, claude-opus-4-7), `commercial-lead` (lead, claude-sonnet-4-6), `nda-drafter` (specialist, claude-sonnet-4-6)
- **Skills**: `matter-intake`, `conflicts-check`, `nda-playbook` (16-point drafting playbook)
- **Workflow**: `quick-counsel` (router → lead → specialist → test → guardrail)
- **Starter template**: `solo-lawyer`
- **Stub test**: `groundedness` (deterministic pass; real implementation deferred to Sprint 2)
- **Stub guardrail**: `signed-document` (deterministic block + escalation; real implementation deferred to Sprint 2)
- **CLI runtime** (`cli/`): commander-based with `run`, `team list`, `eval`, `--version`. Offline mode (no API key) uses deterministic fixtures so the demo runs without credentials.
- **`docs/DEMO-SCRIPT.md`**: end-to-end walkthrough for both offline and live modes.

### Notes

This release supersedes v1. Decision recorded in plan §11. v1 GitHub repo deletion is the operator's call; this build is on disk at `/Users/salvadorcarranza/possiblaw-v2/` and does not touch any other directory or remote.
