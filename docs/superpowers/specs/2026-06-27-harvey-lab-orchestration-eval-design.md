# Harvey LAB Orchestration Eval — Design Spec

**Date:** 2026-06-27
**Status:** DESIGN (approved by operator; ready for implementation-plan stage).
**Relates to / refines:** `docs/superpowers/plans/2026-06-27-harvey-lab-orchestration-eval.md` (the earlier PLAN). This spec **supersedes the data-sourcing assumptions** of that plan: spike S1 is now resolved against the real Harvey LAB repo (full MIT dataset, not a partial subset), and the design adds a **smart cost-routing experiment** the plan did not have.
**Thesis under test:** *A delegator that decomposes a matter into atomic per-role work, then reconstitutes + reviews, produces better output than one monolithic agent doing the same task one-shot — and with smart per-lane model routing, does so at competitive or lower cost.*

---

## 1. Summary

Harvey LAB (Legal Agent Benchmark) is an open-source, MIT-licensed benchmark of real legal tasks: each task is a partner-style instruction over a set of matter documents, with an inline all-pass rubric and an LLM judge. The standard way to run LAB is to hand a task to **one agent** and score its deliverable.

This eval inverts that: the **same** Harvey task — unmodified instruction, unmodified documents, unmodified rubric, unmodified judge — is dropped into PossibLaw's issue bank, and the **only thing swapped is the agent**. We run two arms on the identical task:

- **Arm A (monolithic baseline):** one capable agent, one shot, no decomposition — the assumption the benchmark is built around.
- **Arm B (orchestrated, the thesis):** chief-of-staff → decompose into child issues → specialists → reconciler → review, producing a reconstituted deliverable.

Both arms' deliverables are scored by **Harvey's own judge** on the **same rubric**. Because we authored neither the task, the rubric, nor the judge, a win is unimpeachable. On top of the quality A/B, a second experiment maps the **quality/cost frontier** by progressively routing cheaper models down the agent lanes via OpenRouter, with paperclip budgets as a hard backstop.

**Deliverable:** a single, defensible result — *does orchestrated Arm B match-or-beat monolithic Arm A on the Harvey rubric, and at what cost.*

---

## 2. Goals / Non-Goals

### Goals
- Run real Harvey LAB tasks through the **real PossibLaw app** (paperclip orchestration), not a re-implementation that games the benchmark.
- Score with **Harvey's own evaluation harness + judge**, unmodified.
- Produce a defensible **Arm A vs Arm B** comparison over **K runs** with variance, per task and aggregate.
- Add a **cost dimension**: per-arm spend, and a progressive model-routing sweep that maps the quality/cost frontier.
- Stay **layer-not-fork**: Harvey LAB and paperclip are pinned, never modified.

### Non-Goals (v1)
- Running the full 1,749-task set. v1 is a **curated single-parent-issue subset**.
- Long-horizon, multi-step "sandbox" LAB tasks that need iterative tool-use state beyond one parent issue (+ children). These are **skipped with a logged reason**.
- A full lane-by-lane cost sweep across every model. v1 ships the framework + 2–3 sweep points; more points are config rows, not new code.
- Modifying paperclip or Harvey LAB source.

---

## 3. Background — the seams we reuse (verified)

### 3.1 PossibLaw eval-harness (existing)
- `eval-harness/src/types.ts` — the `Case` type (`slug`, `target`, `targetType`, `lane`, `input_brief`, `documents[]`, `grading{ mode, rubric{ judge_model, pass_rule:'all', criteria[] } }`, `source`, `metadata`). LAB tasks map onto this.
- `eval-harness/src/benchmarks.ts` — the `--benchmark` registry. A new benchmark registers here and becomes runnable. CUAD is the working example.
- `eval-harness/src/adapters/cuad.ts` — the working adapter pattern (dataset → `Case[]`) to mirror.
- `eval-harness/src/adapters/lab.ts` — **STUB** (`throw new Error("lab adapter not implemented")`). This spec fills it in.
- All-pass rubric grading already exists in the harness (the `pass_rule:'all'` path).

### 3.2 PossibLaw orchestration agents (present in the package)
- Delegator: `chief-of-staff` → `chief-counsel` → practice lead (decomposes via **child issues**).
- Atomic work: specialists. Reconstitution: `reconciler`. Review: `risk-spotter` / `debate-judge`.

