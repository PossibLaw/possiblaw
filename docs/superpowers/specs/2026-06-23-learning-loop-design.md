# PossibLaw Learning Loop — Design Spec

> Status: design approved (brainstorm 2026-06-23). Next: implementation plan via writing-plans.
> Author flow: brainstorming → this spec → plan → TDD build.
> Decisions captured from the 2026-06-23 brainstorm are in §15; do not re-litigate without operator input.

## 1. Context

PossibLaw is a layer on the paperclip control plane. paperclip is a pinned git submodule and is **never modified**; the shared agent package lives at `companies/legal-operations/` and must stay pristine so upstream PossibLaw updates and per-firm customization never collide.

The operator wants agents to **improve as work is done** and to be **customizable per business by a non-technical lawyer**. Two reference patterns were studied:

- **Aleph "Optional Learning Loop" (governance pattern, not code):** `Learning Mode` OFF/CAPTURE/APPLY → a *committed* `.agent/LEARNINGS.md`. Off by default, additive, file-based, survives fresh/cloud sessions because the file is committed. This repo already ships the scaffold (`.agent/LEARNINGS.md`, the CLAUDE.md "Optional Learning Loop" section).
- **OpenClaw self-improving skill + Skill Workshop:** capture lessons/errors to Markdown with structured IDs, tiered "HOT" memory always loaded + an archive for decayed lessons, recurring lessons surfaced into global guidance, and skill changes shipped as a **PROPOSAL with a mandatory human approval gate** ("if the agent writes a bad skill, that mistake becomes how future work is done"). OpenClaw-RL (model-weight RL training) was explicitly ruled **out of scope** — incompatible with layer-not-fork and the subscription/API CLI runtime.
- **microsoft/SkillOpt (MIT):** treats the skill document itself as the trainable artifact (no weight training); an optimizer model proposes bounded add/delete/replace edits to a `SKILL.md`, accepting a candidate only when **validation scores strictly improve**; output is `best_skill.md`. This is the **Tier-2 engine** (see §11), deferred to a later phase.

## 2. Goal

A **per-firm learning loop** where a firm's agents get measurably better at *that firm's* work over time, driven by a non-technical lawyer through the paperclip UI, **without modifying paperclip or the shared package**. Two tiers:

- **Tier 1 — memory (fast, this spec / v1):** lawyer feedback + explicit teaching → a per-firm memory injected into future matters.
- **Tier 2 — skill refinement (slow, gated, deferred to Phase 2):** recurring patterns → SkillOpt-optimized, eval-validated, operator-approved edits to skills/playbooks.

## 3. Principles (invariants)

1. **Human-gated.** Nothing auto-applies. Every memory write and every skill edit clears an explicit approval.
2. **Ethical wall.** Memory stores **generalized firm preferences / style / procedure only** — never client-identifying facts. Cross-matter fact leakage (Client A → Client B) is malpractice; prevented by construction (§7).
3. **Traceable.** Every lesson cites its source matter(s) and the originating feedback.
4. **Revertible.** Memory entries live in a ledger + archive; any entry can be removed/rolled back.
5. **Package stays pristine.** All firm-specific state lives in a per-business overlay (§5); the shared package ships only scaffolding (an empty `firm-memory` skill, the `learning-scribe` agent, the `learning-sweep` routine).
6. **Off by default / additive.** Mirrors the existing Optional Learning Loop posture; does not replace `.claude/history.md` or `.agent/HANDOFF.md`.

## 4. Architecture

### Components

- **`learning-loop/` — new standalone TypeScript package** (node:test, mirrors `gate-proxy/` and `eval-harness/`; deps minimal). Holds the **deterministic, testable core** — no LLM calls:
  - `ledger.ts` — read/write the per-firm learnings ledger (dated entries, source citations, status `pending|accepted|rejected|archived`).
  - `sanitizer.ts` — fail-closed entity/pattern screen that verifies a candidate lesson carries no client-identifying facts (reuses the gate-proxy `anonymize` measured-recall approach: caller-supplied entities + pattern classes; any residual entity → reject).
  - `memory.ts` — HOT-memory writer: keeps `firm-memory.md` ≤ ~100 lines, moves displaced/stale entries to `archive/`, dedupes, flags contradictions for reconciliation (never silent overwrite).
  - `recurrence.ts` — counts how often a normalized lesson/pattern repeats across accepted entries; emits the Tier-2 trigger when count ≥ N (consumed in Phase 2).
  - `remember-parser.ts` — extracts an explicit "remember this: …" teaching from an issue comment.
