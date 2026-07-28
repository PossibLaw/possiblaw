# The Agentic OS Stack — every part that has to be optimized

**Purpose:** source material for marketing content. This is the full component
inventory of an agentic operating system for legal work, with (a) what
"optimized" means for each part, (b) the failure mode when it isn't, (c) the
law-firm analogy, and (d) PossibLaw's honest status with a file path.

**Spine metaphor (use this everywhere):** *the model is the associate, the
harness is the firm.* Layers 1–7 make a better associate. Layers 8–12 give the
associate hands. Layers 13–21 are the firm. Layers 22–26 are how the firm gets
better than it was last quarter.

---

## Source note — read before quoting the paper

The paper is **"Code as Agent Harness"** (arXiv `2605.18747`), a survey led by
Xuying Ning, Katherine Tieu, and Dongqi Fu with 39 co-authors (UIUC / Meta /
Stanford). Its taxonomy is three layers: **Harness Interface** → **Harness
Mechanisms** → **Scaling the Harness (Multi-Agent)**, plus open problems.

Section titles verified against the arXiv HTML on 2026-07-21 — these are safe to
cite verbatim and they are the strongest marketing hooks in the paper:

| Verified section | Why it matters to us |
|---|---|
| 3.4.1 From Debugging to Harness-Level Control | The whole thesis in one heading |
| 3.4.2 Planning as Contract Formation | Matter intake / engagement letter analogy |
| 3.4.3 Sandboxed Execution and Permissioned State Transition | Gate proxy + capability map |
| 3.4.4 Verification through Deterministic Sensors | The deadline engine, exactly |
| 5.2.2 Semantic Verification Beyond Executable Feedback | Why self-grading fails |
| 5.2.4 Transactional Shared Program State and Semantic Conflict Resolution | Stale-redline malpractice |
| 5.2.5 Human-in-the-Loop Safety and Accountability as Harness State | Approvals as auditable state |

**`UNCONFIRMED` — do not put these in quotation marks attributed to the paper:**

- **"executable accountability."** This exact phrase did not appear in the
  sections retrieved. The paper's own phrase is *"Human-in-the-Loop Safety and
  Accountability as Harness State"* (5.2.5). That is arguably a *better* line for
  us — accountability as **state**, not as a report you generate afterward. Use
  the real heading, or present "executable accountability" as our framing rather
  than as a quotation.
- **"if the verifier is weak, the agent will learn to optimize against the wrong
  signal."** Not verified verbatim. The paper's section 5.2.2 covers the concept.
  Paraphrase it, or pull the exact sentence from the PDF before publishing.

Anyone drafting copy should pull the PDF and confirm any sentence that goes
inside quotation marks. We are the honesty-first vendor in this category; a
misquoted survey is the one own-goal we cannot afford.

---

# Tier 1 — The Associate (generation quality)

## 1. Model layer

**What it is:** which model runs which step, at what reasoning effort, under
what commercial and data-handling terms.

**Optimization knobs:** per-task model selection; reasoning-effort tiers;
provider diversity (no single-vendor outage); cost-per-lane; context-window
budget; local-vs-cloud placement; declared data terms (zero-retention, no-train,
no-human-review, tenant isolation); preflight probing so "you don't have access
to this model" surfaces before a matter, not during one.

**Failure mode:** one frontier model for everything — you overpay for extraction
and underpower judgment, and a provider outage stops the firm.

**Firm analogy:** you don't staff a document review with a partner, and you
don't send a novel indemnity question to a first-year.

**PossibLaw status:** SHIPPED. Five **model lanes** per agent
(`primary` / `routing` / `drafting` / `review` / `extractive`) declared as
`metadata.possiblaw.modelLane`; **11 variants** across 4 adapter types map every
lane to a provider without touching the package
(`companies/legal-operations/variants.yaml`). Per-agent and per-matter overrides
post-import. Live preflight probe of each lane model.
**Honest gap:** `dataTerms` is declared per variant but **staged, not enforced at
runtime** — a switch to a weaker-terms lane is invisible to every guard.
Model-inference traffic does not traverse the gate proxy at all.

---

## 2. Prompt layer

**What it is:** the durable system prompt per agent — role, mission, execution
contract, output format, refusal rules.

**Optimization knobs:** role scoping (narrow beats general); an explicit
execution contract (start work this heartbeat, leave durable progress, name the
unblock owner); mandated output *structure* so downstream consumers can parse
it; hard refusal rules; the org edge (`reportsTo`) written into frontmatter so
routing is data, not vibes; versioning and diffability.

**Failure mode:** one giant "you are a helpful legal assistant" prompt. Nothing
is testable, nothing is swappable, and every regression is a rewrite.

**Firm analogy:** the job description, the supervision line, and the
"never do this without asking" list.