### 3.3 PossibLaw model-lane "smart router" (existing — `companies/legal-operations/variants.yaml`)
- Five lanes per agent (`metadata.possiblaw.modelLane`): `primary`, `routing`, `drafting`, `review`, `extractive`.
- Each variant maps lanes → models. The `claude` variant already cost-tiers: primary/drafting/review→`claude-opus-4-7`, routing→`claude-sonnet-4-6`, extractive→`claude-haiku-4-5`.
- The **`openrouter`** variant rides `opencode_local` via OpenCode's native OpenRouter provider (`OPENROUTER_API_KEY`); lanes pin OpenRouter model IDs (e.g. `openrouter/anthropic/claude-opus-4.7`, `…/claude-sonnet-4.6`, `…/claude-haiku-4.5`). It has a `per_agent: {}` hook for per-agent overrides.
- Subscription adapters (`codex`, `claude`) are **flat-cost** (no per-token metering); OpenRouter is **metered** (real per-token cost data).

### 3.4 Paperclip budgets (existing — verified)
- `budgetMonthlyCents` exists on **both** companies and agents; `budgetService(db).upsertPolicy(...)` enforces it (`paperclip/server/src/routes/companies.ts`, `paperclip/server/src/routes/agents.ts`). Per-company and per-agent ceilings are real.

### 3.5 Paperclip REST client patterns (existing — reuse)
- `mcp-servers/firm-facade/` + `gate-proxy/` paperclip-client patterns: create matter, get matter status, list/fetch work products. The firm-facade 5-noun allowlist (`create_matter`, `get_matter_status`, `list_work_products`, `fetch_work_product`, `request_approval`) is the read/create surface to reuse.

---

## 4. Harvey LAB facts (spike S1 — RESOLVED)

Verified against a fresh clone of `github.com/harveyai/harvey-labs` (2026-06-27):

- **License: MIT.** Real committed files (not LFS pointers, not placeholders).
- **1,749 tasks** across **25 practice areas** (the practice areas map ~1:1 onto the PossibLaw org chart: antitrust, banking-finance, bankruptcy-restructuring, capital-markets, contracts, corporate-governance, corporate-ma, data-privacy, employment-labor, energy/environmental, healthcare, immigration, insurance, IP, trade/sanctions, litigation, real-estate, tax, trusts-estates, white-collar, funds, emerging-companies/VC, structured-finance, arbitration).
- **Task layout:** `tasks/<practice-area>/<task>/[<scenario>]/` containing `task.json` + `documents/`.
- **`task.json` schema:** `title`, `work_type` (`analyze` | `draft` | `review` | `research`), `tags[]`, `instructions`, `deliverables` (map: expected output filename → canonical name), `criteria[]` (each: `id`, `title`, `match_criteria` (semantic PASS/FAIL text), `deliverables[]`, optional `sources[]`, optional `evaluation_options`).
- **Documents:** real binary files — `.docx` (~10k), `.eml` (~2.1k), `.xlsx` (~1.8k), `.pptx`, a few `.txt`/`.json`.
- **Scoring is DECOUPLED from execution** (the linchpin). `evaluation/run_eval.py`:
  - `evaluate_run(run_id, task, judge, parallel)` loads the rubric from `tasks/<task>/task.json` and reads the agent's **output files from `results/<run-id>/`** (the `run_dir`), via `score_rubric(criteria, run_dir, judge, ...)`.
  - CLI: `uv run python -m evaluation.run_eval --run-id <id> --task <practice-area/task-slug> --judge-model claude-sonnet-4-6`.
  - Optional `results/<run-id>/metrics.json` carries cost + doc-coverage.
- **Judge:** LLM judge, **default `claude-sonnet-4-6`**, semantic PASS/FAIL per criterion (prompt at `evaluation/prompts/rubric_criterion.txt`), **all-pass → 1.0, else 0.0**. No golden file; `match_criteria` is the standard.
- **Doc parsers shipped:** `sandbox/parsers/parse_doc.py` (binary → text) — reusable for extracting documents into the issue bank.

**Implication:** our app produces a deliverable → we write it to `harvey-lab/results/<run-id>/<deliverable-filename>` (+ `metrics.json`) → we shell out to Harvey's `run_eval` → their judge scores it. We never touch their agent loop. This is the cleanest possible "we ran Harvey's benchmark with our app as the agent."

---

## 5. Architecture

