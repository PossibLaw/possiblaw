# Known limitations

This file captures known sharp edges in the PossibLaw + Paperclip combo at the
current pinned commit. Workarounds are listed where they exist. None of these
block a working demo — but the package now ships 175 agents, so the at-scale
caveats below (import time, sidebar rendering) are live, not theoretical.

## Importer

### Importer DB writes are non-atomic

`POST /api/companies/import` performs ~6 DB writes per agent sequentially. A
mid-failure leaves a partially-created company in the DB. `--reset` is the
documented recovery path.

- Workaround for the operator: re-run `bin/possiblaw --reset --yes`.
- Watch the launcher heartbeat for the elapsed-seconds counter; if the POST
  blows past ~90s without finishing, the launcher reports the partial agent
  count via a side-channel `GET /api/companies` poll.

### Repeated `--target new` imports collide on the issue prefix

Once a company is imported with default `--target new`, a second import in the
same data directory fails on Paperclip's `companies_issue_prefix_idx`
constraint (the `POS` prefix is taken). This is a Paperclip DB constraint,
not a package defect.

- Workaround: pass `--reset` to wipe the data dir, **or** point
  `--data-dir` at a different directory for the second import.

### HTTP timeout risk at scale

The CLI default HTTP timeout is 2 minutes. ~6 DB writes × ~1.5s per write ×
200 agents ≈ 30 minutes worst case, easily exceeding that.

- Mitigation in the launcher: `curl --max-time 600` ceiling, `Connection:
  keep-alive`, elapsed-seconds heartbeat, partial-count check after 90s of
  silence.
- For >200 agents on a slow disk, expect to bump `IMPORT_MAX_TIME_SECS` at
  the top of `bin/possiblaw`.

## UI

### Sidebar agent list is not virtualized

Paperclip's sidebar renders all agents linearly. At ~100 agents the sidebar
gets noticeably sluggish in the browser; at ~200 it starts to jank during
scroll. The package now ships 175 agents. Operator scope decision (per
`~/.claude/plans/eventual-munching-fairy.md` §7): document, don't patch the
submodule.

Mitigations, in order of effect:

- **Themed launches apply a CSS mitigation automatically** (0.17.0): the UI
  overlay injects `content-visibility: auto` on sidebar agent rows, so
  off-screen rows skip layout and paint. This removes most scroll/render
  cost without touching paperclip source. `--theme dark` disables it along
  with the rest of the overlay.
- **Import only the teams you practice** with `--teams` (0.18.0; see the
  operator walkthrough): a subset import keeps the sidebar short in the
  first place.
- Workaround in `.paperclip.yaml`: group agents under `sidebar.agents` so the
  most-used roles appear first. The launcher imports use that ordering.
- Longer-term: a Paperclip-side virtualization fix would solve this for all
  large packages.

## Ollama variant

### Quality

The `ollama` variant ships as **experimental quality**. Llama 3.1 (8B routing,
70B drafting) trails Claude Opus and Codex on long legal-drafting tasks
based on internal spot-checks. Use it for fully-local development, training,
or when matter content cannot leave the operator's machine.

### Setup overhead

The variant requires three pieces in place:
1. Ollama daemon running (`ollama serve`).
2. The model pulled (`ollama pull llama3.1:8b` and/or `llama3.1:70b`).
3. OpenCode global config declaring the `ollama` provider in
   `~/.config/opencode/opencode.json`.

The launcher's preflight checks all three and offers to write the OpenCode
config block on first run.

### Privacy-encoder dependency

Even when the operator picks a cloud variant (`codex`, `claude`, `opencode`,
`openrouter`, or an `-api` twin), any matter with
`metadata.possiblaw.privacyTier: confidential|privileged` will block at
runtime unless a local model lane is also reachable — an Ollama daemon or a
llama.cpp server (the privacy-encoder skill routes the substitution step
through a local model so confidential plaintext never reaches a cloud CLI).
The launcher emits a non-blocking warning at startup when this combination
is detected.