**PossibLaw status:** SHIPPED. **180 agents**, each a single `AGENTS.md` with
frontmatter (`slug`, `reportsTo`, `skills`) plus Mission / Execution Contract /
Required Skills / Operating Rules / Output Format sections. Refusals are explicit
and load-bearing — e.g. the citation checker will **not** assert an authority is
good law, and refuses to transmit its own work product externally
(`companies/legal-operations/agents/legal-citation-checker/AGENTS.md`).

---

## 3. Skill layer

**What it is:** procedural knowledge — the firm's playbooks, checklists, and
output formats — kept **separate** from the agent prompt and loaded on demand.

**Optimization knobs:** trigger descriptions precise enough that the right skill
fires (this is the single highest-leverage sentence in a skill); progressive
disclosure so a 40-page playbook doesn't sit in context permanently; one skill =
one procedure; skills referenced by name from agents so the dependency graph is
explicit; skill closure (importing a team pulls its skills automatically);
per-firm overlays that customize a playbook without forking it; provenance
metadata (source, license, attribution) on every skill.

**Failure mode:** playbook text pasted into prompts. It can't be reused, can't be
versioned, can't be improved from feedback, and it eats the context window.

**Firm analogy:** the precedent bank and the practice-group checklist — the
difference between a firm and a group of freelancers.

**PossibLaw status:** SHIPPED. **178 skills** as `SKILL.md` with a
description-as-trigger, licensing metadata, and step-by-step procedures
(`companies/legal-operations/skills/`). Agents declare required skills in
frontmatter *and* explain in prose when to reach for each. Per-firm
**skill overlays** live in `businesses/<slug>/skill-overlays/`.

---

## 4. Context engineering

**What it is:** deciding what goes into the window on this call, in what order,
at what fidelity, and what is deliberately kept out.

**Optimization knobs:** assembly order (stable content first for cache hits,
volatile last); context budget per lane; instruction/data separation so
retrieved text can't act as an instruction (prompt-injection surface);
compaction and handoff summaries for long matters; scoping reads to the matter
rather than the whole company; sub-agent isolation so a research fan-out doesn't
pollute the drafting context; deterministic facts (dates, numbers) injected as
computed values rather than left to the model.

**Failure mode:** context rot. Around hour three of a long matter the agent is
reasoning over a stale summary of a summary and nobody can tell.

**Firm analogy:** the matter file. What's in it, what's current, and who is
allowed to see it.

**PossibLaw status:** PARTIAL. Strong on the structural side — atomic task
decomposition, skill-level progressive disclosure, per-issue paperclip context,
handoff/continuity artifacts, HOT firm memory injected at import.
**Honest gap:** agent read scope is **company-wide, not per-matter**
(`docs/known-limitations.md` → "Agent read scope is company-wide"). There is no
explicit context-budget accounting per lane, and no formal
instruction-vs-retrieved-data separation policy. This is the layer with the most
headroom and the least marketing coverage today.

---

## 5. Chunking, retrieval, and grounding

**What it is:** turning a 200-page credit agreement or a docket into units the
model can actually reason over, and getting the *right* units back.

**Optimization knobs:** chunk boundaries that respect legal document structure
(clause, section, recital, exhibit — never fixed 512-token windows); overlap;
metadata per chunk (party, date, section number, source doc, page); hybrid
lexical + semantic retrieval; reranking; recall measurement on a labeled set;
citation spans that point back to an exact page/line so a quote can be verified;
table and exhibit handling; long-document strategies (map-reduce vs. full-window)
chosen per task; a "no relevant chunk found" answer that is allowed to be empty.

**Failure mode:** the retrieval layer silently returns the wrong section, the
model writes a fluent paragraph about it, and nobody can trace which chunk
produced which sentence. This is the mechanical root of most legal-AI
hallucination stories.

**Firm analogy:** pulling the wrong version of the agreement out of the file room
and redlining it confidently.

**PossibLaw status:** **GAP — the largest one.** PossibLaw deliberately
*consumes* the data layer rather than reinventing it: `mcp-servers/legal-data/`
fronts CourtListener and wraps results in a provenance envelope
(`source`, `source_url`, `decided_date`, `citation`, `sha256`), and the
`sha256` is the same fingerprint the citation gate checks. That gives us
**provenance and anti-hallucination checking without owning a retrieval stack**.
There is no PossibLaw chunker, embedder, vector store, or reranker — grep
confirms none in the repo. **Marketing posture:** do not claim retrieval
sophistication. Claim the opposite and make it a virtue — *we don't ask you to
trust our retrieval; we check what the agent cites against what was actually
retrieved, and flag anything that wasn't.* Own-retrieval is a roadmap item, not a
current claim.

---

## 6. Memory

**What it is:** what persists across matters, and at what scope.

**Optimization knobs:** memory tiers (HOT preferences injected every run vs. cold
archive retrieved on demand); scope discipline (firm-general vs. client-specific
vs. matter-specific); a cap on HOT memory so it doesn't become an unbounded
prompt; sanitization before anything is written; recurrence tracking so a
one-off comment doesn't become firm policy; human approval before a lesson is
adopted; propagation latency (live vs. next-launch); conflict resolution when
memory contradicts the current matter.