- **`learning-scribe` agent** (shared package, reports to ops-lead). The LLM side: on the `learning-sweep` routine and on `remember this:` comments, it reads completed matters' operator feedback/corrections, **generalizes** a candidate lesson, runs it through `sanitizer`, and posts a **paperclip approval** per lesson (or a small batch). On approval it appends via `memory`/`ledger`. It does **not** generalize anything the sanitizer rejects.
- **`firm-memory` skill** (shared package placeholder; body overlaid per firm). Attached to agents via skill-sync so its body — the firm's HOT memory — is injected into every matter.
- **`learning-sweep` routine** (`.paperclip.yaml`). Scheduled wake for the scribe (e.g. nightly), same mechanism as `nightly-conflicts-check` / `delivery-sweep`.
- **Launcher + helper changes** (`bin/possiblaw`, `bin/_possiblaw_inline_source.py`):
  - `--business <slug>` selects the per-business overlay and applies the firm's `firm-memory` body + (Phase 2) `skill-overlays/`. Requires **extending `EXTRA_ROOT_BASENAMES`** beyond `PROJECT.md`/`TASK.md` to carry `SKILL.md` overlay content (today it is restricted; collisions error).
  - Write-back: on approval, persist the accepted lesson into the firm files.
  - Memory refresh: spike `POST /companies/:companyId/skills/:skillId/install-update` to refresh the `firm-memory` body at runtime without a full re-import (fallback: refresh on next launch).

## 5. Per-business store layout

Lives in the **firm's clone** (committed there — that is the portability point), created/maintained by the launcher:

```
businesses/<firm-slug>/
  memory/
    firm-memory.md        # HOT, ≤ ~100 lines, always-loaded (overlays the firm-memory skill body)
    index.md              # topic index
    archive/              # decayed / displaced lessons
  learnings/
    ledger.md             # dated entries: source matter(s), originating feedback, status
  skill-overlays/         # Phase 2 (SkillOpt output) — reserved in v1
```

The canonical upstream PossibLaw repo tracks only a `businesses/_template/`; real firm data is gitignored upstream (`businesses/*` with a `!businesses/_template/` exception) and un-ignored by the firm in their own clone — mirroring Aleph's committed-`LEARNINGS.md` exception.

## 6. Learning signals & capture (v1)

Two lawyer-driven signals (agent self-reflection was considered and rejected as too noisy):

1. **Operator feedback & corrections** — when the lawyer edits, rejects, or comments on a deliverable, or rejects at a gate. The scribe reads the matter's feedback surface (exact surface is a Phase-0 spike, §14) and drafts a generalized candidate lesson.
2. **Explicit "remember this for us"** — the lawyer states a standing preference in a comment ("we cap indemnity at fees paid", "always Delaware law for NDAs"). `remember-parser` extracts it; still sanitized and recorded; lightly gated.

Timing: **batch** via `learning-sweep` (post-matter / scheduled). Explicit teaching may be processed near-immediately on the next sweep. Capture never blocks a live matter.

## 7. Sanitizer / ethical wall