## llamacpp variant

### One model per llama-server

llama.cpp's `llama-server` serves whichever GGUF it was started with and
ignores the model name in the request, so all five lanes pin
`llamacpp/default` — there is no per-lane quality split like the Ollama
variant's 8B/70B mix. Pick the GGUF at server start. Running two
llama-server instances on different ports for a real lane split would need
per-lane `baseURL`s, which OpenCode providers can't express in one provider
block (declare two providers and edit `variants.yaml` lanes if you need
this).

### Same quality and setup caveats as Ollama

Local GGUF models trail the cloud variants on long legal-drafting tasks, and
the variant needs `llama-server` running plus the `llamacpp` provider block
in `~/.config/opencode/opencode.json` (the launcher offers to write it).

## opencode variant interpretation

The `opencode` variant pins OpenCode's own Zen gateway (`OPENCODE_API_KEY`)
— the no-other-vendor-logins reading of "first-class OpenCode". If you
instead want agents to ride a provider you've connected via
`opencode auth login`, edit the lane models in
`companies/legal-operations/variants.yaml` to that provider's prefix; the
adapter passes any `provider/model` id through to OpenCode.

## Routines

### TASK.md routine-binding is partial

A `routine:` block declared inside `projects/<p>/tasks/<t>/TASK.md` is not
fully lifted into the Paperclip import manifest. The top-level
`routines:` section of `.paperclip.yaml` declares the intent and the
recurring `weekly-renewal-scan` task imports correctly, but operator wires
the routine ↔ task assignment in the Paperclip UI after import.

## Connectors

Connector skills under `companies/legal-operations/skills/connector-*/` ship
as Apache-2.0 metadata descriptors only. Endpoints and auth flows for Lexis,
Westlaw, midpage, iManage (upload), and NetDocuments (upload) are flagged
`UNCONFIRMED` and need operator verification against current vendor docs
before live use.

## Legal-data MCP / research-query privacy

### Research queries egress directly to CourtListener — not through the gate proxy

The `legal-data` MCP server issues research queries (all four tools: `search_opinions`,
`get_opinion`, `get_citation`, `get_docket`) as direct HTTPS requests from the server
process to `https://www.courtlistener.com/api/rest/v4/`. They do **not** route through
the gate proxy. This means:

- No gate receipt is written for research egress.
- No human-approval gate applies to what leaves the boundary in a query.
- The gate's tier-floor and per-connector policy controls do not fire on the research path.

This is a deliberate v1 architectural choice (read-only research traffic is treated
differently from write egress), documented here as a residual risk for operators handling
sensitive matters.

**Workaround:** Use neutral query terms — describe the legal issue, not the client,
matter caption, or strategy. The sanitizer (see below) is a safety net, not a substitute
for query hygiene.

### Privacy tier is process-global, read once at startup

`POSSIBLAW_MATTER_PRIVACY_TIER` is read from the environment at process start and
applies uniformly to every query handled by that running server. A single `legal-data`
process cannot vary the tier across different matters. If a firm needs different tiers
for different matters simultaneously, run separate server processes with distinct env
configurations.

### Sanitization is best-effort regex redaction, not a guarantee

For `confidential` and `privileged` tiers the server runs `sanitizeArgs`, which strips
legal-entity names, emails, SSNs, EINs, and phone numbers from the query before egress.
This is structurally incomplete:

- Informal matter nicknames, judge names, or non-standard entity forms are not caught.
- Redaction quality depends on the regex patterns matching the identifier's format.
- The sanitizer is a safety net; neutral query term discipline remains required.

### Fail-closed default (as of this fix)

When `POSSIBLAW_MATTER_PRIVACY_TIER` is unset or set to an unrecognized value, the
server now defaults to `confidential` (sanitizer active). Pass-through behavior requires
an **explicit** `POSSIBLAW_MATTER_PRIVACY_TIER=standard`. This reverses the prior
behavior where an unset env silently applied full pass-through.

## Gate proxy