**Failure mode:** memory becomes an unaudited, unbounded second prompt — and in a
firm, an ethical-wall violation waiting to happen when client A's facts leak into
client B's matter.

**Firm analogy:** "how we do things here" — the standing preferences a good
associate absorbs, versus confidential client facts they must not carry across
the wall.

**PossibLaw status:** SHIPPED with honest limits. `firm-memory` skill carries HOT
memory, overlaid from `businesses/<slug>/memory/firm-memory.md` at import.
Lessons enter through a **fail-closed sanitizer**, a **recurrence tracker**, and
a **human approval card** before they are adopted (`learning-loop/src/`).
Explicitly "generalized guidance only — never client-specific facts."
**Honest gap:** propagation is next-launch, not live; HOT is capped with an
archive tail.

---

## 7. Decomposition and task granularity

**What it is:** how big a unit of work an agent is asked to do.

**Optimization knobs:** smallest reviewable unit (one agent, one skill, one gate
decision, one receipt); delegation depth; parallel vs. sequential fan-out;
child-issue patterns for long work; where a specialist hands back to a lead;
how many hops before a human sees anything.

**Failure mode:** one prompt drafts the whole contract. You get one opaque
artifact to trust or distrust, no reviewable seam, and no place to attach an
eval or a gate.

**Firm analogy:** the difference between "handle this deal" and a task list with
owners.

**PossibLaw status:** SHIPPED, and it's the stated thesis. Chief of Staff →
Chief Counsel → 34 leads (28 practices + 6 business functions) → 143 working
specialists, plus meta-reviewers (risk-spotter, debate-judge, reconciler).
Each lead's `AGENTS.md` routing table is the authoritative specialist list.

---

# Tier 2 — The Hands (action surface)

## 8. Tool layer

**What it is:** the callable actions — and their signatures, errors, and
side effects.