### 5.1 Package split (clean boundary)
Two packages, by determinism:
- **`eval-harness/` (existing)** owns deterministic **case-loading + grading**. The LAB adapter fills the **existing** `eval-harness/src/adapters/lab.ts` stub and registers `lab` in `eval-harness/src/benchmarks.ts` — alongside CUAD, where dataset adapters already live.
- **`orchestration-eval/` (new standalone TS package)** owns the **flaky, live-paperclip** parts — the execution runner, the Harvey-judge bridge, and the matrix/A-B report + CLI. It mirrors the `eval-harness/`/`gate-proxy/`/`mcp-servers/firm-facade/` idiom (`node:test`, `tsc`, `bin/`) and depends on `eval-harness` for case-loading. Isolating it keeps the non-deterministic runner out of the deterministic harness.

### 5.2 Harvey LAB vendoring — pinned git submodule
Pin Harvey LAB as a git submodule **`harvey-lab/`** (exactly like `paperclip/`: pinned SHA, never modified, layer-not-fork). This gives their tasks, parsers (`sandbox/parsers/`), and judge (`evaluation/`) **unmodified** at a reproducible commit. Our repo adds only a **curated task manifest** at **`layer/evals/datasets/lab/lab-manifest.yaml`** (consistent with the existing `layer/evals/datasets/cuad/` dataset location) — a vetted list of task paths we run (the single-issue-fit subset), plus per-task notes and the full excluded list with reasons. Our curation is a pointer list; we never copy or alter Harvey's data.

*(Alternative considered: copy a subset of tasks + judge into `layer/evals/datasets/lab/`. Rejected — copying weakens the "unmodified, real Harvey" claim and drifts from upstream.)*

### 5.3 Components

1. **LAB adapter** (fills the existing `eval-harness/src/adapters/lab.ts` stub; register `lab` in `eval-harness/src/benchmarks.ts`).
   - Reads `layer/evals/datasets/lab/lab-manifest.yaml`, resolves each entry's `harvey-lab/tasks/<path>/task.json` → `Case` (`instructions→input_brief`; `criteria→grading.rubric{ judge_model:'claude-sonnet-4-6', pass_rule:'all', criteria[] }`; `deliverables`+`work_type`+`sources`+task-path→`metadata`).
   - This alone makes LAB tasks loadable/listable (`--list` shows `lab`).

2. **Document extractor** (`orchestration-eval/src/extract.ts`).
   - For a task's `documents/` (.docx/.xlsx/.eml/.pptx), shell out to Harvey's own `sandbox/parsers/parse_doc.py` → text, to attach to the issue. Reusing their parser keeps doc-handling faithful and avoids re-implementing format parsers.

3. **Paperclip execution runner** (`orchestration-eval/src/runner.ts` — the real lift).
   - Given a `Case` + a disposable instance + a model-config (lane-map) + an arm:
     - Create a disposable matter issue carrying the instructions + extracted documents in the issue bank.
     - **Arm A:** assign one capable agent, one shot, decomposition suppressed (mechanism: spike S4).
     - **Arm B:** chief-of-staff → decompose (child issues) → specialists → reconciler → review.
     - Poll to completion (spike S2); extract the final reconstituted deliverable (spike S3).
   - Built on the firm-facade/gate-proxy paperclip-client patterns. Company-scoped, disposable instance, **never port 3100**.

4. **Harvey-judge bridge** (`orchestration-eval/src/judge.ts`).
   - Write each run's deliverable to `harvey-lab/results/<run-id>/<deliverable-filename>` (+ a `metrics.json` with our measured spend/wall-clock), then shell out to `evaluation.run_eval --run-id <id> --task <path> --judge-model claude-sonnet-4-6`. Parse per-criterion verdicts + all-pass back.

5. **A/B + matrix harness + report** (`orchestration-eval/bin/orchestration-eval`).
   - Drive the **run matrix**: `{ tasks } × { arms } × { model-configs } × { K runs }`. Collect all-pass rate + spend **per cell**; aggregate per task and overall, with run count + variance. Headline output: Arm B vs Arm A all-pass rate **and** spend, per model-config.