### local_trusted accepts unauthenticated local board calls

On a dev machine, paperclip runs as a `local_trusted` instance and accepts
unauthenticated loopback board calls — that is why the launcher can skip
`PAPERCLIP_GATE_API_KEY`. The flip side: the human-approval gate is
enforceable only against the agents' *missing egress credentials* (egress
write tokens exist solely in the gate-proxy process, so agents have no
direct egress write path to a vendor; agent-side read tokens must be
read-scoped per each connector skill). An arbitrary local process outside the agent sandbox could still
call the board or a vendor directly. Production deployments with auth
enabled (export `PAPERCLIP_GATE_API_KEY`, minted via `paperclipai auth
login`) get the structural gate as well.

### Receipt chain assumes a single writer

The hash-chained receipts file (`receipts.jsonl`) is append-only under a
single-writer assumption: one gate-proxy process per file. Two proxies
pointed at the same `GATE_RECEIPTS_PATH` will interleave appends and break
the chain. The launcher derives the path from the data-dir name
(`~/.possiblaw/gate-receipts/<data-dir-name>/`), so parallel disposable
launches stay isolated as long as their `--data-dir` values differ.

Tamper-evidence has a same-user limit: a local process that can rewrite the
whole file can also recompute every hash, so a wholesale rewrite is caught
only against an externally anchored chain head (`POST /receipts/anchor`
posts the head into a paperclip comment). Anchor periodically if receipts
matter for your audit posture.

## Hybrid variant

Not shipped. Paperclip's `assigneeAdapterOverrides` only merges config
*within* the same adapter type — it cannot swap adapter types per issue.
A "route confidential issues to Ollama, everything else to Claude" pattern
would need either a per-call routing primitive in Paperclip or a custom
`ollama_local` adapter plugin (out of scope for the current sprint).

## Model probe cost and coverage

Live launches of the codex / codex-api / claude / claude-api variants probe
each distinct lane model with one minimal CLI request before importing (3
models on claude variants, 1 on codex). Each probe is a tiny billable request
against your subscription or API key. `--skip-model-probe` bypasses it; dry
runs never probe. The probe verifies model *access*, not quota headroom — a
plan at its usage limit can pass the probe and still fail mid-run.

The opencode-based variants are not CLI-probed. `openrouter` gets a keyless
catalog pin check (each pinned model must exist in
`openrouter.ai/api/v1/models`); `opencode` and `llamacpp` rely on the key /
endpoint preflights only, so a Zen-catalog rotation or a wrong GGUF surfaces
on the first live run rather than at launch.

## Theme overlay caveats

The `--theme possiblaw|light` overlay serves a patched copy of the BUILT
paperclip UI from `paperclip/server/ui-dist/` (the server's first static
lookup path) and forces static UI mode for launcher-started servers. Caveats:

- The build output (`paperclip/ui/dist/`) and the overlay are untracked files
  inside the submodule working tree — the same class of dirt as
  `node_modules`; the pinned submodule commit never changes. `--theme dark`
  removes the overlay.
- Markdown code blocks in the editor keep a hardcoded dark palette upstream
  (`ui/src/index.css` Catppuccin tokens) even in light mode.
- A server you started some other way (e.g. a long-lived instance launched
  before the overlay existed) picks the overlay up on its next restart, since
  the static path wins over the monorepo dist path.
- After a paperclip submodule update, delete `paperclip/ui/dist` to force a
  rebuild on the next themed run (stale assets otherwise persist).

## Gemini variants have no reasoning-effort lanes

Paperclip's `gemini_local` adapter exposes no reasoning-effort or thinking
knob, so the `gemini` / `gemini-api` lanes differ by model and timeout only
(`gemini-2.5-pro` judgment, `gemini-2.5-flash` routing, `gemini-2.5-flash-lite`
extractive). The adapter also honors `GOOGLE_API_KEY`; the `gemini-api`
variant binds `GEMINI_API_KEY` specifically — if both are set, the CLI's own
precedence applies.

## API-key variants and dry-run