**Optimization knobs:** tool-count discipline (a 60-tool menu degrades selection
accuracy); names and descriptions written for a model, not a human;
argument schemas that make invalid states unrepresentable; **server-resolved
aliases instead of caller-supplied identifiers** (the caller says "trusted firm
root," not a Drive folder ID); idempotency keys so a lost response doesn't
double-send; structured, actionable error surfaces; read/write separation;
default-closed returns (don't hand back full document text unless asked).

**Failure mode:** the agent supplies its own destination and exfiltrates to a
folder nobody authorized — the most under-discussed legal-AI risk there is.

**Firm analogy:** signing authority. Who can send what, to whom, using whose
letterhead.

**PossibLaw status:** SHIPPED. Egress verbs are a fixed set (email send, upload,
e-signature, payment, court filing, external delete). Drive/OneDrive roots are
**server-resolved aliases**; raw vendor folder/drive IDs are rejected in
authenticated mode. A **stable operation ID** prevents silent replay after
response loss, and a **durable reservation precedes dispatch**
(`gate-proxy/src/operations.ts`). The firm facade is a deliberate five-noun
allowlist with work-product text default-closed
(`mcp-servers/firm-facade/`).

---

## 9. MCP layer

**What it is:** how external capability is declared, authenticated, scoped, and
rendered into whichever runtime the agent actually runs in.

**Optimization knobs:** declare-once registry vs. per-runtime config drift;
transport choice (stdio vs. http); auth handling that passes **env var names,
never secret values**; per-agent scoping (and honesty about whether it's
enforceable); trust-adapters that wrap a third-party MCP to add provenance and
sanitization; server-count discipline (every MCP server is context tax and
attack surface); tool-poisoning / prompt-injection resistance on responses.

**Failure mode:** you wire four model runtimes and maintain four hand-edited
config files that silently diverge; or you trust an MCP server's response text as
instructions.

**Firm analogy:** vendor onboarding — who's approved, what they can see, and
whether their output gets reviewed before it's relied on.

**PossibLaw status:** SHIPPED, and it's genuinely differentiated.
`companies/legal-operations/mcp-servers.yaml` declares each server **once**
(`name`, `transport`, `command`/`url`, `auth`, `grantTo`, `privacy`); the
launcher renders it into all four runtime schemas — `opencode.json`,
`~/.codex/config.toml`, `.mcp.json`, `~/.gemini/settings.json` — via
stdlib-only `bin/_possiblaw_mcp.py`. Only env var **names** cross the boundary.
**Honest gap, stated in the file itself:** `grantTo` is **advisory** — CLI MCP
configs are global per runtime, so per-subagent scoping cannot be enforced today.
That candor is itself the marketing asset.

---

## 10. Connectors and egress adapters

**What it is:** the concrete integrations — mail, drive, e-sign, CRM, billing,
practice management, court.

**Optimization knobs:** which connectors route through the gate vs. direct;
credential custody (who holds the token — the agent process or the gate?);
refusal over silent failure for unimplemented writes; binary vs. text egress
paths; per-connector receipts; an inventory doc so nobody has to read code to
learn which path a connector takes.

**Failure mode:** an "integration" that quietly holds a write credential inside
the agent's own process, outside every guard you built.

**Firm analogy:** who has the keys to the mailroom.

**PossibLaw status:** SHIPPED with a published inventory. The launcher **removes
egress credentials from the model runtime's environment and gives them to the
gate proxy process** — the gate holds the only egress credentials.
`share_external` writes (HubSpot, Linear, Clio, iManage, NetDocuments) are
**visibly refused in v1 rather than silently credentialed**.
**Honest gap:** Slack/Teams notification webhooks and CourtListener research
queries still egress directly, unreceipted (`docs/connectors-inventory.md`,
`docs/known-limitations.md` → "Unreceipted egress channels").

---

## 11. Data layer and provenance

**What it is:** where authoritative source material comes from and how you prove
what the agent actually saw.

**Optimization knobs:** official sources over scraped ones; a provenance envelope
on every retrieved item (source, URL, decided date, citation, content hash);
**registering every retrieval with the guard layer** so cited-but-never-retrieved
authorities are detectable; query sanitization before a confidential matter's
terms leave the perimeter; retrieval receipts.

**Failure mode:** the agent cites a case that does not exist and no mechanical
check can tell, because nothing recorded what it actually read.

**Firm analogy:** the difference between "I read the case" and the case being in
the file.

**PossibLaw status:** SHIPPED (first slice). `mcp-servers/legal-data/` fronts
CourtListener's official MCP, wraps results in a provenance envelope, and
**registers each retrieved authority with the gate** (`POST /quality/authority`).
The gate then **flags any authority cited in an outbound filing that was never
retrieved** — recorded as `unbackedCitations` on the egress receipt. This is an
anti-hallucination *mechanism*, not a metadata wrapper. **Honest gap:** default
is flag/record; blocking is opt-in
(`citationGate.requireAuthorityProvenance: true`).

---

## 12. Determinism layer — code, not inference

**What it is:** the calculations that must never be produced by a language model.

**Optimization knobs:** identify every answer with exactly one correct value
(deadlines, interest, cap tables, holiday calendars, filing windows); implement
in tested code; force the agent to call it through a skill rather than reason
about it; emit a rule-application **trace**, not just an answer; **hard-fail with
no fabricated fallback** when the engine can't answer; declare jurisdiction scope
explicitly and return `UNCONFIRMED` outside it.

**Failure mode:** a model computes a filing deadline. It will be right most of
the time, which is exactly what makes it dangerous.

**Firm analogy:** the docketing clerk. Nobody eyeballs a limitations date.

**PossibLaw status:** SHIPPED. `deadline-engine/` computes FRCP Rule 6 deadlines
in tested TypeScript (35 tests: forward/backward counting, mail +3, federal
holidays, business-day roll, multi-TZ guard). The `deadline-calculator` agent
routes **all** deadline questions through `legal-deadline-calculation`; engine
failure is a **hard blocker with no fallback date**. This is the paper's
**3.4.4 Verification through Deterministic Sensors**, literally.
**Honest gap:** US-FED only (state/CPR returns `UNCONFIRMED`); audit-only in v1 —
recorded in the trust report, does not yet **block** a late filing.

---

# Tier 3 — The Firm (the harness)

## 13. Boundary classification

**What it is:** deciding what *kind* of act an action is, before deciding whether
to allow it.

**Optimization knobs:** a small, closed taxonomy a human can reason about;
classification that runs on the request, not on the agent's self-report;
fail-closed on unclassifiable requests; distinct treatment per boundary.

**Failure mode:** one undifferentiated "external call" permission — you can either
allow everything or block everything.

**Firm analogy:** the difference between mailing a status update and filing with
the court.

**PossibLaw status:** SHIPPED. Six boundaries: `THIRD_PARTY_EGRESS`,
`CONFIDENTIAL_TO_CLOUD`, `COURT_FILING`, `SIGNATURE`, `MONEY_MOVEMENT`,
`IRREVERSIBLE_EXTERNAL_OP` (`gate-proxy/src/boundary.ts`).

---

## 14. Policy engine

**What it is:** the firm's own rules about what happens at each boundary.

**Optimization knobs:** graded outcomes rather than binary (allow / anonymize /
human / block); policy as a **versioned file the firm edits**, not vendor code;
schema-validated on load; sane defaults that are strict, with documented
loosening for demos; per-boundary sub-policies (e.g. which boundaries the
citation gate covers).

**Failure mode:** guardrails hard-coded by the vendor. Every firm has different
risk tolerance, and the ones who can't express theirs will turn yours off.

**Firm analogy:** the firm's own risk policy — the thing the GC and the insurer
actually negotiate over.

**PossibLaw status:** SHIPPED. `companies/legal-operations/gate-policy.yaml` —
four graded outcomes, per-boundary, version-validated, heavily commented, "every
value below is the firm's to tune."

---

## 15. Identity, authorization, and the capability map

**What it is:** which *specific* agent is allowed to perform which *specific*
action.

**Optimization knobs:** default-deny with an **exact** capability map (not
prefix matching); authorization against an **immutable** agent ID, not a mutable
display name or slug; company enforcement on every protected request; a minimal
public surface (health/ready only); service principals separated from working
agents; keys minted for the narrowest identity that can do the job.

**Failure mode:** any agent can do anything any other agent can. One
prompt-injected research agent becomes a court-filing agent.

**Firm analogy:** signing authority and matter staffing — a paralegal cannot
execute a settlement.

**PossibLaw status:** SHIPPED in `--production`. Every protected request
authenticates the caller's own paperclip agent key, enforces the company, and
authorizes the **immutable agent ID** against an **exact default-deny capability
map** (`gate-proxy/src/authorization.ts`). Baseline grants are deliberately
narrow: email send → `correspondence-clerk`; trusted-root upload →
`deliverables-courier`; citation/authority registration →
`legal-citation-checker`; deadline receipts → `deadline-calculator`. Unassigned
capabilities stay denied. The firm facade mints a key only for the wake-disabled
`firm-facade-recorder` service identity — never a chief or a working specialist.

---

## 16. Isolation and sandboxing

**What it is:** the blast radius when an agent is compromised or simply wrong.

**Optimization knobs:** process/user separation between the model runtime and the
credential holder; non-root distinct workers; scoped networks; secrets that
same-UID processes cannot read; conflict-driven separation (ethical walls);
authenticated mode so a screened lawyer's login is invisible to a walled matter;
an **isolation eval** you actually run on the target host before trusting it.

**Failure mode:** the guard and the guarded run as the same user. Every control
above becomes advisory.

**Firm analogy:** the ethical wall — and it only counts if it's real.

**PossibLaw status:** PARTIAL, and stated as a release blocker rather than
finessed. Docker Compose reference gives distinct non-root workers, scoped
networks, file-backed secrets, and a `run-isolation-eval.sh` that must return
all-true before heartbeats are enabled. `--add-wall` puts a client in its own
paperclip company with its own gate proxy and receipt chain — a hard 403 between
clients. **Honest gaps, published:** same-UID local execution can still read
process/filesystem secrets or bypass the proxy; walls isolate **between**
companies, not **per-matter inside** one; `BETTER_AUTH_SECRET` remains reachable
to same-UID agents. "Live multi-agent/provider validation and worker isolation
remain release gates."

---

## 17. Human-in-the-loop gates

**What it is:** where a person decides, and how that decision is bound to the
thing they saw.

**Optimization knobs:** gate at boundaries that matter, not every step (approval
fatigue destroys the control); **payload-hash binding** so an approval for
payload X cannot authorize payload Y; the agent *stands down* and is woken on
approve rather than polling; approvals presented with the evidence and the risk
flag, not just a button; human-only approval paths (no agent-callable approve
tool); native to the control plane rather than a bolted-on queue.

**Failure mode 1:** approve-everything fatigue — the human becomes a rubber
stamp and the audit trail is theater.
**Failure mode 2:** approval drift — a human approves a draft, the agent
regenerates, and the approved bytes are not the sent bytes. This is the one that
ends up in a malpractice claim.

**Firm analogy:** partner sign-off — on *this* version of *this* document.

**PossibLaw status:** SHIPPED, and payload-hash binding is the sharp edge worth
marketing hard. Four of six boundaries default to `human`. Approvals are
**payload-hash-bound**. The firm facade has **no approve tool at all**, and its
company-scoped key 403s on board-decide endpoints. This is the paper's
**5.2.5 Human-in-the-Loop Safety and Accountability as Harness State**.

---

## 18. Independent verification (separation of duties)

**What it is:** a check performed by something *other than* the thing being
checked, enforced before the action lands.

**Optimization knobs:** the verifier must be a different agent, ideally a
different model, ideally deterministic; verification must be **registered and
payload-bound**, not asserted in prose; the gate should enforce that verification
*happened and passed*, not merely that it was requested; deterministic re-check
of the verifier's own claims at the gate; fail-closed when there's nothing
reviewable; honest scoping of what the verification does and doesn't prove.

**Failure mode:** the model grades its own memo. This is the paper's
**5.2.2 Semantic Verification Beyond Executable Feedback**, and it is the single
most common piece of legal-AI theater in the market.

**Firm analogy:** you don't let the associate who wrote the brief be the only one
who cite-checks it.

**PossibLaw status:** SHIPPED, and this is our strongest single claim.
Court/third-party egress **carrying legal citations is blocked** until a
registered, payload-bound citation verification exists for that exact document.
The `legal-citation-checker` runs `citation-verification-checklist` (character-
by-character quote fidelity, side-by-side discrepancy table) and POSTs the result
to `POST /quality/citation`. The gate **re-checks deterministically** — it
verifies each quoted string actually appears verbatim (after Unicode
normalization) in **both** the source passage and the draft — then calls
`CitationRegistry.has(docSha256)` before any dispatch, **including the human
gate**. Fail-closed: a gated payload with no reviewable document text is blocked.
Registration is withheld unless **every** row passes; a table with discrepancies
is a findings report, not a clearance.
**Honest caveat we publish ourselves:** the gate enforces that verification was
performed and passed — **not** that the cited authority is good law. Currency and
treatment (KeyCite/Shepard's) are always framed as operator follow-ups.

---

## 19. Audit trail and receipts

**What it is:** the tamper-evident record of what was proposed, what was shown,
what was flagged, who signed off, and what changed.

**Optimization knobs:** append-only with fsync; **hash-chained** so tampering is
detectable; single-writer lease to prevent chain forks; hashes not payloads (an
audit log that contains client confidences is a liability, not a control);
company binding; a verify endpoint; **anchoring the chain head outside the
host's own trust domain** (otherwise the admin who can edit the log can edit the
log); receipts on *every* outcome — reserved, performed, pending, blocked, error
— not just successes; export into a form a regulator can read.

**Failure mode:** logs the same admin can rewrite, or logs that are complete only
for the happy path. Blocked and errored actions are the ones discovery asks about.

**Firm analogy:** chain of custody and the docket.

**PossibLaw status:** SHIPPED. SHA-256 hash-chained, fsync'd, company-bound,
single-writer-leased receipt chain covering reserved / performed / pending /
blocked / error. `GET /receipts/verify` checks the chain;
`POST /receipts/anchor` writes the head into a paperclip comment. **Payloads
never appear in receipts — only their sha256.**
**Honest gap we state first:** strong tamper resistance requires an anchor stored
**outside the same host/user trust domain**; same-user tampering is caught only
against an externally anchored head.

---

## 20. Redaction, anonymization, and privacy tiering

**What it is:** what leaves the perimeter in cleartext, and what doesn't.

**Optimization knobs:** deterministic masking with a **stable, reversible**
placeholder scheme (so output decodes back to plaintext); substitution key stays
local; measured **recall on a labeled fixture** with a published threshold;
fail-closed when the masker can't vouch (e.g. no entity list supplied);
**raise-only tier floors** so an agent cannot downgrade a registered matter's
classification; unlabeled traffic defaults to the stricter tier; local-model
routing as an alternative to masking; honest language about
confidentiality-vs-privilege.

**Failure mode:** "we redact PII" with no measured recall and no fail-closed
path. And the marketing failure mode: claiming "privilege-safe," which is not a
thing you can engineer.

**Firm analogy:** Rule 1.6 reasonable steps, and ABA Formal Opinion 512 (2024).

**PossibLaw status:** SHIPPED with unusually specific honesty. Deterministic
masker over caller-supplied matter entities plus pattern classes; recall
**measured in the test suite** (100% on its labeled fixture, gated at ≥95% with
zero entity leaks); **fail-closed to block when it cannot vouch**. Since 0.36.0 a
matter registered via `POST /matters/classification` carries a **raise-only
floor** — the gate applies `max(floor, per-request claim)`, so an agent cannot
downgrade a matter. Unlabeled secondary-model traffic defaults to `confidential`.
`privacy-encoder` skill keeps the substitution key on local disk.
**Honest gaps:** the `dataTerms`-aware tier floor exists in code but the live call
site never passes `dataTerms` — **staged, not wired**. Agents' own primary-lane
model calls are **routed, not proxied**. `docs/privilege-and-confidentiality.md`
documents the do/don't marketing language: engineered for "reasonable steps,"
**never** "privilege-safe."

---

## 21. Reversibility and undo

**What it is:** the answer to "how do we take it back."

**Optimization knobs:** distinguish reversible from irreversible actions in the
taxonomy itself; durable reservation before dispatch; idempotent operation IDs so
a retry after response loss doesn't double-send; staging an action package for a
human to execute instead of firing an irreversible API; local copy always
retained; a clean statement of which actions genuinely cannot be undone.

**Failure mode:** the system has no concept of irreversibility, so a delete and a
draft-save get the same treatment.

**Firm analogy:** you can recall an internal email. You cannot un-file a
complaint.

**PossibLaw status:** PARTIAL by design. `IRREVERSIBLE_EXTERNAL_OP` is a
first-class boundary defaulting to `human`. Durable reservation precedes
dispatch; a stable operation ID prevents silent replay. Court filing in v1 writes
an **action package to disk for a human to execute — no court API is called** —
which is the most conservative possible answer to "can you undo it."
**Honest gap:** there is no general compensating-transaction / rollback framework.
Prevention, not reversal, is the current strategy — and we should say so.

---

# Tier 4 — The Institution (getting better)

## 22. Evaluation

**What it is:** how you know a change made things better rather than different.

**Optimization knobs:** per-unit evals attached to the atomic unit (agent × skill
× case), not just end-to-end vibes; **cross-variant** scoring so you can compare
models on your own work; deterministic checks where possible and rubric grading
where not; all-pass rubrics rather than averaged scores that hide a failure;
adversarial and failure-case coverage, not just happy path; eval coverage
enforcement so new capability without an eval is a build failure; A/B harnesses
for architectural questions; regression-free improvement (the paper's own open
problem); judge independence.

**Failure mode:** demo-driven development. It looked great in the demo and nobody
can tell you if last week's prompt change broke NDA review.

**Firm analogy:** supervision and the file review — the thing that separates a
firm from a very confident individual.

**PossibLaw status:** SHIPPED, two harnesses. `eval-harness/` scores agents and
skills per case across **all 11 variants** with deterministic + all-pass rubric
grading, plus a coverage checker (`bin/_possiblaw_eval_coverage.py`); **15 eval
cases** in `companies/legal-operations/evals/cases/`. `orchestration-eval/` is an
A/B experiment harness — **Arm A single-agent vs. Arm B chief-of-staff
orchestration** on 9 curated Harvey LAB tasks — which is the thesis of the whole
project put under test rather than asserted. Eval cases run as paperclip issues
with a judge agent and receipts in the Eval Results project.
**Honest gap:** 15 cases against 180 agents is thin coverage, and the last
published cross-model receipt is from 2026-05-21. Don't oversell the eval volume;
sell the eval *architecture* and the willingness to A/B our own thesis.

---

## 23. Learning loop

**What it is:** how the firm's corrections become the system's behavior.

**Optimization knobs:** capture where the lawyer actually works (their edits in
Drive/OneDrive, not a feedback form); diff delivered-vs-finalized to distill the
lesson; sanitize fail-closed before anything is stored; recurrence thresholds so
one-offs don't become policy; **human approval before adoption**; scoped
application (firm-general vs. client-specific); proposals surfaced in a routine
digest rather than applied silently; a manifest linking every delivered artifact
to its learning record.

**Failure mode:** silent self-modification. A system that changes its own
playbooks without sign-off is unauditable by construction — and in a regulated
practice, indefensible.

**Firm analogy:** the associate who learns how the partner likes it — with the
partner confirming, not the associate assuming.

**PossibLaw status:** SHIPPED, both tiers. **Tier 1:** `remember this:` comments
on issues → sanitized → paperclip approval card → `businesses/<slug>/learnings/`
→ injected into `firm-memory` on next `--business` launch. **Tier 2:** a nightly
sweep diffs each delivered file against the lawyer's finalized version in
OneDrive/Google Drive, distills a sanitized **skill-overlay proposal**, and
surfaces it in the morning digest for yes/no/edit
(`learning-loop/src/{manifest,diff,proposals}.ts`, `skill-improvement-scribe`
agent). **Honest gaps:** offline download-edit-email is invisible; no true
on-lock/finalize trigger; propagation is next-launch; eval-validated automatic
refinement (SkillOpt) is deliberately **deferred** — we won't ship
self-modification we can't evaluate.

---

## 24. Shared state and multi-agent coherence

**What it is:** making sure two agents working the same matter are working the
same version.

**Optimization knobs:** a single source of truth for matter state (the control
plane, not each agent's context); durable progress written to shared artifacts
rather than held in-context; child issues for parallel work instead of agents
polling each other; transactional semantics on shared artifacts; conflict
detection and reconciliation; explicit reconciler/judge roles for divergent
outputs; freshness checks before an agent acts on a document another agent may
have replaced.

**Failure mode:** the paper's named open problem (**5.2.4 Transactional Shared
Program State and Semantic Conflict Resolution**) — one agent drafts while
another redlines a stale version, and their views drift apart silently. In a firm
that is not a bug report, it's a claim.

**Firm analogy:** version control on the deal document. Everyone redlines the
same draft or nobody does.

**PossibLaw status:** PARTIAL, and this is the honest soft spot to name in
content. Paperclip's issue/comment/document model is the single shared state, and
agent execution contracts mandate *durable progress in paperclip comments,
documents, or work products* and *child issues for parallel work — do not poll
agents*. Meta-reviewer agents (`risk-spotter`, `debate-judge`, `reconciler`)
exist to reconcile divergent specialist output. But there is **no transactional
locking, no version-conflict detection, and no staleness check** on a work
product an agent picks up. This is a real open problem for us, exactly as it is
for the field — and saying so is more credible than pretending otherwise.

---

## 25. Observability and cost

**What it is:** knowing what the system did, how long it took, and what it spent.

**Optimization knobs:** run transcripts; per-agent and per-lane cost attribution;
budget limits enforced by the control plane; pause/cancel; latency per stage;
gate-decision dashboards; deep links from an overview into the underlying
system; cost-frontier measurement (is the cheap model actually worse *on our
work*?).

**Failure mode:** a $4,000 month with no attribution, and no answer to "which
matter was that?"

**Firm analogy:** the matter budget and the WIP report.

**PossibLaw status:** PARTIAL. Paperclip owns budgets, pause/cancel, and run
transcripts; agents are contractually bound to respect budget limits and pause
requests. `firm-overview/` is a loopback dashboard merging issues-in-flight,
pending approvals, and recent deliverables across every client the connected
lawyer is authorized for, with deep links and approve/reject **as that lawyer**.
The `openrouter-cost` variant pins GLM 5.2 on cheap lanes specifically to measure
the cost frontier in the orchestration eval. **Honest gaps:** no per-matter cost
attribution report of our own; the deliverables panel is bounded to the 10 most
recent in-flight issues per client; GLM-5.2-vs-Opus quality is explicitly
`UNCONFIRMED` — it's the thesis under test.

---

## 26. Deployment and runtime topology

**What it is:** where this actually runs, and what the host gives you.

**Optimization knobs:** a documented path per operator type (workstation, single
firm, tenant, VPS); fail-closed defaults (placeholder gateways that 503 until
replaced); pinned runtime versions; a single verification entrypoint; explicit
release gates with recorded evidence; never publishing the control plane port;
private ingress and reviewed TLS; secret custody that keeps values out of `.env`,
process args, and chat transcripts; restore drills, not just backups.

**Failure mode:** "it works on my laptop" shipped as a firm deployment — or a
one-click template that installs the *runtime* without any of the guardrails.

**Firm analogy:** the office. Locks, files, retention, and insurance.

**PossibLaw status:** SHIPPED with four documented paths (local launcher, Docker
Compose reference, Azure tenant, Hostinger VPS), Node pinned to `24.18.0`, and a
single credential-free verification entrypoint `bin/verify` that runs every owned
test suite and **explicitly reports authenticated two-lawyer, live launcher, and
provider round-trip checks as `SKIP`** rather than quietly passing. Release gates
are enumerated and unmet ones are named. Notably we tell people **not** to use
Hostinger's one-click Paperclip template when they want PossibLaw, because it
installs the runtime without the gate, capability map, workers, or receipts —
which is precisely the "associate without a firm" failure the paper describes,
shipped as a product.

---

# Cross-cutting: the gap register (be first to say these)

Our differentiation is that we publish these. Any content should lead with a
capability and close with the matching limit.

| Gap | Where it's already published |
|---|---|
| No retrieval/chunking stack of our own | This doc, §5 |
| `dataTerms` tier-floor staged, not wired at runtime | `docs/known-limitations.md` |
| Primary-lane model calls routed, not proxied | README, "What's enforced vs routed vs advisory" |
| Same-UID isolation is a release blocker | README + `docs/known-limitations.md` |
| Agent read scope is company-wide, not per-matter | `docs/known-limitations.md` |
| Ethical walls isolate between companies, not inside one | `docs/workflows/ethical-walls.md` |
| Receipt chain needs an external anchor for strong tamper resistance | README |
| Citation gate proves verification happened, not that authority is good law | `gate-policy.yaml` + README |
| Deadline engine is US-FED only and audit-only | `docs/known-limitations.md` |
| `grantTo` MCP scoping is advisory, not enforced | `mcp-servers.yaml` |
| Research queries + Slack/Teams webhooks egress unreceipted | `docs/connectors-inventory.md` |
| Eval coverage is 15 cases against 180 agents | This doc, §22 |

---

# Copy hazards — fix before publishing

1. **The two `UNCONFIRMED` paper quotes** in the Source Note above. Verify from
   the PDF or paraphrase.
2. **Stale counts in the README.** Ground truth on disk today: **180 agents,
   178 skills, 15 eval cases, 11 variants**. The README's catalog table says
   "Skills | 173" and the architecture diagram says "178 AGENTS.md" and
   "173 SKILL.md" — both wrong. Fix the README before any content drives traffic
   to it.
3. **Never write "privilege-safe."** See `docs/privilege-and-confidentiality.md`
   for the approved language. "Reasonable steps to protect confidentiality and
   privilege" is the ceiling.
4. **Don't claim production readiness.** The repo says proof-of-concept, and
   several release gates are open. "Reference deployment," "credential-free
   verified," and "release gates published" are all true and all stronger than an
   unsupported production claim.

---

# The three lines the content should land

1. **The model is the associate; the harness is the firm.** Everything above
   Tier 1 is the firm.
2. **A legal AI that passes its own citation check has proved nothing.**
   Verification only counts when a different thing checks, the check is bound to
   the exact bytes being sent, and the gate refuses to dispatch without it.
3. **If you can't show who authorized it, on what evidence, and what changed,
   you don't have a legal product.** Ask any vendor for a single matter's
   hash-chained audit export. We ship one:
   `GET /receipts/bundle?issueId=…&format=md`.