### 5.4 Data flow (one task, one cell)
```
manifest entry → load task.json (Case) → extract documents/ → text
  → [disposable paperclip, model-config = lane-map] create matter issue (instructions + docs)
      ├─ Arm A: assign one capable agent, one shot ─────────► deliverable_A
      └─ Arm B: chief-of-staff decomposes → specialists
                 → reconciler → risk-spotter/debate-judge ──► deliverable_B
  → write deliverable_{A,B} → harvey-lab/results/<run-id>/
  → Harvey run_eval (claude-sonnet-4-6, all-pass) → per-criterion verdicts
  → repeat K times → aggregate all-pass rate + spend per cell → report
```

---

## 6. The two experiments + run matrix

The runner generalizes "two arms" into a configurable matrix of `(arm × model-config)`. The **model configuration is a named, parameterized lane-map** (which model each of the 5 lanes uses), selected with `--config <name>`. Two experiments fall out:

### Experiment 1 — the thesis (run FIRST, on subscription SOTA)
- Arm A monolithic vs Arm B orchestrated, **both at full SOTA**, on the **Codex / Claude subscription adapters** (flat-cost → strongest-model quality answer without per-token spend).
- Output: the headline "does decomposition beat one-shot on the Harvey rubric" number, over K runs with variance.

### Experiment 2 — the cost frontier (run SECOND, on OpenRouter metered)
- Hold Arm B orchestrated; **start all-SOTA, then progressively route cheaper models down the lanes** in order `extractive` → `review` → `routing` → (last) `primary`/`drafting`. Measure all-pass rate at each step.
- **GLM 5.2** is the lead drop-in candidate for the expensive lanes. **`UNCONFIRMED`:** the assertion "GLM 5.2 ≈ Opus/GPT-5.5"; spike S9 verifies the exact OpenRouter model ID and catalog availability before relying on it.
- Output: the quality/cost frontier — how cheap each lane can go before the rubric degrades.

### Named lane-maps (defined + verified in spike S9)
- `sota-subscription` — full SOTA on `codex` / `claude` subscription (Experiment 1).
- `sota-openrouter` — full SOTA on OpenRouter (metered baseline for Experiment 2).
- 2–3 **cost-tuned** maps (e.g. `cost-extractive-cheap`, `cost-review-cheap`, `cost-glm-primary`) — the first sweep points.

### Budgets as probe + backstop
- Per-company + per-agent `budgetMonthlyCents` set on the disposable instance: a runaway Arm B physically cannot exceed the ceiling (belt-and-suspenders with the harness `--budget`).
- As a **probe**: tighten a lane's budget to find quality-critical agents (starving them tanks the rubric) vs. cheap-tolerant ones.

---

## 7. Validity controls

### 7.1 Internal validity (fair A/B)
- Both arms get the **identical** task, extracted documents, rubric, and judge, on the same disposable instance and same model-config. Only execution mode differs.
- **Arm A is not a strawman.** The monolithic baseline is the *strongest* single-agent one-shot (relevant practice lead or chief-counsel) with all the same documents — never a deliberately weak agent. Documented as such.
- **Same judge, same prompt, both arms.** Harvey's judge is itself non-deterministic; applied identically to both arms; we keep their default (single grade per criterion) to stay faithful.
- **Clean attribution mode:** a `same-model` control (both arms on one strong model) isolates the pure orchestration effect on quality, with no cost/routing confound, alongside the product-mode comparison.

### 7.2 External validity (anti-gaming)
- Tasks, rubric, and judge are Harvey's, **unmodified**, at a pinned submodule SHA — we cannot tilt them.
- The only selection lever is **which tasks are in the manifest**, and that is the real gaming risk. Guardrails:
  - Inclusion rule is **purely structural** — "does this fit a single parent issue?" — never "does orchestration look good here?"
  - The manifest is **pre-registered** (committed before runs) and ships with the **full excluded list + reason per task**, so cherry-picking is visible.
  - Curation done blind to results.

### 7.3 Non-determinism
- Agent output varies run-to-run; a single A/B run proves nothing. Each cell runs **K times** (default K=3). Report the **all-pass rate** (share of K runs that fully pass) + spread, per task and aggregate. K is stated in every report.

---

## 8. Cost & budgets

- Arm B spawns many agent calls per run; the judge fires ~`(criteria count) × K × arms × configs × N tasks` times against `claude-sonnet-4-6`. This is real money.
- v1 defaults small and gated: `--limit N` (default ~10–15 single-issue tasks), `--runs K` (default 3), `--config <lane-map>`, `--budget` ceiling. Spend logged per cell.
- Experiment 1 on subscription adapters keeps the SOTA quality baseline cheap (flat-cost). Experiment 2's metered runs are explicitly scoped to 2–3 sweep points in v1.

