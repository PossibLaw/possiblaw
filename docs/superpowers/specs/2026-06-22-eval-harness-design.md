# PossibLaw Eval Harness — Design Spec

- **Date:** 2026-06-22
- **Status:** Approved design (pre-implementation)
- **Author:** brainstorming session (Claude Code)
- **Scope:** A terminal-runnable evaluation harness for PossibLaw agents and skills, plus the three
  finishing items (citation-gate enforcement, repo hygiene, doc drift) that ship alongside it on
  branch `feat/eval-harness` and merge to `main` together.

---

## 1. Context

PossibLaw is a layer on the paperclip control plane: 175 agents / 171 skills, organized by practice
area, that produce legal and business work product. Models are swapped per lane via ten variants in
`companies/legal-operations/variants.yaml`.

Three eval-related assets already exist but do not form a working pipeline:

1. **A designed-but-unbuilt in-paperclip convention** (`companies/legal-operations/evals/README.md`):
   `routine → eval-runner skill → target agent → eval-judge agent → eval-results project`. The case
   file format (`slug`, `target`, `input_brief`, `rubric`) is specced; nothing is built.
2. **Orphaned benchmark assets** (`layer/evals/`): legal-NLP datasets (CUAD, MAUD, LEDGAR, ACORD,
   UnfairToS) with `fixtures.jsonl`, plus old result reports (deterministic 0–1 scoring, model mix,
   budget tracking) produced by the **TypeScript CLI runner removed in 0.4.0**. The runner is gone;
   datasets and the report format remain.
3. **The methodology doc** (`docs/workflows/evals.md`): deterministic checks first, LLM-judge only
   for interpretation; happy / edge / failure coverage.

