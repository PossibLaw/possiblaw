# Harvey LAB Adapter + Orchestration Eval — Implementation Plan

**Status:** PLAN (not started). This is the deferred "Initiative A — orchestration eval, the thesis test" + the Harvey LAB adapter the `eval-harness/src/adapters/lab.ts` stub points at (design spec §13). It is NOT part of the trust-pipeline North Star (that is complete, Phases 0–5 on `main`) — it is the parallel measurement track.

## Why this exists
The current `eval-harness` scores ONE agent single-shot. It does **not** test the repo's actual thesis: *a delegator decomposes a matter into atomic work per role, then reconstitutes + reviews — and that produces better output than one monolithic agent.* This plan builds the eval that runs the WHOLE orchestrated pipeline and grades the final reconstituted draft, then A/B's it against a monolithic arm on the same task + same rubric. **If orchestrated > monolithic, the thesis is proven with a number.** Harvey LAB is the task source (real legal tasks + rubrics); CUAD already works as the simpler clause-extraction benchmark.

## What already exists (the seams — reuse, don't rebuild)
- `eval-harness/src/benchmarks.ts` — the `--benchmark` registry; a new benchmark registers here and becomes runnable (CUAD is the working example).
- `eval-harness/src/adapters/lab.ts` — **STUB** (`throw new Error("lab adapter not implemented")`). This plan fills it in.
- `eval-harness/src/adapters/cuad.ts` — the working adapter pattern to mirror (maps a dataset → `Case[]`).
- `Case` type (`eval-harness/src/types.ts`): `{ slug, target, targetType:'agent'|'skill', input_brief, documents[], grading:{ mode:'deterministic'|'rubric', rubric?:{ judge_model, pass_rule:'all', criteria[] } }, source:{ kind:'local'|'benchmark'|'external', name? } }`.
- **All-pass rubric grading is already built** (the `pass_rule:'all'` LLM-judge path) — the grading half of the A/B is done.
- Orchestration agents are all present in the package: delegator `chief-of-staff` → `chief-counsel` → practice lead (decomposes via **child issues**); atomic work = specialists; reconstitution = `reconciler`; review = `risk-spotter`/`debate-judge`.