The hard governance boundary. A candidate lesson must be a **generalized principle**, not a client fact. Flow: the scribe (LLM) generalizes → `sanitizer` (deterministic) verifies no supplied client entities or pattern-class PII (names, orgs, emails, amounts, dates tied to a party) survive. **Fail-closed:** a candidate that cannot be generalized without client facts is **not stored** and is logged as rejected. This makes Client-A→Client-B leakage structurally impossible in memory (PLAN risk #4).

## 8. Memory injection

The firm's `firm-memory.md` is the body of the `firm-memory` skill, attached to relevant agents via paperclip skill-sync (`desiredSkills`), so it loads into every matter's context. Updates propagate via `install-update` (spike) or next launch. Injection reliability vs. a company-doc fallback is a Phase-0 spike (§14).

## 9. Review & apply

- **Tier-1 memory:** scribe posts a paperclip **approval** (UI card with the candidate lesson + its source citation). Lawyer approves/edits/rejects in the UI. Approve → `memory`/`ledger` append + skill refresh. This is the lawyer-friendly, non-technical surface.
- **Tier-2 skill edits (Phase 2):** route through the existing `capability-builder` operator-approval gate (`AWAITING OPERATOR APPROVAL — reply "APPROVED: <slug>"`), landing in `skill-overlays/`.

## 10. Data flow (v1)

```
lawyer edits/rejects/comments  ──┐
"remember this: …" comment    ──┤
                                 ▼
            learning-sweep routine wakes learning-scribe
                                 ▼
        scribe reads matter feedback → LLM generalize
                                 ▼
              sanitizer (deterministic, fail-closed)
                                 ▼
            paperclip approval card  ──reject──▶ ledger: rejected
                                 │ approve
                                 ▼
   memory.ts append firm-memory.md (+ archive overflow) + ledger: accepted
                                 ▼
        firm-memory skill refresh (install-update | next launch)
                                 ▼
              injected into future matters' context
                                 ▼
        recurrence.ts counts repeats  ──(≥N)──▶  Tier-2 trigger (Phase 2)
```

## 11. Tier-2 — SkillOpt skill refinement (Phase 2, designed / deferred)

Built after v1, gated on enough graded eval cases (see §16). Composition (operator-confirmed):

- **Engine:** SkillOpt (MIT, isolated optional Python venv, invoked **offline** — never on the launcher's critical path). Inputs: the firm's matter **rollouts/traces** + the current skill doc + **validation scores from the eval-harness all-pass rubric**. SkillOpt's validation gate accepts only edits that strictly improve those scores → `best_skill.md`.
- **Trigger:** `recurrence.ts` count ≥ N for a pattern tied to a skill.
- **Human gate:** the validation-gated candidate is **not** auto-applied. It passes through `capability-builder`'s operator-approval gate, then lands as `businesses/<slug>/skill-overlays/<skill-slug>/SKILL.md`, applied at next import via the extended `--extra-root`.
- **Why two gates:** automated validation narrows to provably-better edits; the lawyer makes the final, defensible call.

## 12. Eval walkthrough (Given/When/Then)

- **Happy:** Given matter 1's NDA draft is corrected ("cap indemnity at fees paid") and the lesson is approved into memory; When a new NDA matter opens; Then the drafter applies the cap unprompted, and the ledger shows the lesson + source matter.
- **Edge (promotion → Phase 2):** Given the same correction recurs across ≥N matters; When the sweep runs; Then a Tier-2 trigger fires and (Phase 2) SkillOpt proposes a validation-gated, gate-reviewed skill-overlay edit.
- **Failure/security (ethical wall):** Given feedback containing client-identifying facts ("ACME's CEO is …"); When the scribe drafts a lesson; Then the sanitizer strips/blocks the client facts and either generalizes ("for confidential counterparties, …") or fails closed (no storage); no Client-A fact ever appears in a Client-B matter.

## 13. Testing (TDD)

- **Deterministic core (`learning-loop/`):** node:test unit suites, red→green per module — `sanitizer` (fixture precision/recall ≥ threshold; leaked-entity → reject; no-entities privileged free text → reject), `memory` (HOT cap enforced, archive overflow, dedup, contradiction flag), `ledger` (status transitions, source citation required), `recurrence` (count threshold), `remember-parser`.
- **Launcher/helper:** `bash -n`; helper `--self-test`; `--business <slug>` overlay merges the memory body; dry-run regression unchanged for the no-business path.
- **Live e2e (the demo):** on a disposable server (never port 3100) — capture → approve → inject → re-run a similar matter shows the improvement; mirrors gate-proxy's unit-tests-plus-live-e2e pattern.

## 14. Phase 0 spikes / UNCONFIRMED (resolve before code)

1. **`install-update` semantics** — does it refresh a skill's body at runtime and re-sync to agents, or only patch metadata? (Fallback: refresh on next launch.)
2. **Operator-feedback surface** — exactly where corrections/rejections are readable: approval rejection payload vs. issue comments vs. gate receipts. Determines what the scribe reads.
3. **Memory injection reliability** — skill-sync body injection vs. a company-doc fallback; pick the more deterministic.
4. **`--extra-root` extension** — confirm extending `EXTRA_ROOT_BASENAMES` to carry `SKILL.md` overlay content (and any sidecar) is clean and collision-safe.

## 15. Risks / landmines

1. **Bad lesson propagation** (OpenClaw's own warning) — mitigated by the two gates + revertible ledger/archive.
2. **Ethical-wall breach** — the single most serious risk; sanitizer is fail-closed and unit-tested on a labeled fixture.
3. **Memory bloat** — HOT cap + archive/decay keep injected context small.
4. **Contradictory lessons** — flagged for lawyer reconciliation, never silently overwritten.
5. **Python dependency creep (Phase 2)** — SkillOpt isolated in its own venv, optional, offline; launcher stays stdlib-only.
6. **Re-import friction** — if `install-update` can't refresh at runtime, memory updates wait for next launch (acceptable v1 fallback; documented).

## 16. Relationship to initiative A (evals / orchestration)

The eval harness (shipped) is the **validation signal** SkillOpt needs in Phase 2 — initiative A's measurement powers initiative B's Tier-2. v1 (Tier-1 memory) has **no** dependency on the orchestration eval or LAB adapter and can ship independently. Tier-2 is gated on a usable per-firm validation set, which matures alongside the orchestration-eval / LAB work.

## 17. Decisions resolved (operator, 2026-06-23 — do not re-ask)

1. Mechanism = **both** memory + skill refinement (model-weight training / OpenClaw-RL out).
2. Persistence = **hybrid** — per-business files (git-tracked, portable) are source of truth; capture/review/approve via the paperclip UI for a non-technical lawyer; launcher writes files on approval.
3. Signals = **operator feedback/corrections** + **explicit "remember this"** (Tier-1); **cross-matter pattern detection** (Tier-2 trigger). Agent self-reflection excluded.
4. Wiring = **Approach A** — memory-as-skill + `learning-scribe` on a routine.
5. SkillOpt = Tier-2 **engine, wrapped by the capability-builder human gate, validated by eval-harness scores.**
6. Scope = **Tier-1 now; SkillOpt Tier-2 next phase** (gated on enough graded eval cases).
