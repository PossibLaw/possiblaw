# Benchmark plan

Which legal benchmarks we run, which we cannot, and — the part that matters —
**what each one actually measures about PossibLaw.**

Status checked 2026-07-27 against `eval-harness/src/benchmarks.ts` and
`layer/evals/datasets/`.

---

## Read this before running anything

**Most legal benchmarks score the model, not the harness.**

The spine metaphor in `docs/outreach/agentic-os-stack.md` is *the model is the
associate, the harness is the firm.* LegalBench, CUAD, LEDGAR, MAUD and
UNFAIR-ToS are almost entirely **single-shot tasks**: one prompt in, one label or
span out. They measure how good the associate is. Swap in a better model and the
score moves; swap in PossibLaw's gate, receipts, citation check, deadline engine
and matter access, and the score **does not move at all**.

That is not a reason to skip them. A firm asking "is this any good at contract
review" deserves a number, and we should have one. But running 162 LegalBench
tasks and reporting a headline figure would be measuring somebody else's product.

**The eval that tests our actual thesis is the orchestration A/B**
(`orchestration-eval/`, Harvey LAB, Arm A monolithic vs Arm B decomposed). That
is the one that answers "does agentic decomposition beat a single agent." Budget
accordingly: the benchmarks below are table stakes; the A/B is the claim.

A second thing only *our* harness can be measured on, which no public benchmark
covers: **did the controls fire?** For any benchmark run through a live
instance, the receipt chain is itself a result — how many egress attempts were
gated, how many citations were unbacked, how many matter-access denials fired.
Nobody else can report that. It is worth a column.

---

## Status

| Benchmark | Task shape | State | Licence |
|---|---|---|---|
| **CUAD** | contract clause extraction (41 categories) | ✅ **runnable today** | CC BY 4.0 |
| **Harvey LAB** | end-to-end legal work, own judge | ✅ runnable (`--benchmark lab`) | MIT |
| LEDGAR | topic classification, 100+ categories | ⚠ staged, **no adapter** | CC BY 4.0 |
| UNFAIR-ToS | binary clause classification, 8 categories | ⚠ staged, **no adapter** | CC BY 4.0 |
| MAUD | multiple-choice reading comprehension | ⚠ staged, **no adapter** | CC BY 4.0 |
| ACORD | structured field extraction | ⚠ staged, **no adapter** | ⚠ research/eval only |
| **LegalBench** | 162 tasks, mixed | ❌ not staged | ⚠ **per-task, varies** |
| **PrinzBench** | 33 legal-research + search questions | ❌ **cannot be self-run** | none published |

"Staged" means `layer/evals/datasets/<name>/` has a `fetch.ts` and
`METADATA.json`, but `eval-harness/src/benchmarks.ts` does not register it — so
`./bin/eval run --benchmark ledgar` fails. Only `cuad` and `lab` are registered.

---

## CUAD — already done

`./bin/eval run --benchmark cuad` works today. Adapter:
`eval-harness/src/adapters/cuad.ts`, fixtures at
`layer/evals/datasets/cuad/fixtures.jsonl`.

Nothing to build. If you want a CUAD number, run it.

---

## LegalBench — the one worth building

**162 tasks from 40 contributors** (Stanford HazyResearch / Neel Guha et al.),
covering contract analysis, privacy policies, statutory interpretation and case
law reasoning. Data: HuggingFace `nguha/legalbench`; prompts in the
`HazyResearch/legalbench` GitHub repo.

**Two things to get right before writing code:**

1. **Licensing is per-task, not per-benchmark.** LegalBench aggregates existing
   corpora — including CUAD and MAUD, both of which we already stage separately.
   There is no single licence covering all 162. Check the constituent licence
   for every task we adopt, and record it. Do not put "CC BY 4.0" on the whole
   thing because most of it is.