`--dry-run` never creates the paperclip company secret (there is no company
to attach it to). A dry-run of `codex-api` / `claude-api` with the key unset
warns instead of blocking; the live run requires the key exported in the
launching shell. The key is stored once per import as a company secret
(provider `local_encrypted`); re-importing into a fresh data dir creates a
fresh secret, and rotation afterward happens in the Paperclip UI.

## Learning loop

### Memory propagation is next-launch, not live (v1)

When a lawyer approves a firm-memory lesson, the `learning-scribe` writes it
into `businesses/<slug>/memory/firm-memory.md` and re-renders the skill body.
Running agents do **not** pick up the new content immediately. They receive
the updated memory on the next `./bin/possiblaw --business <slug>` launch,
which re-imports the firm-memory skill body from disk.

The reason is a Paperclip API constraint: the `install-update` endpoint 422s
when `sourceLocator` is null (i.e., for a locally-stored skill), and fires no
agent re-sync. The intended future path for runtime refresh is `PATCH
…/companies/:id/skills/:skillId/files` to update the materialized skill files
followed by `POST /agents/:id/skills/sync` to re-materialize to the adapter;
neither call is implemented in v1.

### HOT cap and archive

Firm memory is capped at roughly 100 lines. Content within the cap is injected
into every matter context so agents always have the firm's current preferences
in scope. Lessons beyond the cap are moved to `memory/archive/<date>.md` and
are no longer injected — they are retained for audit and manual retrieval but
do not affect the agents' live context.

### Human-gated approval

Nothing enters firm memory without explicit lawyer approval. The ethical-wall
sanitizer rejects any candidate lesson that carries client-identifying facts.
Only generalized firm preferences (style, risk tolerance, preferred clauses,
and similar) pass review and enter the HOT memory body.

## Skill-improvement loop

### Offline download-edit-email is invisible

The Tier-2 learn-from-edits loop captures changes made **in place** inside
the connected cloud (OneDrive or Google Drive). If a lawyer downloads the
delivered file, edits the local copy, and emails or re-uploads it under a
different name or to a different folder, the sweep cannot detect the change —
the vendor file ID recorded in the delivery manifest will no longer match.

Workaround: lawyers must open and edit the delivered file directly in
OneDrive or Google Drive (the file the courier filed) rather than downloading
a copy.

### No true on-lock or finalize-event trigger

Paperclip routines fire only on `schedule`, `webhook`, or `api` triggers; our
layer-not-fork constraint forbids modifying `paperclip/` to add a lock-event
or finalize-event hook. The nightly `skill-improvement-sweep` scheduled
routine is the substitute. "Soft-final" is defined as: a human modified the
file after delivery (detected by comparing version history at sweep time
against the hash stored in the delivery manifest). A file that has been
finalized and re-opened for minor corrections may produce a second proposal;
morning review is the gate that prevents spurious overlays from applying.

### Box connector and native Google Docs export are deferred

The v1 sweep covers OneDrive and Google Drive (binary/DOCX round-trip). Box
connector support is not yet implemented — files delivered to Box are not
tracked in the manifest and are invisible to the sweep. Native Google Docs
files (`.gdoc` / `.gsheet` format) require a separate `files.export` call
that is not yet wired up; only uploaded DOCX/PDF files stored in Drive are
diffable today.

### SkillOpt (eval-validated automatic refinement) is deferred

SkillOpt — the system that would take recurring proposal patterns, run them
through an eval harness, and automatically promote high-confidence skill
refinements without per-proposal human review — is designed and documented
but not yet shipped. The `skill-improvement-loop` delivers the diff →
proposal → morning-review → overlay pipeline; SkillOpt would automate the
review step for recurring patterns. Until SkillOpt lands, every proposal
requires a manual yes/no/edit decision in the morning digest.

## Citation gate

### The extractor covers curated citation classes, not full Bluebook

