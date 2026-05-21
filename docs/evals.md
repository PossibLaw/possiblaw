# PossibLaw Evals

This document covers the Sprint 9 evaluation suite: datasets, adapters, scorers, and the budget mechanism.

---

## Datasets

### CUAD (Contract Understanding Atticus Dataset)

| Field | Value |
|---|---|
| License | CC BY 4.0 |
| Source | HuggingFace `theatticusproject/cuad-qa` |
| Paper | Hendrycks et al. 2021 — https://arxiv.org/abs/2103.06268 |
| Task | Span extraction — identify 41 categories of legally important clauses |
| Offline | 3 bundled fixtures in `layer/evals/datasets/cuad/fixtures.jsonl` |

Citation:
```
@dataset{hendrycks2021cuad,
  title={CUAD: An Expert-Annotated NLP Dataset for Legal Contract Review},
  author={Hendrycks, Dan and Burns, Collin and Chen, Anya and Ball, Spencer},
  year={2021},
  publisher={The Atticus Project}
}
```

### MAUD (Merger Agreement Understanding Dataset)

| Field | Value |
|---|---|
| License | CC BY 4.0 |
| Source | HuggingFace `theatticusproject/maud` |
| Paper | Koreeda & Manning 2021 — https://arxiv.org/abs/2301.00876 |
| Task | Multiple-choice reading comprehension over merger agreement excerpts |
| Offline | Not available (requires HF fetch; no bundled fixtures) |

### ACORD (Insurance Forms — Synthetic)

| Field | Value |
|---|---|
| License | ACORD forms are copyrighted by ACORD Corporation. Use restricted to research/evaluation only. |
| Source | Synthetic samples mirroring public ACORD 25 / ACORD 27 schema |
| Task | Structured field extraction (named_insured, insurer, policy_number, dates, limits) |
| Note | No real ACORD-licensed form content is bundled. Samples are synthetic and reflect publicly documented ACORD form structure. |

### UNFAIR-ToS

| Field | Value |
|---|---|
| License | CC BY 4.0 |
| Source | HuggingFace `lex_glue` (unfair_tos subset) |
| Paper | Lippi et al. 2019 — https://arxiv.org/abs/1805.01217 |
| Task | Binary clause classification: fair / unfair |
| Offline | Not available (requires HF fetch) |

### LEDGAR

| Field | Value |
|---|---|
| License | CC BY 4.0 |
| Source | HuggingFace `lex_glue` (ledgar subset) |
| Paper | Tuggener et al. 2020 — https://aclanthology.org/2020.lrec-1.155/ |
| Task | Topic classification of legal contract provisions |
| Offline | Not available (requires HF fetch) |

---

## Adapter Prompt Templates

### CUAD

```
Review this contract excerpt and identify the "<question>" clause.
Return the exact text of that clause if present, or "NOT_FOUND" if absent.
Do not add commentary — return only the clause text or NOT_FOUND.

Contract excerpt:
<text>
```

### MAUD

```
Read this merger agreement excerpt and answer the question below.
Select the single best answer. Return only the letter and answer text.

Question: <question>
Choices:
  A. <choice_a>
  B. <choice_b>
  ...

Excerpt:
<text>
```

### ACORD

```
Extract the following key fields from this <form_type> document.
Return each field on its own line in the format "FIELD_NAME: value".
Fields to extract: named_insured, insurer, policy_number, effective_date,
expiration_date, each_occurrence_limit, general_aggregate_limit, coverage_amount, deductible.
If a field is not present, write "FIELD_NAME: NOT_FOUND".

Document:
<text>
```

### UNFAIR-ToS

```
Classify this Terms of Service clause as either "fair" or "unfair" from a consumer protection perspective.
An unfair clause is one that may violate consumer rights, limit user recourse, allow unexpected data use,
impose unreasonable liability, or allow unilateral changes without notice.

Respond with exactly one of: "FAIR" or "UNFAIR", followed by a one-sentence reason.

Clause:
<text>
```

### LEDGAR

```
Identify the primary topic category of this legal contract provision.
Return the category name only (e.g. "Termination", "Indemnification", "Governing Law",
"Confidentiality", "Intellectual Property", "Warranties", "Assignment", etc.).

Provision:
<text>
```

---

## Scoring Functions

All scorers are in `cli/eval-scorers.ts`. All scores are in [0, 1].

### CUAD — `scoreCuad`

**Method:** Word-level overlap F1 (case-insensitive, whitespace-normalized) between the predicted string and each gold span. Best F1 across all gold spans is returned.

**Special case:** If no gold spans exist, scores 1.0 if prediction contains `NOT_FOUND`, else 0.0.

**Tolerance:** Approximate — effective for long gold spans. Does not penalize for extra surrounding text.

### MAUD — `scoreMaud`

**Method:** Exact-match after normalization. Scores 1.0 if the gold answer appears as a substring of the prediction (case-insensitive). Partial credit (0.5) if the first character matches (handles single-letter shorthand).

**Tolerance:** Substring match is lenient; avoids penalizing correct answers padded with explanation.

### UNFAIR-ToS — `scoreUnfairTos`

**Method:** Binary label extraction from prediction text via keyword regex (`unfair|potentially unfair|problematic|violat|harmful|unreasonab`). Compares to gold label. Returns 1.0 on match, 0.0 otherwise.

**Tolerance:** Keyword list is intentionally broad to reduce false negatives.

### LEDGAR — `scoreLedgar`

**Method:** Substring match after normalization. Scores 1.0 if gold topic appears in prediction, 0.5 if prediction appears in gold topic (partial), 0.0 otherwise.

**Tolerance:** Approximate; may score 1.0 for very short predicted topics.

### ACORD — `scoreAcord`

**Method:** Per-field binary match: for each gold field value, scores 1 if the value appears verbatim (case-insensitive, whitespace-normalized) anywhere in the prediction. Final score = matched_fields / total_fields.

**Tolerance:** Presence-based; does not check field labels, only values.

---

## Budget Mechanism

The `--budget <usd>` flag (default: $50) caps total spending for a `possiblaw eval` run.

- At each sample, the running cost is checked against `budget * 0.95` (5% headroom).
- If the threshold is reached, the run aborts gracefully: already-completed samples are scored and reported, the `budgetAborted` flag is set to `true`, and the CLI exits with code `2`.
- Cost is tracked via `RunReport.cost.total` from the Sprint 5 cost reporter.
- Offline / dry-run runs always incur $0 cost and will never abort due to budget.

---

## Output Files

For each eval run, two files are written to `<outputDir>` (default: `layer/evals/results/`):

- `<dataset>--<workflow>--<timestamp>.json` — machine-readable `EvalReport` object
- `<dataset>--<workflow>--<timestamp>.md` — human report with summary table, top failures, confusion matrix, and per-sample results

---

## Offline Mode

When `ANTHROPIC_API_KEY` is not set, the harness runs in offline mode:

- **CUAD**: uses 3 bundled fixtures from `layer/evals/datasets/cuad/fixtures.jsonl`
- **ACORD**: uses in-memory synthetic samples (no file required)
- **MAUD, UNFAIR-ToS, LEDGAR**: require HF fetch; empty sample set → error (run `possiblaw eval fetch <dataset>` first)

Offline pipeline calls return deterministic stub output from existing Sprint 2 fixture infrastructure.
Scores will be lower than real LLM runs — this is expected. Cost will always be $0.