**External target:** the operator wants the harness to eventually run against
[Harvey LAB](https://github.com/harveyai/harvey-labs) (MIT) — 1,200+ tasks across 24 practice areas,
75,000+ expert rubric criteria, graded **all-pass** (every rubric criterion must pass; no partial
credit) plus LLM-judge. Each LAB task = instruction + client matter (documents) + a work-product
requirement. This maps closely onto PossibLaw's structure and dictates two design requirements: a
**benchmark-adapter interface** and **all-pass rubric grading**.

## 2. Goal

A CLI harness that scores a single agent's or skill's output against per-target cases, swaps models
via `variants.yaml`, and writes a comparable report — so the operator can iterate on prompts and
models and A/B the results.

```
$ ./bin/eval run --agent nda-drafter --variant claude
  nda-drafter  (3 cases, lane=drafting → claude_local/sonnet)
  governing-law-delaware   PASS  1.00  (regex)
  term-two-years           PASS  1.00  (regex)
  mutual-symmetry          FAIL  0.40  (llm-judge)
  agent score: 0.80   cost $0.012   12.4s
  report → eval-harness/results/nda-drafter--claude--<ts>.md
$ ./bin/eval compare <runA> <runB>     # prompt/model A/B view
```

## 3. Scope

### In scope (v1)
- Single-shot agent/skill output → graded → report.
- All **ten** variants, via a 4-driver model-client (see §6).
- Deterministic grading (regex / contains / golden / schema) and rubric grading (all-pass +
  LLM-judge).
- `local` case adapter (markdown cases) + one `benchmark` adapter (`cuad`, reusing existing
  fixtures) to prove the adapter interface on real data.
- A seed set of ~6–10 cases mixing both grading modes.
- A generated coverage tracker over all 175 agents + 171 skills.

### Out of scope (v1, by design, not blocked)
- Full multi-agent paperclip orchestration (routing + gates). The harness runs a single lane turn,
  not the whole pipeline.
- Long-horizon LAB tasks needing a document sandbox. The `lab` adapter is defined as an interface +
  stub so it drops in later without reworking the case schema or runner.
- The in-paperclip `eval-judge` path (the heavy, production-fidelity loop). Cases are authored in a
  format that the future judge can also consume, so nothing is thrown away.

## 4. Architecture

A standalone TypeScript component, **`eval-harness/`**, sibling to `gate-proxy/`, on the same stack
(`tsx` runner, `node:test`). It never modifies the paperclip submodule and does not import paperclip
internals; it sources config from `variants.yaml` and invokes models the same way paperclip's
adapters do in headless mode (consistent with gate-proxy's decoupled, config-over-the-wire posture).

```
eval-harness/
  src/
    cases/        case-file parser + Case type                (local adapter)
    adapters/     benchmark adapters → Case[]                 (cuad now, lab stub)
    model-client/ 4 drivers: claude | codex | gemini | opencode
    grade/        deterministic graders + rubric/LLM-judge
    report/       md + json writer (reuses old report format)
    variants.ts   parse variants.yaml; resolve lane → adapterType + model config
    runner.ts     orchestrates: resolve → invoke → grade → report
    coverage.ts   generate COVERAGE.md from agent/skill catalog
    index.ts      CLI entry (run | list | compare | report | coverage)
  tests/          node:test, mock model-client (no live model calls)
  results/        run outputs (gitignored)
bin/eval          bash shim → tsx eval-harness/src/index.ts
companies/legal-operations/evals/cases/<slug>.md   case files (package-local)
```

Cases live **inside the package** (`companies/legal-operations/evals/`) so they travel with the
company and the future in-paperclip judge can read them. Runner code lives **outside** the package
(`eval-harness/`) because the package is markdown-for-paperclip-import, not code.

### Components
1. **Case files** — one or more per target; schema in §5.
2. **Benchmark adapters** — `adapters/<name>.ts` convert an external dataset → `Case[]`. v1 ships
   `cuad` (reads `layer/evals/datasets/cuad/fixtures.jsonl`). `lab` is an interface + stub.
3. **Runner** — resolves `target → modelLane → variants.yaml → adapterType + model` for the chosen
   `--variant`, calls the model-client, runs the grader, writes the report.
4. **model-client** — 4 drivers covering all 10 variants (§6).
5. **CLI** — `./bin/eval` with `run | list | compare | report | coverage`.
6. **Coverage tracker** — generated `companies/legal-operations/evals/COVERAGE.md` listing every
   agent + skill with case status (`seed` vs `TODO`).
7. **Seed cases** — §8.

## 5. Case file schema

`companies/legal-operations/evals/cases/<slug>.md`, extending the already-specced format:

```yaml
---
slug: nda-mutual-baseline
target: nda-drafter            # agent or skill slug under test
targetType: agent              # agent | skill
project: nda-matters           # for the future in-paperclip judge path
lane: drafting                 # optional; defaults to target's metadata.possiblaw.modelLane
input_brief: |
  Draft a mutual NDA between ACME Inc. and Globex Corp., Delaware law, two-year term.
documents: []                  # optional fixture paths (matter materials)
grading:
  mode: deterministic          # deterministic | rubric
  checks:                      # when mode=deterministic
    - id: governing-law-delaware
      type: regex              # regex | contains | golden | schema
      pattern: "(?i)laws of the State of Delaware"
    - id: term-two-years
      type: contains
      value: "two (2) year"
  rubric:                      # when mode=rubric (all-pass; LAB-compatible)
    judge_model: claude_local  # which lane/driver judges
    pass_rule: all             # all = every criterion must pass (LAB all-pass)
    criteria:
      - id: mutual-symmetry
        prompt: "Are both parties bound symmetrically?"
source: { kind: local }        # local | benchmark:<name> | external:lab/<task-id>
metadata:
  possiblaw: { priority: high, introduced: 2026-06-22 }
---
Optional free-text: expected output, known traps, source references.
```

- `mode: deterministic` runs `checks` in-process (no model call for grading).
- `mode: rubric` runs each criterion through the judge model; `pass_rule: all` enforces all-pass.
- The runner reads the **target's** `metadata.possiblaw.modelLane` from its `.paperclip.yaml` /
  agent frontmatter when `lane` is omitted.

## 6. Model-client / variant integration

The ten variants are paperclip adapter configs that collapse to **four adapter types**:

| Adapter type | Variants | Headless invocation (mirrors paperclip) |
|---|---|---|
| `claude_local`   | claude, claude-api       | `claude --print --model <m>` |
| `codex_local`    | codex, codex-api         | `codex exec` (headless, sandbox bypass per config) |
| `gemini_local`   | gemini, gemini-api       | `gemini` headless |
| `opencode_local` | ollama, llamacpp, opencode, openrouter | OpenCode CLI / local HTTP |

- **Config comes entirely from `variants.yaml`** (already built): the runner resolves
  `variants[variant].default.adapterConfig` merged with `lanes[lane]` to get model + params, then
  dispatches to the driver for that `adapterType`.
- **Four drivers cover all ten variants.** No provider is dropped.
- The drivers re-implement only the thin headless-invocation slice paperclip's adapters use; they do
  **not** import paperclip packages (keeps the harness decoupled and the submodule untouched).
- **Graceful skip:** if a variant's underlying CLI is missing or unauthed, that run skips with a
  clear `lane <l> unavailable for variant <v>: <reason>` message and a non-failing exit, mirroring
  gate-proxy's fail-closed posture. "Covers all 10" is contingent on the relevant CLI being
  installed/authed — the same prerequisite as launching that variant via `bin/possiblaw`.

## 7. Grading

Per `docs/workflows/evals.md`: prefer deterministic; use LLM-judge only where interpretation is
required.

- **Deterministic** — `regex`, `contains`, `golden` (exact match vs. gold), `schema` (JSON shape).
  Score is per-check pass/fail aggregated to a 0–1 case score.
- **Rubric (all-pass)** — each criterion judged PASS/FAIL by `judge_model`; `pass_rule: all` ⇒ case
  passes only if every criterion passes (LAB semantics). Raw judge verdicts are recorded in the
  `.json` report for auditability. A judge prompt template lives in `grade/judge-prompt.ts`.
- **Self-judging guard:** when the judge model equals the model under test, the report flags it
  (`judge==subject`) so the operator can discount it.

## 8. Seed cases (~6–10)

Chosen to exercise both grading modes and reuse existing benchmark data:

| Case | Target | Mode | Notes |
|---|---|---|---|
| clause-extract-governing-law | clause-extractor (skill) | deterministic | CUAD-backed |
| clause-extract-termination   | clause-extractor (skill) | deterministic | CUAD-backed |
| quick-counsel-baseline       | quick-counsel (skill)    | rubric | reuse old workflow |
| nda-mutual-baseline          | nda-drafter (agent)      | deterministic + rubric | drafting lane |
| commercial-triage            | commercial-lead (agent)  | rubric | routing/judgment |
| litigation-issue-spot        | litigation-lead (agent)  | rubric | review lane |
| bd-outreach-draft            | bd-lead (agent)          | rubric | business function |
| finance-memo-sanity          | finance-lead (agent)     | deterministic | numeric/format checks |

## 9. Data flow

```
case file (or benchmark adapter)
  → Case
  → runner resolves target → lane → variants.yaml → adapterType + model
  → model-client driver runs the prompt (headless)
  → output
  → grader (deterministic | rubric all-pass + LLM-judge)
  → score
  → report (.md + .json) in eval-harness/results/
```

Report `.md` reuses the proven old format (`layer/evals/results/*.md`): header table (dataset/target,
variant, sample size, mean/median/stddev, total cost, budget, model mix), Top Failures, Per-sample
Results. `.json` carries the machine-readable per-case records + raw judge verdicts for `compare`.

## 10. Error handling

- Missing/unauthed model CLI → skip that variant with a clear message, non-failing exit.
- Malformed case file → fail that case with a parse error, continue the rest.
- `--budget $X` caps spend; abort over budget (like the old runner), report `budget aborted: yes`.
- Model call timeout → record as a failed case with `error: timeout`, continue.
- LLM-judge non-determinism → deterministic checks preferred; judge verdicts stored raw.

## 11. Testing (TDD)

`node:test` suite under `eval-harness/tests/`, run via `pnpm -C eval-harness test` (mirrors
gate-proxy). All model calls go through a **mock model-client** so the suite never burns real model
calls:

- Case parser: valid/invalid frontmatter, both grading modes, defaults (lane inference).
- Variant resolution: each of the 10 variants → correct adapterType + merged lane config from a
  fixture `variants.yaml`.
- Deterministic graders: regex / contains / golden / schema pass+fail.
- Rubric grader: all-pass semantics (one FAIL ⇒ case FAIL); judge==subject flag.
- Report writer: golden-file test against a fixed expected `.md`.
- CUAD adapter: fixtures.jsonl → Case[] shape.
- Graceful skip: missing-CLI path returns skip, not throw.

The harness's own tests are the first eval gate; a green suite + a `--dry-run` (resolve + parse, no
model call) is the pre-merge check, alongside the existing launcher dry-run and helper self-tests.

## 12. Relationship to finishing items 1–3 (same branch, one merge)

Independent workstreams on `feat/eval-harness`, merged to `main` together:

1. **Phase 2 citation-gate enforcement** — add the block in `gate-proxy/src/server.ts handleEgress`:
   when `boundary ∈ policy.citationGate.boundaries` and no payload-bound citation receipt is
   registered, block before the human gate is offered. TDD against `gate-proxy/tests`. Flip the
   README claim ("advisory → blocking") once enforced.
2. **Repo hygiene** — remove the stale nested `possiblaw/` clone and stray `.agents/`; extend
   `.gitignore` to cover `possiblaw/`, `.agents/`, `.pnpm-store/`; confirm the paperclip submodule
   is dirty only with build artifacts.
3. **Doc drift** — fix CLAUDE.md's dry-run command (now requires `--mission`); add `gate-proxy/` and
   `eval-harness/` to the Code Map; correct the gate-proxy test count.

## 13. Future milestones (post-v1, enabled by this design)

- **`lab` adapter** — map Harvey LAB `tasks/` → `Case[]`; all-pass rubric already supported.
  Long-horizon tasks need a document-sandbox runner (future).
- **In-paperclip judge path** — build `eval-runner` skill + `eval-judge` agent to run cases as real
  paperclip issues for production-fidelity (routing + gates). Same case files.
- **Coverage fill** — author the remaining per-agent/per-skill cases against `COVERAGE.md`.

## 14. Decisions resolved

- Execution model: **CLI harness** (fast iteration), not the heavy in-paperclip judge loop.
- Coverage: **seed set + benchmark-pluggable**, not full 346-case authoring now.
- Variants: **all ten in v1** via four drivers sourced from `variants.yaml`; not a "pick 2" subset.
- Grading: deterministic-first, **all-pass rubric** for agent tasks (LAB-compatible).
- Harness location: standalone `eval-harness/` (TS, sibling to `gate-proxy/`), submodule untouched.
