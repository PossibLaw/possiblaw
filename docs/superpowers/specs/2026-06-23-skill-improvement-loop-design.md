# Skill-improvement loop — learn from the lawyer's edits (design)

**Date:** 2026-06-23
**Status:** Approved (brainstorming) — pending implementation plan
**Branch:** `feat/skill-optimizer` (off `main` @ `13b6e1f`, after Tier-1 PR #1 merged)
**Relationship:** This is the centerpiece of Tier-2 of the learning loop. It **supersedes** the SkillOpt-as-centerpiece design in `docs/superpowers/specs/2026-06-23-skillopt-design.md`; SkillOpt is demoted to a **deferred future engine** (see §3 and that file). Tier-1 (per-firm memory) shipped in PR #1.

---

## 1. Purpose

Let a firm's agents **improve from real work** with minimal lawyer effort. When an agent drafts a work product and a lawyer reviews, edits, and **finalizes** it, a background sweep **diffs the lawyer's final against the agent's draft**, distills the *generalizable* change (e.g. "added a Delaware governing-law clause"), sanitizes out client-identifying facts, and queues a **suggested skill edit**. Each morning the launcher presents the queue to a **designated reviewer** for **yes / no / edit**; approved items become per-firm skill-overlays that improve the agent going forward.

Passive ("they don't have to think about it"), grounded in real work product, ethical-wall protected, and human-gated. No model-weight training, no continuously-running watcher, no dependency on a graded eval set.

## 2. Operator decisions (resolved 2026-06-23 — do not re-ask)

1. **Centerpiece = the capture + morning-review loop**, *not* SkillOpt. SkillOpt needs clear evals + lots of graded data the firm doesn't have yet, so it is deferred (§3).
2. **Trigger = document finalization.** Flow: agent drafts → lawyer reviews/edits/approves → lawyer **marks the document final** → background analysis.
3. **Capture = diff agent-draft vs lawyer-final document revisions.** Use paperclip's existing document/revision/lock API (no submodule edits, no PRs).
4. **Execution = a scheduled sweep**, because paperclip exposes no event trigger to our layer (the only event path is a paperclip *plugin*, which would modify the submodule — forbidden). Delivery is batched to "each morning" regardless, so a sweep is functionally equivalent.
5. **Review = a morning digest** via the launcher to a **designated reviewer**: yes / no / edit per item.
6. **Apply = per-firm `skill-overlays/`** via the launcher override path; propagation is next-launch.
7. **Work-product locus = paperclip-native now** (drafts + edits + lock all in the PossibLaw app via paperclip's API); **external destinations (Word/OneDrive/Drive) are a documented future path**.
8. **Privacy = the firm's product-level lane choice** (carried from the SkillOpt round); the ethical-wall **sanitizer** runs on every suggested edit.
9. **Layer-not-fork is absolute:** PossibLaw is a *client* of paperclip's existing API. All new code lives in our layer; `paperclip/` is never modified and no PRs are sent to paperclip.

## 3. Relationship to Tier-1, SkillOpt, and the eval-harness

- **Reuses Tier-1 (merged in PR #1):** `learning-loop/` `sanitizer` (ethical wall), `ledger` (proposed/accepted/rejected status machine), `store` (fs), `recurrence` (boosts changes seen across matters), the `learning-scribe` agent (extended to do diff-distillation), `businesses/<slug>/` store, `businesses/<slug>/skill-overlays/` (reserved slot), and the `--business <slug>` overlay.
- **SkillOpt = deferred future engine.** Once a firm accumulates enough graded cases, SkillOpt (MIT, offline) can *generate* candidate skill edits that flow into the *same* morning-review queue. Its full integration design is retained in `2026-06-23-skillopt-design.md`. Not built now.
- **Eval-harness = optional future validation.** When a skill has eval cases, a suggested overlay edit could be validated (does it regress the all-pass rubric?) before it is offered or applied. Optional, not required for this build; the `bin/eval grade` subcommand from the SkillOpt spec is deferred with it.

## 4. Paperclip capabilities we leverage (as a client; verified in the submodule)

All cited from the pinned `paperclip/` submodule via a read-only spike. **We call these existing endpoints; we do not add or modify them.**

- **Versioned documents** — `documentRevisions` capture `createdByAgentId` vs `createdByUserId`; retrievable via `GET /issues/:id/documents/:key/revisions` and `GET /issues/:id/documents/:key`. (`paperclip/server/src/services/documents.ts:354-406`; `paperclip/server/src/routes/issues.ts:2446,2651`.) → we can tell an agent draft from a human edit and diff them.
- **Finalization signal** — `POST /issues/:id/documents/:key/lock` sets `lockedAt` + `lockedBy{Agent,User}Id`, logs activity `issue.document_locked`. (`paperclip/server/src/services/documents.ts:605-655`; `paperclip/server/src/routes/issues.ts:2567-2591`.) → "mark final" = lock.
- **No event trigger for our layer** — `ROUTINE_TRIGGER_KINDS = ["schedule","webhook","api"]`; no event kind. (`paperclip/packages/shared/src/constants.ts:370-371`.) The in-process plugin event bus (`issue.document.updated`, …) requires being a paperclip plugin → submodule change → **out**. → we use a **scheduled routine sweep**.
- **Agent-triggers-agent** — `runRoutine(...)` / `POST /routines/:id/run` with `assigneeAgentId`, plus `heartbeat.wakeup`. (`paperclip/server/src/services/routines.ts:2114-2137`; `paperclip/server/src/routes/routines.ts:414-430`.) → the sweep can dispatch the diff/scribe agent.

## 5. Architecture — what we add (all in our layer)

- **Package (`companies/legal-operations/`):**
  - **Drafter output contract update** — drafting agents produce the work product as a **paperclip document** (so an agent-authored revision exists to diff), in addition to / instead of a loose comment. (`agents/*/AGENTS.md` edits + a small **`output-paperclip-document` skill** that wraps the documents API.)
  - **`skill-improvement-scribe`** — extend the existing `learning-scribe` (ops-lead, drafting) to: read a locked document's revisions, diff agent-draft vs human-final, distill a generalizable change, sanitize it, and queue a suggested skill edit.
  - **`skill-improvement-sweep`** — a **scheduled routine** (the `learning-sweep` pattern) that finds newly-locked documents since the last run and dispatches the scribe per document.
- **`learning-loop/` (TS component):**
  - **`diff.ts`** — deterministic helpers: fetch revisions, identify draft vs final by author field, produce a structured change set the scribe reasons over.
  - **`proposals.ts`** — the firm-repo **proposal queue** (extends `ledger`): a suggested edit = `{ skillSlug, sourceMatter, observedChange, generalizedEdit, proposedOverlayBody, status }`, statuses proposed/approved/edited/rejected, all sanitized.
  - reuse `sanitizer`, `recurrence`, `store`.
- **Launcher (`bin/possiblaw`, stdlib helpers):**
  - **Morning digest** — on first run of the day for a `--business <slug>`, surface pending proposals to the designated reviewer (yes / no / edit); gate on a per-day marker so it prompts once daily.
  - **Overlay-override apply path** — carried unchanged from the SkillOpt spec §6b: a dedicated overlay pass in `_possiblaw_inline_source.py` that **replaces** `skills/<slug>/SKILL.md` with `businesses/<slug>/skill-overlays/<slug>/SKILL.md` (override, not collision-error; unknown slug errors; demo extra-root collision guard intact).
- **Firm repo (`businesses/<slug>/`):** `proposals/` (the queue) + `skill-overlays/<slug>/SKILL.md` (applied) + `SKILL.md.prev` (revert) + a `reviewer` config field.

## 6. Data flow (end to end)

1. **Draft as a document.** A drafting agent writes its work product as a paperclip **document** → a revision tagged `createdByAgentId`.
2. **Lawyer reviews, edits, finalizes.** In the PossibLaw app the lawyer edits (revisions tagged `createdByUserId`) and **locks** the document (`lockedAt`).
3. **Scheduled sweep.** `skill-improvement-sweep` runs (e.g., early morning and/or a short interval), finds documents **locked since the last sweep**, and dispatches the scribe per document.
4. **Diff + distill.** The scribe fetches the revision history, diffs the agent-draft against the locked final, and distills the **generalizable** change (not the client-specific wording).
5. **Sanitize.** The change is run through the Tier-1 `sanitizer` (fail-closed) — client-identifying facts are stripped/generalized or the item is dropped. Nothing client-identifying is ever stored.
6. **Queue.** A suggested skill edit (with source matter, observed change, generalized edit, proposed overlay body) is written to `businesses/<slug>/proposals/`. `recurrence` flags edits seen across multiple matters.
7. **Morning digest.** The launcher presents the queue to the designated reviewer: **yes** (apply) / **no** (reject, archived in ledger) / **edit** (modify then apply).
8. **Apply.** Approved → `businesses/<slug>/skill-overlays/<slug>/SKILL.md` (prior archived to `SKILL.md.prev`). Applied at **next launch** via the override path (consistent with Tier-1's runtime-refresh finding).

## 7. Key mechanisms / seams

### 7a. Work-product-as-document (the feasibility precondition)
Today `nda-drafter` is told to leave the draft as a "comment, document, or work product" and to write locally via `output-local-markdown`/`output-local-docx` (`AGENTS.md:32,44,70`). The loop requires an **agent-authored paperclip document revision** to diff. We add an `output-paperclip-document` skill (wraps the existing documents API) and update drafters' output contract to produce the draft as a paperclip document. Local-deliverable output remains available but is no longer the only path. **No paperclip change** — we call `POST /issues/:id/documents/:key`.

### 7b. Lock-detection sweep (enumeration)
Preferred: read the **activity log** for `issue.document_locked` since the last sweep (`paperclip/server/src/services/activity-log.ts` maps the activity). Fallback: iterate issues in `in_review`/`done` and check each document's `lockedAt > lastSweepAt`. **UNCONFIRMED — confirm a queryable activity-log endpoint at planning; otherwise use the iterate-issues fallback.** The sweep records `lastSweepAt` in the firm repo for idempotency.

### 7c. Diff → suggestion distillation
The scribe receives draft + final text and produces a *generalizable* lesson, not a verbatim clause copy ("for sales contracts, default governing law to Delaware unless the matter says otherwise" — not "ACME's Delaware clause"). The `diff.ts` helper provides a structured change set; the scribe's skill prompt enforces generalization + a one-line rationale + the target skill slug (the skill the drafting agent used).

### 7d. Firm-repo proposal queue
`proposals.ts` extends the `ledger` status machine. Every entry carries a source-matter citation (required) and is **post-sanitizer**. Contradictory suggestions are flagged for reviewer reconciliation, never silently merged.

### 7e. Morning-review digest
First launcher run of the day for the business shows pending proposals; the reviewer answers yes/no/edit. Designated reviewer is a `businesses/<slug>/` config field (default: the launcher operator). A `learn review` CLI subcommand offers the same outside the morning prompt. (A richer in-app review surface is a future enhancement; the CLI/launcher digest is the v1.)

### 7f. Overlay-override apply path
Carried verbatim from `2026-06-23-skillopt-design.md` §6b. A firm overlay's `SKILL.md` shares the base skill's rel-path and must **override** it; the launcher's existing extra-root pass *raises* on a shared path (`_possiblaw_inline_source.py:286-289`), so we add a dedicated overlay pass with replace semantics + a log line, guarding unknown slugs and preserving the demo-collision check.

## 8. Privacy & ethical wall

- **Lane = the firm's product choice** (the variant they run the product under); no loop-specific privacy default. SOTA cloud is supported; local is used only if the firm chose it. A future consolidated per-business privacy/lane setting reads in at the same point.
- **Sanitizer is the ethical wall.** Every suggested edit passes the Tier-1 fail-closed `sanitizer` before it is stored or shown — one client's identifying facts can never be baked into a firm-wide skill. This is the single most safety-critical component and is unit-tested against a labeled fixture.

## 9. Error handling, isolation & layer-not-fork guarantees

- **Layer-not-fork:** every new artifact is in our layer (`companies/legal-operations/`, `learning-loop/`, `bin/possiblaw`, `businesses/<slug>/`). `paperclip/` is untouched; no PRs to paperclip; we only call its public API.
- **Fail-closed sanitizer:** a sanitizer rejection drops the suggestion (no storage), never a partial store.
- **Idempotent sweep:** `lastSweepAt` prevents re-processing; a document with no agent-authored revision (human-only) is skipped with a logged reason (nothing to learn from).
- **Reviewer-gated apply:** no overlay is written without an explicit yes/edit; `SKILL.md.prev` archived for one-move revert.
- **Graceful degradation:** if the documents API or activity log is unavailable, the sweep logs and exits without corrupting the queue; the dashboard is never blocked.

## 10. Testing (TDD) + eval walkthrough

**Tests:**
- **`learning-loop/` (node:test):** `diff` (draft vs final identified by author field; human-only doc → skipped; empty/one-revision edge), `proposals` (status transitions, source-matter required, post-sanitizer invariant, contradiction flag), `sanitizer` reuse on suggested-edit fixtures (leaked client fact → dropped).
- **Launcher (`python --self-test` + `bash -n`):** overlay-override replaces `skills/<slug>/SKILL.md`; unknown overlay slug errors; demo extra-root collision still errors; morning-digest once-per-day gating; no-business path dry-run regression unchanged.
- **Package parse checks:** new/updated `AGENTS.md` + `output-paperclip-document` skill frontmatter valid; dry-run agent/skill counts update cleanly.
- **Live-ish e2e (disposable server, never port 3100):** agent writes a document → simulate a human-edited + locked revision via the API → run the sweep → scribe diffs + sanitizes → proposal queued → morning digest "yes" → overlay written → `--business` import readback shows the overridden skill body.

**Eval walkthrough (Given/When/Then):**
- **Happy:** Given an NDA the `nda-drafter` wrote as a paperclip document, and a lawyer who edits in a Delaware governing-law clause and locks it; When the sweep runs; Then a sanitized suggestion ("default governing law to Delaware for sales NDAs unless specified") is queued, the morning digest offers yes/no/edit, and on "yes" the `legal-nda-playbook` overlay carries the rule at next launch.
- **Edge (nothing to learn):** Given a locked document with only agent revisions (the lawyer locked without editing), or a change that is purely client-specific; When the sweep runs; Then no suggestion is queued (or the suggestion is dropped post-generalization), logged with a reason — not an error.
- **Failure/security (ethical wall):** Given the lawyer's edit embeds client-identifying facts ("ACME's CEO Jane Roe requires…"); When the scribe drafts a suggestion; Then the sanitizer strips/generalizes or fails closed, and no client-identifying fact is ever written to the firm-wide skill or the queue.

## 11. Scope boundary

**In scope this build:**
- drafter output-contract update + `output-paperclip-document` skill;
- `skill-improvement-scribe` (extend `learning-scribe`) + `skill-improvement-sweep` routine;
- `learning-loop/` `diff.ts` + `proposals.ts` (+ sanitizer/recurrence/store reuse);
- launcher morning-digest (yes/no/edit) + the overlay-override apply path;
- firm-repo `proposals/` + reviewer config;
- docs (README, CHANGELOG, CLAUDE.md code-map, known-limitations, walkthrough) + HANDOFF refresh.

**Explicitly deferred (documented):**
- **SkillOpt engine** (the `2026-06-23-skillopt-design.md` design) — future, gated on enough graded cases;
- **eval-harness validation** of suggested edits (optional pre-apply regression check);
- **external-destination capture** (Word/OneDrive/Drive edits) — future path;
- **true on-lock event trigger** (would need a paperclip plugin = submodule change) — known limitation; the scheduled sweep is the layer-clean substitute;
- a richer in-app review surface (v1 is the launcher digest + `learn review` CLI);
- a consolidated per-business privacy/lane settings object (read point only).

## 12. Risks / landmines

1. **Drafts not captured as documents** — if a drafter outputs only a comment/local file, there's no agent revision to diff. Mitigated by the output-contract update + `output-paperclip-document` skill (§7a); the sweep skips and logs documents with no agent revision.
2. **Ethical-wall breach** — the gravest risk; the fail-closed sanitizer + reviewer gate + source-matter citation mitigate it; unit-tested on a labeled fixture.
3. **Bad-suggestion propagation** — the morning human gate + `SKILL.md.prev` revert + recurrence weighting keep low-quality or one-off edits out.
4. **Sweep enumeration unknown** — activity-log query vs iterate-issues (§7b UNCONFIRMED); resolve at planning before building the sweep.
5. **Lawyer-doesn't-edit-in-app** — if firms edit in Word/OneDrive, the paperclip-native diff is blind; that's the deferred external-destination path, documented as a known limitation.

## 13. Open items / UNCONFIRMED to resolve at planning

- **Sweep enumeration:** confirm a queryable activity-log endpoint for `issue.document_locked`; else use the iterate-issues fallback (§7b).
- **Documents API shape:** confirm exact request/response for creating a document + listing revisions (body field names, `key` semantics) against the pinned paperclip version before writing `output-paperclip-document` + `diff.ts`.
- **Designated-reviewer config:** field name/location in `businesses/<slug>/`; default to the launcher operator.
- **Morning-digest UX:** confirm the launcher prompt vs `learn review` CLI split and the once-per-day gating marker.
- **Routine scheduling:** how the `skill-improvement-sweep` schedule is declared/wired (operator sets cadence in the UI, per the Tier-1 `learning-sweep` precedent).