The deterministic extractor under the citation gate recognizes common U.S.
classes — volume-reporter-page citations for a curated reporter set (U.S.,
S. Ct., F./F.2d/F.3d/F.4th, F. Supp. series, regional and state reporters),
`U.S.C.`, `C.F.R.`, and the Federal Rules (Civ./Crim./App./Bankr./Evid. P.).
It does not parse the full Bluebook, does not resolve `id.` / `supra` /
short-forms, and never judges whether an authority is good law. Because the
gate only fires on *detected* citations, a citation in an unrecognized format
reads as "no citations" and the document passes the gate unverified — the
direction of failure is open, not closed, so the LLM `citation-verification-checklist`
review (which is not limited to these classes) remains the substantive check;
the gate is the deterministic floor under it. Normalization strips the common
invisible-character evasions (NFKC fold, format/combining/control-character
strip) but a visually-blank-but-non-ignorable code point (e.g. U+2800) is not
stripped and could still hide a citation from the extractor.

### Registration is an attested floor, not proof of authority

A passing registration proves three deterministic facts about the exact
document text: every detected citation has an all-`Yes` verification row, each
attested quote is verbatim in both its claimed source passage and the draft,
and the verification is attributed to a named agent in the receipt chain. It
does NOT prove the source passage genuinely came from the cited authority —
that link is enforced by the `legal-citation-checker` agent's workflow, not
cryptographically. On a `local_trusted` dev instance, any local process can
call `POST /quality/citation` to register a verification (the same trust model
as the human-approval gate — see "Gate proxy" above); production deployments
with `PAPERCLIP_GATE_API_KEY` enabled get the structural boundary. Good-law
and currency checks (KeyCite / Shepard's) are never performed by the gate and
remain operator/counsel follow-ups.

## Firm-facing MCP facade (v1)

### stdio only

The facade communicates over stdin/stdout. It is spawned by the outside
assistant as a subprocess; there is no remote HTTP/SSE transport, no
firm-issued bearer auth for the MCP channel, and no multi-tenant routing. A
remote HTTP facade with firm-issued auth is a later phase.

### Approval is human-only — with a trust caveat on local_trusted instances

`request_approval` creates a `request_board_approval` in Paperclip and always
returns `status: "pending_approval"`. The facade exposes no approve or decide
tool; the company-scoped agent key 403s on Paperclip's `assertBoard`
board-decide endpoints.

Caveat: on a `local_trusted` dev instance, Paperclip accepts unauthenticated
loopback board calls (see "Gate proxy" above). If the facade's
`PAPERCLIP_API_KEY` is absent or empty, the facade's HTTP calls to Paperclip
run over loopback without a credential — and on a `local_trusted` instance
that loopback call is treated as board-authenticated, which would mean
`assertBoard` endpoints succeed. The `--firm-facade` auto-mint path resolves
this by provisioning a company-scoped key (`type: "agent"`) so the facade
authenticates as an agent, not a board actor, and cannot call `assertBoard`. If
the mint fails and the operator does not manually provision a key, the structural
"cannot approve" guarantee holds only at the code level (no approve code path
exists), not at the paperclip auth layer. Production deployments with
`PAPERCLIP_GATE_API_KEY` enabled get the full structural boundary.

### Work-product full text is default-closed + opt-in

`fetch_work_product` withholds document body text unless BOTH conditions hold:
`firmFacade.allowWorkProductText: true` in `gate-policy.yaml` (set by the
operator) AND `include_text: true` in the tool call. Every disclosure is
receipted with `meta.textDisclosed: true`; no document body appears in the
receipt itself.

Additionally, full text is resolvable only when the work product carries a
document key — derived from `externalId`, `metadata.documentKey`, or
`metadata.key` in the work-product record. A work product that has only a URL
(e.g. a pull request or preview link) has no document to retrieve; the response
is `{ textWithheld: true, note: "no linked document to disclose for this work
product" }`.

### No ethical wall or cross-matter information barriers (deferred)

Every tool is scoped to an explicit `matterId` supplied by the caller. There is
no cross-matter search or aggregation surface. Cross-matter information barriers
— preventing a connected assistant from interleaving data from different client
matters — are a later phase.

### Create-then-audit window

`create_matter` calls Paperclip first, then writes the receipt. If the receipt
write fails (gate proxy unreachable after the create succeeds), the issue exists
in Paperclip without an audit receipt. This error propagates to the caller — it
is not silently swallowed — but the window exists in v1. Deferred-receipt
queueing is a future mitigation.

### Receipts depend on the gate proxy

Facade receipts route through the gate proxy (`POST /receipts/facade`, single
writer). All five facade tools fail-closed if the receipt cannot be recorded —
including the read-only `get_matter_status` and `list_work_products`: every
handler writes its receipt on the success path and throws if the gate write
fails. The gate proxy must be running on `GATE_PROXY_URL`; do not use
`--no-gate-proxy` with `--firm-facade`.

### Facade receipts appear in the per-matter Matter Trust Report (fixed in 0.28.1)

Facade receipts are recorded in the whole-chain audit (`GET /receipts/verify`)
and are now also surfaced in the per-matter `GET /receipts/bundle` Matter Trust
Report under a dedicated **Firm Facade Activity** section.

The fix has two parts:

1. **`POST /receipts/facade` now defaults the top-level `issueId` from `matterId`.**
   Every facade tool carries `matterId`; the gate-proxy handler propagates it to the
   top-level `issueId` field that the bundle filter (`gate-proxy/src/quality/signoff.ts`)
   reads. An explicit `issueId` in the POST body still wins.

2. **The `attestations` section in the bundle excludes `kind:"firm_facade"` receipts.**
   A facade `request_approval` carries an `approvalId` with `outcome:"pending"` — it is
   a *request*, not a board decision. The fixed filter ensures a pending facade request
   is never rendered as an attestation in a regulator report. Facade actions appear
   under the separate Firm Facade Activity section, where `pending` is rendered as
   "requested — pending human approval".

A regression test in `gate-proxy/src/quality/signoff.test.ts` asserts that a
pending `firm_facade` `request_approval` with an `approvalId` produces an **empty**
attestations section.

### Cross-company read isolation: defense-in-depth assertion added (fixed in 0.28.1)

The read tools (`get_matter_status`, `list_work_products`, `fetch_work_product`)
now assert — at the facade level — that every resolved issue's `companyId` matches
the facade's configured `PAPERCLIP_COMPANY_ID`. On mismatch, the handler writes an
audited `firm_facade` error receipt (outcome `error`, meta `{reason:"company_scope_violation"}`,
no privileged text) and rejects the call before any data is returned.

**This is defense-in-depth, not the primary control.** Paperclip's per-key
authorization remains the primary isolation boundary. The facade's `companyId`
assertion is a secondary check: it rejects out-of-company reads even in the
`local_trusted` loopback scenario where paperclip's auth is weaker. The launcher's
`--firm-facade` path provisions a company-scoped agent key (the structural boundary);
this assertion adds a redundant rejection layer so an accidental or adversarial
cross-company read is stopped and receipted at the facade, not just by paperclip.

Residual: when `PAPERCLIP_API_KEY` is absent on a `local_trusted` instance AND
`PAPERCLIP_COMPANY_ID` is not set, the scope check is skipped (backward-compatible
with unconfigured deployments). The launcher always sets both variables.

### Facade key is write-once; hosted deployments must set `PAPERCLIP_PUBLIC_URL`

The minted agent key is returned once by Paperclip and written to
`<data-dir>/firm-facade-mcp.json` (mode 600). It cannot be retrieved again from
Paperclip. If the file is lost, revoke the old key and mint a new one.

`PAPERCLIP_PUBLIC_URL` defaults to the Paperclip loopback base
(`http://127.0.0.1:<port>`), so approval deep links in `request_approval`
responses resolve locally only. For hosted deployments, update
`PAPERCLIP_PUBLIC_URL` in the emitted config to the public base URL before
distributing it to the outside assistant.