## SPIKE — resolve before building (mirror the Phase 0/2/3 spike discipline; `file:line`-verified against the pinned paperclip submodule + eval-harness)
- [ ] **S1 — LAB data shape + license.** Confirm the Harvey LAB task format (instruction + matter documents + rubric/answer key) and that vendoring a curated SUBSET in-tree is license-clean (LAB is MIT — confirm). Decide: **vendor a small curated subset under `layer/evals/datasets/lab/` (deterministic, offline, no network)** vs fetch-on-demand. (Default recommendation: vendor a subset, like CUAD's `fixtures.jsonl` — offline + reproducible; document provenance + license.)
- [ ] **S2 — orchestration "done" detection.** How does the runner know an orchestrated matter has finished? Confirm the paperclip endpoint/signal: poll issue status to `done`/`in_review`? read the `reconciler`'s output work product/document? (`paperclip/server/src/routes/issues.ts` issue status + work-products/documents — the Phase-3 spike already mapped `GET /issues/:id` → `status` + `workProducts[]` + `documentSummaries[]`; reuse it.)
- [ ] **S3 — extract the final reconciled draft.** Where is the reconstituted output? The `reconciler`'s document/work product on the parent issue? Confirm the read path (reuse Phase-3 S2: `GET /issues/:id/documents/:key`).
- [ ] **S4 — force the monolithic arm.** How to run "Arm A" (one agent, one shot, NO decomposition) inside paperclip for the same task — assign directly to a single capable agent (e.g. `chief-counsel` or a practice lead) with a workMode/flag that suppresses child-issue decomposition? Confirm whether paperclip exposes a single-shot assignment vs the orchestrated `requestDepth`/child-issue path.
- [ ] **S5 — long-horizon vs single-issue.** LAB tasks can be multi-step; paperclip's model is issue + child issues. Confirm a LAB task maps cleanly to one parent issue (+ children for Arm B). If a task needs a document sandbox / multi-turn state beyond that, scope it OUT of v1 (pick LAB tasks that fit the single-parent-issue model) and document.
- [ ] **S6 — runner auth + disposable instance.** The runner drives a real paperclip instance (a disposable one, never port 3100). Confirm it can create the matter issue, assign it, await completion, and read the result via the REST API (reuse the firm-facade/gate-proxy paperclip-client patterns). Company-scoped, no board.

**Spike exit:** every endpoint cited with `file:line`; the LAB data subset chosen + provenance/license documented; the monolithic-vs-orchestrated arm mechanism confirmed.

## Build units (TDD, subagent-driven)
- **U1 — LAB adapter** (`eval-harness/src/adapters/lab.ts` + register in `benchmarks.ts`). Map the vendored LAB subset → `Case[]` (instruction → `input_brief`, matter docs → `documents[]`, rubric → `grading.rubric{pass_rule:'all', criteria}`). Mirror `cuad.ts`. Tests: loads N cases, shapes valid, rubric criteria present. `./bin/eval --list` shows `lab`. (This alone makes a SINGLE-agent LAB run possible — the monolithic arm baseline.)
- **U2 — paperclip-execution runner** (the real lift — new `eval-harness/src/runners/paperclip.ts` or similar). Given a `Case`: create a disposable matter issue, run **Arm A** (single agent, one shot — S4) and **Arm B** (orchestrated: chief-of-staff → decompose → specialists → reconciler → review), await completion (S2), extract the final draft (S3). Returns the two drafts. Zero-network unit tests with an injected fake paperclip-client; a live e2e on a disposable instance (never 3100). Honest about determinism: agent runs are non-deterministic — average over K runs / report variance.
- **U3 — A/B harness + report.** Grade both arms' final drafts with the existing all-pass rubric (same `judge_model`, same criteria), produce a comparison report (Arm A pass-rate vs Arm B pass-rate, per-task + aggregate, with the spend + run count). New `./bin/eval run --benchmark lab --orchestration-ab` mode (or a separate `bin/eval orchestration`). The headline output is a single number: does B beat A, and by how much.
- **U4 — docs + honest scope.** Walkthrough ("measure the thesis"), known-limitations (LAB subset only, non-determinism averaged, single-parent-issue tasks only in v1), CHANGELOG. Update the eval-harness design spec §13 from "future" to "shipped (subset)".

## Evals / acceptance (Given/When/Then)
- **HAPPY:** Given a vendored LAB task; When `./bin/eval run --benchmark lab --variant <v>` runs Arm A (single agent); Then a graded report is produced with the all-pass rubric. (Baseline works.)
- **THESIS:** Given the same task; When the A/B mode runs both arms; Then a report shows Arm A vs Arm B pass-rates over K runs with a clear delta. (The measurement works — whatever the sign.)
- **FAILURE/HONESTY:** Given a LAB task that needs multi-turn document-sandbox state beyond a single parent issue; Then it is SKIPPED with a logged reason, not silently mis-run (no inflated coverage).

## Risks
- **The runner is the real lift** — awaiting async multi-agent completion + extracting the reconciled draft against a live paperclip instance is the hard, flaky part. Build it last, behind solid spike receipts; isolate non-determinism (K runs, report variance).
- **Non-determinism** — agent outputs vary run-to-run; a single A/B run proves nothing. Average over K and report spread, or the "number" is noise.
- **Overclaim** — only vendor a LAB subset; say so. Don't claim "we ran Harvey LAB" if it's 30 curated tasks. Tasks that don't fit the single-parent-issue model are out of v1 scope, documented.
- **Cost** — orchestrated runs spawn many agent calls; gate on `--budget`, log spend, keep the default task count small.

## Self-review (plan-time)
Reuses the built seams (benchmarks registry, all-pass rubric, the Phase-3 paperclip-client + issue/document read endpoints). The genuinely new work is the LAB adapter (mechanical, mirrors CUAD) + the orchestration runner (the lift, spike-gated). The thesis A/B is the point; the report's single number is the deliverable. UNCONFIRMEDs are corralled into S1–S6.