---

## 9. Scope & honest limitations

- v1 covers the **curated single-parent-issue subset only**. Long-horizon, multi-step-sandbox LAB tasks are **SKIPPED with a logged reason** — never silently mis-run as a one-issue task (inflated coverage is forbidden).
- We say "**a curated subset of Harvey LAB (N tasks)**," never "we ran Harvey LAB."
- **Deliverable-format fidelity:** if we emit a text/markdown deliverable rather than a native `.docx`, that is documented as a judge-fidelity caveat (spike S7 confirms whether Harvey's `score_rubric` grades a text file with the matching basename or requires `.docx`).
- The cost frontier (Experiment 2) is **per-token metered only on OpenRouter**; subscription-adapter runs report quality, not per-token cost.
- Non-determinism is averaged over K and reported with variance; a small K is itself a limitation, stated.

---

## 10. Spikes (resolve before / at implementation start; mirror Phase-0/3 discipline; each cited `file:line` against the pinned submodules)

- **S1 — LAB data shape + license. RESOLVED** (§4): full MIT dataset, schema confirmed, scoring decoupled from execution.
- **S2 — orchestration done-detection.** How the runner knows an orchestrated matter finished (issue status → `done`/`in_review`; reuse the Phase-3 mapping of `GET /issues/:id` → `status` + `workProducts[]` + `documentSummaries[]`).
- **S3 — extract the final reconciled draft.** Where the reconstituted output lives (reconciler's document/work product on the parent issue; reuse the Phase-3 read path).
- **S4 — force the monolithic Arm A.** How paperclip runs one agent one-shot with **no** child-issue decomposition (single-shot assignment vs the orchestrated `requestDepth`/child-issue path). **Key unknown.**
- **S5 — single-issue fit + first manifest cut.** The structural inclusion rule; produce the first curated manifest + the excluded list with reasons.
- **S6 — runner auth + disposable instance.** Create/assign/await/read via REST on a disposable instance (company-scoped, never port 3100); reuse firm-facade/gate-proxy client patterns.
- **S7 — deliverable format.** Confirm Harvey's `score_rubric`/judge grades a text/markdown output file with the matching deliverable basename, or whether a native `.docx` is required.
- **S8 — parser standalone.** Confirm `sandbox/parsers/parse_doc.py` runs standalone on a single file via `uv` (deps installable).
- **S9 — cost-routing.** Define the named lane-maps (SOTA-subscription, SOTA-openrouter, 2–3 cost-tuned incl. a GLM-5.2 swap); verify each model ID resolves in the live OpenRouter catalog; confirm the runner sets per-company + per-agent `budgetMonthlyCents` and reads back per-run spend per cell.

**Spike exit:** every endpoint cited with `file:line`; the Arm-A monolithic mechanism confirmed; the first manifest + excluded list committed; the lane-maps verified against the live catalog.

---

## 11. Build units (TDD, subagent-driven)

- **U1 — LAB adapter + manifest** (fill `eval-harness/src/adapters/lab.ts` + `layer/evals/datasets/lab/lab-manifest.yaml` + register `lab` in `eval-harness/src/benchmarks.ts`). Map vendored LAB tasks → `Case[]`. Tests: loads manifest tasks, shapes valid, rubric criteria present, `--list` shows `lab`. Offline, against one **tiny fixture task dir** (the only synthetic artifact in the whole build — so unit tests don't depend on heavy real docs). *Makes single-agent LAB loadable.*
- **U2 — document extractor** (`extract.ts`). Shell out to `parse_doc.py`. Tests: golden text from a small fixture doc (real shell-out or mocked); handles each format or logs a skip.
- **U3 — paperclip execution runner** (`runner.ts`). Both arms, given a Case + config + disposable client. Zero-network unit tests with an **injected fake paperclip-client** (asserts it writes `results/<run-id>/<deliverable>`, suppresses decomposition for Arm A, drives child issues for Arm B). Gated **live e2e** on a disposable instance.
- **U4 — Harvey-judge bridge** (`judge.ts`). Build the `run_eval` invocation + parse results. Unit test against a captured sample result; a live judge call behind an opt-in flag (needs API key).
- **U5 — A/B + matrix harness + report** (`bin/orchestration-eval` + `report.ts`). Drive the matrix; aggregate all-pass rate + spend per cell; deterministic aggregation test over canned per-run verdicts. `--limit`, `--runs`, `--config`, `--budget` flags.
- **U6 — docs + honest scope.** Operator walkthrough ("measure the thesis"), known-limitations (subset only, non-determinism averaged, single-parent-issue only, deliverable-format caveat, cost metered only on OpenRouter), CHANGELOG, and update the eval-harness design spec §13 from "future" to "shipped (subset)". Add operator setup to `docs/operator-test-checklist.md` (submodule init, `uv`/parser deps, judge API key, OpenRouter key).

---

## 12. Evals / acceptance (Given/When/Then)

- **HAPPY:** Given a vendored LAB task in the manifest; When `orchestration-eval run --limit 1 --config sota-subscription` runs Arm A (single agent); Then a graded report is produced via **Harvey's judge** with the all-pass rubric. (Baseline works end-to-end.)
- **THESIS:** Given the same task; When the A/B mode runs both arms over K runs; Then a report shows Arm A vs Arm B all-pass rates with a clear delta + variance + per-arm spend. (The measurement works — whatever the sign.)
- **COST-FRONTIER:** Given Arm B orchestrated; When a cost-tuned config (e.g. a GLM-5.2 lane swap) runs on OpenRouter; Then the report shows the all-pass-rate and metered-spend delta vs the SOTA-openrouter baseline. (The frontier capability works.)
- **FAILURE/HONESTY:** Given a LAB task that needs multi-turn document-sandbox state beyond a single parent issue; Then it is **SKIPPED with a logged reason**, not silently mis-run (no inflated coverage).
- **BUDGET-SAFETY:** Given a per-company `budgetMonthlyCents` ceiling on the disposable instance; When Arm B would exceed it; Then the run is capped, not allowed to overspend.

---

## 13. Risks

- **The runner is the real lift.** Awaiting async multi-agent completion + extracting the reconciled draft against a live paperclip instance is the hard, flaky part. Build it last, behind solid spike receipts (S2–S6). Isolate non-determinism (K runs, report variance).
- **Non-determinism.** A single run proves nothing; average over K, report spread, or the "number" is noise.
- **Overclaim.** Only a curated subset; say so. Tasks that don't fit the single-parent-issue model are out of v1, documented in the excluded list.
- **Arm A strawman risk.** If the monolithic baseline is artificially weak, the thesis is meaningless — baseline is the strongest single-agent one-shot, documented.
- **Cost.** Orchestrated runs + per-criterion judging multiply fast; gate on `--limit`/`--runs`/`--budget` + paperclip budgets; default small.
- **Cross-language boundary.** TS runner shelling to Harvey's Python (parser + judge) — keep the boundary thin and well-tested; pin the submodule SHA; document `uv`/deps in the operator checklist.
- **Model-catalog drift.** OpenRouter model IDs (incl. GLM 5.2) change; the launcher already preflights OpenRouter IDs — reuse that, and treat GLM-5.2 availability/quality as `UNCONFIRMED` until S9.

---

## 14. Open questions / UNCONFIRMED

- **GLM 5.2 ≈ Opus/GPT-5.5** (operator assertion) — verify model quality claim empirically via Experiment 2; verify the OpenRouter model ID + catalog availability in S9.
- **Deliverable format** (S7) — text vs native `.docx` for the judge.
- **Arm-A suppression mechanism** (S4) — exact paperclip flag/path for one-shot, no-decomposition.
- **Per-run spend readback** (S9) — confirm paperclip exposes per-run/per-agent spend granularly enough for the per-cell cost report.

---

## 15. Self-review (design-time)

Reuses the built seams (benchmarks registry, all-pass rubric, the Phase-3 paperclip-client + issue/document read endpoints, the variants.yaml lane-map, paperclip budgets). The genuinely new work is the LAB adapter (mechanical, mirrors CUAD), the **paperclip orchestration runner** (the lift, spike-gated), the **Harvey-judge bridge** (thin shell-out — scoring is decoupled), and the **matrix/cost-routing report**. The thesis A/B is the point; the headline is a defensible quality-and-cost number on data we did not author. UNCONFIRMEDs are corralled into S4/S7/S9 and §14. Layer-not-fork holds: Harvey LAB and paperclip are pinned submodules, never modified.