2. **It overlaps what we already have.** Adopting LegalBench wholesale would
   duplicate our CUAD and MAUD staging. Decide deliberately whether LegalBench
   *replaces* those or sits alongside them; two adapters scoring the same corpus
   differently is a reporting trap.

**Recommended scope: a curated subset, not all 162.** The value is coverage
across task *types*, not task count, and 162 tasks × N variants is a real spend.
Pick ~15–20 spanning issue-spotting, rule-application, rule-conclusion,
interpretation and rhetoric, and say plainly in any published number that it is
a named subset. A subset honestly labelled beats a full run nobody can afford to
repeat.

---

## PrinzBench — we cannot run this, and should stop planning to

**The questions are held out permanently.** The README states they "have never
been — nor will they ever be — shared with any other person." The repo
(`prinz-ai/prinzbench`, 126 stars, updated 2026-07-18) contains **only**
`README.md`, `archive/` and `assets/` — no question data, and **no licence
file**.

Format, for reference: 33 questions (25 legal research + 8 search), three
attempts each, graded pass@1, max 99 points, with Legal Research (75) and Search
(24) sub-scores.

**What this means:** PrinzBench is a leaderboard someone else runs, not a
benchmark we can execute. Holding the questions back is defensible — it is what
makes the numbers contamination-proof — but it means we cannot self-report.

**Options, in order of honesty:**

1. **Ask Prinz AI to evaluate a PossibLaw instance.** This is the only way to
   get a real number. It also happens to suit us: PrinzBench rewards *research
   and retrieval of obscure public information*, which is closer to what a
   harness with a real data layer does than a single-shot classification task.
2. **Cite their published results as third-party context** for the models we
   route to, clearly attributed, never as a PossibLaw score.
3. **Do not** reconstruct "PrinzBench-style" questions and report the result as
   a PrinzBench score. That is the number-inflation move the gap register exists
   to prevent.

---

## The four staged benchmarks

The loader is easy; **the grader is the work.** These are four different task
shapes, and they need three different scorers.

| Order | Benchmark | Why this order |
|---|---|---|
| 1 | **LEDGAR** + **UNFAIR-ToS** | Same grader — exact-match classification. Two benchmarks for one scorer. Cheapest real coverage. |
| 2 | **MAUD** | Multiple-choice; grader is close to the classification one but needs option handling. |
| 3 | **ACORD** | Field-level extraction scoring, and the licence needs care. |

Follow `eval-harness/src/adapters/cuad.ts` for the loader shape and add a
`BENCHMARKS` entry in `eval-harness/src/benchmarks.ts` — a dataset without a
registry entry is invisible to `./bin/eval`.

**ACORD licence constraint, do not lose this:** research and evaluation only.
ACORD forms are copyrighted by ACORD Corporation. Not redistributable, not for
commercial use without a licence from ACORD. The staged samples are
hand-curated synthetic ones that mirror public form structure. Any published
ACORD number must say so.

---

## Sequencing

Run benchmarks **against a working instance**, not before one. Ordering:

1. **Get an instance up and verified** — `docs/getting-to-a-working-instance.md`.
2. **CUAD** — already works; establishes the pipeline end to end.
3. **LEDGAR + UNFAIR-ToS** — one grader, two numbers.
4. **The orchestration A/B (Harvey LAB)** — the thesis test. Needs
   `ANTHROPIC_API_KEY`, `OPENROUTER_API_KEY`, `uv`, `pandoc`, and a disposable
   instance. This is the one that measures PossibLaw rather than the model.
5. **MAUD**, then **ACORD**.
6. **LegalBench curated subset**.
7. **PrinzBench** — only via a request to Prinz AI.

## What to report

For every run, record the **variant** (which model in which lane) alongside the
score. A benchmark number without the model behind it is not reproducible, and
the whole point of `variants.yaml` is that the model is swappable.

And where a run went through a live instance, report the **control counts** from
the receipt chain next to the accuracy number. That column is ours alone.
