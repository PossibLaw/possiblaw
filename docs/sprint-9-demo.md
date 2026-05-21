# Sprint 9 Demo — Eval Suite

This document walks through the Sprint 9 eval harness end-to-end.

---

## Prerequisites

```bash
pnpm install
pnpm build
```

---

## Step 1 — List available datasets

```bash
node dist/cli/index.js eval list-datasets
```

Expected output:

```
DATASET          STATUS       SOURCE
----------------------------------------------------------------------
cuad             fixture      HF theatticusproject/cuad-qa  [CC BY 4.0]
maud             not cached   HF theatticusproject/maud  [CC BY 4.0]
acord            not cached   Synthetic (ACORD schema)  [Research only]
unfair-tos       not cached   HF lex_glue/unfair_tos  [CC BY 4.0]
ledgar           not cached   HF lex_glue/ledgar  [CC BY 4.0]
```

CUAD shows `fixture` because 3 bundled samples ship in-tree. Other datasets show `not cached` until fetched.

---

## Step 2 — Dry-run (no API key required)

Confirms the dataset is parseable and the adapter produces sensible prompts. No LLM calls.

```bash
node dist/cli/index.js eval --dataset cuad --workflow quick-counsel --sample-size 3 --dry-run
```

Expected output:

```
Dataset:     cuad
Workflow:    quick-counsel
Sample size: 3
Budget:      $50.00
Output:      layer/evals/results
Dry run:     yes

Results (3 samples):
  Mean score:  1.0000
  Median:      1.0000
  Std dev:     0.0000
  Total cost:  $0.0000
  Budget abort: no

Reports written to: layer/evals/results
```

The dry-run uses gold labels as stub predictions (so score = 1.0 by construction). This verifies the harness pipeline but does not test LLM quality.

---

## Step 3 — Offline fixture eval (no API key, real pipeline)

Runs the actual workflow pipeline using the bundled 3-sample CUAD fixture and the offline stub agent (deterministic output from Sprint 2).

```bash
env -u ANTHROPIC_API_KEY node dist/cli/index.js eval --dataset cuad --workflow quick-counsel --sample-size 3
```

Expected output:

```
[offline mode — ANTHROPIC_API_KEY not set; using deterministic fixtures + stub pipeline]

Dataset:     cuad
Workflow:    quick-counsel
Sample size: 3
Budget:      $50.00
Output:      layer/evals/results
Dry run:     no

Results (3 samples):
  Mean score:  ~0.01  (offline stub output does not match gold spans)
  Total cost:  $0.0000
  Budget abort: no
```

Low scores are expected in offline mode because the pipeline returns generic deterministic output, not real clause-extraction responses. Cost is always $0 offline.

Two report files are written:
- `layer/evals/results/cuad--quick-counsel--<timestamp>.json`
- `layer/evals/results/cuad--quick-counsel--<timestamp>.md`

---

## Step 4 — Fetch a dataset (requires internet, no API key)

Downloads samples from HuggingFace and caches them locally.

```bash
node dist/cli/index.js eval fetch cuad --limit 20
```

After this, `eval list-datasets` shows `cuad` as `cached`.

---

## Step 5 — Real eval run (requires ANTHROPIC_API_KEY)

```bash
ANTHROPIC_API_KEY=sk-ant-... node dist/cli/index.js eval \
  --dataset cuad \
  --workflow quick-counsel \
  --sample-size 20 \
  --budget 5
```

The budget flag caps spending at $5 for this run (95% threshold = $4.75). When the threshold is reached, the run aborts gracefully and exits with code 2.

---

## Step 6 — Deep-review eval (full workflow)

```bash
ANTHROPIC_API_KEY=sk-ant-... node dist/cli/index.js eval \
  --dataset cuad \
  --workflow deep-review \
  --sample-size 20 \
  --budget 10
```

---

## Report format

### JSON (`<dataset>--<workflow>--<timestamp>.json`)

Full `EvalReport` object with per-sample results, aggregate stats, confusion matrix (for classification tasks), and top failures.

### Markdown (`<dataset>--<workflow>--<timestamp>.md`)

Human-readable report with:
- Summary table (dataset, workflow, model mix, sample size, mean score, cost, date)
- Top failures (lowest-scoring samples with gold vs. predicted)
- Confusion matrix (classification tasks only)
- Per-sample result table

---

## Exit codes

| Code | Meaning |
|---|---|
| 0 | Eval completed successfully |
| 1 | Error (dataset not found, workflow not found, pipeline error) |
| 2 | Budget threshold reached — partial results written |
