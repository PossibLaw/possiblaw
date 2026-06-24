# SkillOpt add-on — Tier-2 skill refinement (design)

> **DEFERRED (2026-06-23).** Superseded as the Tier-2 centerpiece by the learn-from-edits **skill-improvement loop** (`docs/superpowers/specs/2026-06-23-skill-improvement-loop-design.md`). SkillOpt needs clear evals + lots of graded data a firm won't have on day one, so it is **not built now**. This document is retained as the design of the **deferred future engine**: once a firm accumulates enough graded cases, SkillOpt can generate eval-validated candidate skill edits that flow into the *same* morning-review queue the skill-improvement loop establishes. The reusable parts that the active build adopts now (the **skill-overlay override apply path**, §6b) are carried into the new spec.

**Date:** 2026-06-23
**Status:** DEFERRED — future engine; not in the active build (see banner above)
**Branch:** `feat/skill-optimizer` (off `main` @ `13b6e1f`, after Tier-1 PR #1 merged)
**Supersedes/extends:** `docs/superpowers/specs/2026-06-23-learning-loop-design.md` §11 (Tier-2, previously "designed / deferred"). Tier-1 (memory) shipped in PR #1.

---

## 1. Purpose

Tier-2 of the learning loop turns a firm's recurring, accepted lessons into **eval-validated, human-approved edits to a skill document**, using microsoft/SkillOpt (MIT) as the optimizer engine. SkillOpt treats a `SKILL.md` as the trainable artifact: a separate optimizer model turns *scored rollouts* into bounded add/delete/replace edits, accepting a candidate **only when a held-out validation score strictly improves** → `best_skill.md`. The result is a per-business `skill-overlays/<slug>/SKILL.md` that overrides the package skill for that firm — never auto-applied, always behind a human gate.

This pass builds the **engine + plumbing end-to-end**, with the *quality of the validation signal* behind a clean interface that a richer signal (Harvey LAB / a per-firm validation set) swaps into later.

## 2. Operator decisions (resolved 2026-06-23 — do not re-ask)

1. **Session scope** = engine + plumbing, with the validation gate behind a clean interface (not a no-build research spike, not the full per-firm validation set).
2. **Rollout execution** = SkillOpt-native backend, **offline**, on the firm's lane. Never touches the launcher critical path, the paperclip server, or the gate proxy. Matches SkillOpt's frozen-single-agent grain.
3. **Validation split (this pass)** = reuse the existing `eval-harness` cases (seed cases + CUAD), and wire the `eval-harness` all-pass rubric as the rollout scorer. LAB / per-firm sets swap in later behind the same `Scorer` interface.
4. **Packaging** = a new standalone `skill-optimizer/` Python component (isolated optional venv, `pip install skillopt`), mirroring the `gate-proxy/` / `eval-harness/` / `learning-loop/` convention.
5. **Privacy** = the firm's **product-level choice**, not a SkillOpt-specific gate. Sending matter/eval content to a SOTA cloud model is a normal, supported mode for a firm on its own tenant; weaker local models are *not* forced as a "safe default." SkillOpt's lane **defaults to the variant that business runs the product under** (supplied at run, matching launch). A future consolidated per-business privacy/lane setting plugs into the same read point.

## 3. Relationship to Tier-1 and to the eval/orchestration initiative

- **Depends on Tier-1 (now merged):** `recurrence.ts` (the count-≥-N trigger), `businesses/<slug>/` store, `businesses/<slug>/skill-overlays/` (reserved slot), and the launcher `--business <slug>` overlay pass.
- **Depends on the eval-harness (shipped):** its graders (`eval-harness/src/grade/*`) become the rollout scorer via a new grade-only subcommand.
- **Deliberately decoupled from the orchestration eval / Harvey LAB:** those mature the *per-firm validation set*. This pass uses generic eval cases so it can ship independently; `LabScorer` is a seam, not built here.

## 4. Component layout — `skill-optimizer/`

Python 3.10+, isolated optional venv. **The launcher never imports it; the launcher stays stdlib-only.**

```
skill-optimizer/
  README.md
  setup.sh                       # creates ./.venv, pip installs requirements
  requirements.txt               # skillopt (PINNED) + deps
  pyproject.toml                 # wrapper pkg: possiblaw_skillopt
  bin/skillopt-optimize          # thin entrypoint → python -m possiblaw_skillopt.cli
  src/possiblaw_skillopt/
    cli.py                       # `optimize --business <slug> --skill <slug> [--lane <variant>] [--epochs N] [--scorer eval-harness|stub]`
    env/                         # SkillOpt env adapter (registered into SkillOpt's env registry)
      dataloader.py              # loads reused eval cases → SkillOpt items
      rollout.py                 # runs firm-lane model with skill injected, calls scorer → {hard, soft}
      adapter.py                 # EnvAdapter: build_train_env / build_eval_env / rollout / get_task_types
      initial_skill.py           # firm's current skill body → initial.md seed
    scorer.py                    # Scorer protocol; EvalHarnessScorer + StubScorer (the LAB-swap seam)
    lane.py                      # maps our variant → SkillOpt backend + model config
    candidate.py                 # writes best_skill.md → skill-overlays/<slug>/SKILL.md.candidate + provenance; promote()
  tests/                         # stdlib unittest; skillopt + model calls mocked
```

> **UNCONFIRMED until implementation (pin first):** exact SkillOpt public API surface — package name on PyPI (`pip install skillopt`), env-extension contract (`SplitDataLoader.load_split_items`, `run_batch(*, items, skill_content, out_root, ...)`, `EnvAdapter` methods, `_ENV_REGISTRY` registration, `configs/<env>/default.yaml`, rollout output keys `{id, hard, soft}`, `skillopt.model.chat_target(...)`, backends incl. `claude_code_exec` / `codex_exec`). These were gathered from the SkillOpt README + `docs/guide/new-benchmark.md` and **must be verified against the pinned version** in the first implementation task. The adapter is written to whatever the pinned version actually exposes.

## 5. Data flow (end to end)

1. **Eligibility (no auto-run).** Tier-1's `recurrence.ts` emits a Tier-2 trigger at count ≥ N. We add a *surfacing* step (in the `learn` CLI / `learning-sweep`): "skill `<slug>` for business `<slug>` has N recurrences ≥ threshold — eligible for optimization." Because a run is offline, gated, and model-expensive, **nothing fires automatically**.
2. **Operator kicks off** (manual, gated): `skill-optimizer/bin/skillopt-optimize --business <slug> --skill <slug> [--lane <variant>]`.
3. **SkillOpt loop runs offline:** `initial.md` = the firm's current skill body (existing overlay if present, else the package skill); `dataloader` loads the reused eval cases for that skill as the held-out split; `rollout` runs the firm-lane model (SkillOpt-native backend mapped from the variant) with the candidate skill injected; **scorer = eval-harness grade** → `{hard, soft}`. SkillOpt accepts only strictly-improving edits → `best_skill.md`.
4. **Candidate output (not applied):** `best_skill.md` → `businesses/<slug>/skill-overlays/<slug>/SKILL.md.candidate` + a provenance sidecar (before/after scores, epochs, source case IDs, lane, SkillOpt version).
5. **Human gate:** capability-builder reviews; on `APPROVED: <slug>` the `.candidate` is promoted to `…/skill-overlays/<slug>/SKILL.md` (prior overlay archived to `SKILL.md.prev`).
6. **Apply at next import:** the launcher `--business` overlay pass also applies skill-overlays — **overriding** `skills/<slug>/SKILL.md` in the bundle (explicit override + log line, not collision-error). Propagation is next-launch, consistent with Tier-1's `install-update` finding.

## 6. The three seams

### 6a. Scorer seam + new `eval-harness` grade-only subcommand

SkillOpt's `rollout` produces an output string per task and needs a `{hard, soft}` score. `Scorer` is a Python protocol with two implementations:

- **`EvalHarnessScorer`** — shells out to a **new** `bin/eval grade --case <caseId> --output <file> --judge-lane <variant> --json` subcommand (added to the CLI dispatcher `eval-harness/src/index.ts`; `bin/eval` is the repo-root wrapper into it), which reuses the existing graders (`runRubric` in `eval-harness/src/grade/rubric.ts`, plus `deterministic.ts` where a case defines deterministic checks) and returns `{ pass, score, verdicts }`. Mapping: `hard = pass ? 1 : 0`, `soft = score`. This is the **only** new eval-harness code — a thin command that *judges an already-produced output*; it does not run the subject model.
- **`StubScorer`** — deterministic, dependency-free (keyword/length heuristic) for unit tests and for runs before a judge lane is configured.

`Scorer` **is the LAB-swap seam**: a future `LabScorer` drops in without touching the env adapter. Selection: `--scorer eval-harness|stub` (default `eval-harness`).

`runRubric` already grades an arbitrary `output` string → `{ score, pass, verdicts }` (`eval-harness/src/grade/rubric.ts`), so no grader rewrite is required — only a CLI seam that takes `(caseId, outputFile)`.

### 6b. Overlay-override apply path (divergence from the learning-loop spec's original note)

The learning-loop spec assumed "extend `EXTRA_ROOT_BASENAMES` to include `SKILL.md`." That path is **insufficient**: `build_inline_source` *raises* a collision error when an incoming file shares a package rel-path (`bin/_possiblaw_inline_source.py:286-289`), and a firm overlay's `SKILL.md` is *supposed* to share `skills/<slug>/SKILL.md`'s path.

Instead, add a **dedicated overlay pass** in `build_inline_source`: after the package files are loaded, for each `businesses/<slug>/skill-overlays/<skill-slug>/SKILL.md`, map it to rel `skills/<skill-slug>/SKILL.md` and **replace** the package entry, emitting a stderr log line (`overlay: skills/<slug>/SKILL.md ← business <slug>`). Guards:
- the overlay skill slug **must exist** in the package (unknown slug → error, not silent skip);
- only `SKILL.md` directly under `skill-overlays/<slug>/` is eligible;
- the existing collision-error for demo extra-roots stays intact;
- Tier-1's `firm-memory` marker-substitution is untouched.

This is wired into the same `--business <slug>` resolution Tier-1 added.

### 6c. Privacy follows the firm's posture; governance gates are separate

- **Lane = the firm's product choice.** SkillOpt's rollout lane defaults to the variant that business runs the product under (supplied at run, matching launch); `--lane` overrides for power users. **No SkillOpt-specific "confidential → force local" default, no extra acknowledgment.** SOTA cloud is fully supported and expected. A future consolidated per-business privacy/lane setting reads in at the same point (`lane.py`).
- **Cross-client ethical wall is about the future per-firm path, not cloud.** The learning-loop `sanitizer` prevents one client's identifying facts from being baked into a firm-wide skill (a within-firm cross-client concern), which is orthogonal to "is cloud OK." This pass uses **generic eval cases**, so the sanitizer is not exercised here; it gates only when real per-firm matters become validation tasks later (deferred).
- **Quality/governance gates (unchanged, not privacy):** SkillOpt's strict-improvement validation gate (automated) + capability-builder `APPROVED: <slug>` (human), with `SKILL.md.prev` archived for one-move revert. `best_skill.md` is never auto-applied.

## 7. Error handling, isolation & optionality

- **Fully optional & offline.** If the venv / `skillopt` is not installed, `optimize` prints a one-line bootstrap hint (`skill-optimizer/setup.sh`) and exits non-zero; nothing else in the product is affected. The optimizer never starts or needs a paperclip server or the gate proxy; it touches only `businesses/<slug>/`, the package skill, and the eval cases.
- **Fail-closed scoring.** A scorer/grade error (eval-harness not built, unknown case ID, judge-lane creds missing) **aborts the run with a clear message** — it never silently scores 0 (a silent 0 would make SkillOpt "find no improvement" and look like a benign no-op).
- **Lane/creds errors are explicit.** `lane.py` maps variant → backend; unknown variant → error listing supported lanes; missing backend creds → error naming the exact env var (read at run time, never persisted).
- **Candidate safety.** `.candidate` + provenance written atomically; `promote()` archives the prior overlay to `SKILL.md.prev`; an approved overlay is never overwritten without an archive.

## 8. Testing (TDD)

Mirrors the gate-proxy unit + live-e2e pattern.

- **Python (stdlib `unittest`; skillopt + model calls mocked):**
  - `dataloader` — reused eval cases → items (id / task_type / fields); empty/invalid case → error.
  - `scorer` — `EvalHarnessScorer` invokes `grade` with the right args, parses JSON → `{hard, soft}`; grade error → **aborts** (fail-closed); `StubScorer` deterministic.
  - `lane` — variant→backend mapping; unknown variant → error; missing creds → named error.
  - `candidate` — atomic `.candidate` + provenance write; `promote()` archives `.prev`; unknown skill slug → error.
  - `rollout`/`adapter` — with skillopt's model call + scorer mocked, verify `skill_content` injected and `{id, hard, soft}` shape returned.
  - `cli` — arg parsing; missing-venv/skillopt → bootstrap message, exit non-zero.
- **eval-harness (node:test):** new `grade` subcommand grades a known output against a case → `{pass, score, verdicts}`; unknown case → error; deterministic vs rubric paths.
- **Launcher (`python --self-test` + `bash -n`):** overlay-override replaces `skills/<slug>/SKILL.md`; unknown overlay slug → error; demo extra-root collision still errors; no-overlay dry-run regression unchanged.
- **Live-ish e2e (disposable, never port 3100):** `optimize` on a generic skill end-to-end → `.candidate` + provenance with before/after scores → promote → `--business` import readback shows the overridden body. If a real model run is not feasible in-session, e2e uses `StubScorer` + a mock backend to prove wiring, and a real-model run is flagged operator-side.

### Eval walkthrough (Given/When/Then)

- **Happy:** Given a firm's `legal-nda-playbook` skill and the reused NDA eval cases as the held-out split; When the operator runs `optimize --business acme --skill legal-nda-playbook` and SkillOpt finds an edit that strictly improves the all-pass rubric score; Then a `SKILL.md.candidate` + provenance (before/after scores) is written, and after `APPROVED: legal-nda-playbook` the overlay is applied at next import (readback shows the new body).
- **Edge (no improvement):** Given no candidate edit beats the baseline validation score; When the loop completes; Then no `.candidate` is written, the run reports "no strictly-improving edit found," and exits 0 (a real, non-error outcome — distinct from a scorer abort).
- **Failure/security (fail-closed scorer + override guard):** Given the eval-harness is not built (grade subcommand fails) **or** the overlay names a skill slug absent from the package; When `optimize` / import runs; Then it **aborts with a clear error** rather than scoring 0 or silently skipping the overlay — no half-applied or falsely-passing state.

## 9. Scope boundary

**In scope this pass:**
- the `skill-optimizer/` component (env adapter, `Scorer` seam, `lane` map, `candidate`/`promote`, CLI, tests);
- the `eval-harness` `grade` subcommand;
- the launcher overlay-override apply path + recurrence-eligibility surfacing in the `learn` CLI / sweep;
- docs (skill-optimizer README, CHANGELOG, CLAUDE.md code-map, known-limitations, walkthrough) + spec/HANDOFF refresh.

**Explicitly deferred (seams only, documented):**
- `LabScorer` / Harvey LAB adapter (the real per-firm validation maturity);
- per-firm validation set derived from real matters + sanitizer-on-real-matters path;
- auto-kickoff from the sweep (stays manual/gated);
- consolidated per-business privacy/lane settings object (read point only);
- online/runtime skill refresh (stays next-launch).

## 10. Risks / landmines

1. **SkillOpt API drift vs. the README docs** — pin the version and verify the env-extension contract in the first task before writing the adapter (see §4 UNCONFIRMED).
2. **Bad-lesson propagation** — mitigated by the two gates (automated strict-improvement + human approval) and `SKILL.md.prev` revert.
3. **Scorer cost/latency** — the rubric scorer makes judge-model calls per rollout; keep epochs/case-count modest by default and document cost. Prefer deterministic-graded cases where available.
4. **Override mechanism correctness** — overlays intentionally collide with the base skill path; the dedicated override pass must not weaken the demo extra-root collision guard (covered by self-tests).
5. **Python dependency creep** — confined to the optional `skill-optimizer/` venv; the launcher and other components stay as-is.

## 11. Open items to confirm at planning / implementation

- Pin the SkillOpt version and verify its exact env-extension API (§4).
- Confirm the `eval-harness` grade subcommand's judge-lane default and JSON shape against `runRubric`'s return.
- Confirm the eligibility-surfacing wording/where it lives (`learn` CLI subcommand vs `learning-sweep` output).
