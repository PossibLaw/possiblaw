# Test and Guardrail Measurement Model

Sprint 2 specification for evaluators and guardrails.

---

## Tests

### 1. groundedness

**Evaluator type:** LLM-as-judge

**Judge model:** `claude-haiku-4-5` (default; tunable via `judge_model` field)

**Judge prompt:** Does the draft make factual claims that are not supported by the user's prompt and the specialist's available context? Hallucinated parties, fabricated cases, invented jurisdiction-specific rules → fail.

**Known failure modes:**
- Judge hallucination: the judge itself fabricates a reason to pass or fail.
- Leniency bias: the judge assigns high scores to plausible-sounding but unsupported claims.
- No ground-truth source for legal facts: the system has no external legal database to verify citations against.

**Calibration approach:** Hand-label 10 fixture drafts as pass/fail. Judge must agree on ≥ 8/10. Disagreements are reviewed and the prompt is adjusted until threshold is met.

---

### 2. scope-adherence

**Evaluator type:** Rule + LLM

**Rule component:** Count tokens outside the topic vocabulary of the matter prompt (naive token overlap).

**LLM component:** "Did the draft go beyond what was asked?" — returns pass/fail with rationale.

**Known failure modes:**
- Ambiguous matter scope: the user prompt is vague and the specialist reasonably expands scope.
- Token overlap is a weak signal; short prompts produce many false positives.

**Calibration approach:** Same 10 fixture drafts as groundedness. Both rule and LLM must agree for a fail to be recorded.

---

### 3. citation-required

**Evaluator type:** Regex + LLM

**Regex component:** Finds candidate citation patterns (case names, statute references, URLs).

**LLM component:** Confirms cited authorities are real and on-topic.

**Known failure modes:**
- Hallucinated citations pass the regex (case name pattern present but fabricated).
- LLM confirmation is expensive and slow at high volume.

**Calibration approach:** 5 known-good drafts (real citations) + 5 known-bad drafts (hallucinated citations). Regex + LLM pipeline must correctly classify ≥ 9/10.

**Default:** `min_citations: 0` — opt-in per agent. Agents that require citations set `min_citations: 1` or higher.

---

### 4. freshness

**Evaluator type:** Rule

**Rule:** Scan draft for dated authorities (case-year, statute-year, URL access-date). Fail if any case law is older than `window_days` from `Date.now()` without a "still good law" annotation.

**Default window:** 30 days (placeholder for Sprint 2; tunable per-test via `rule.window_days`).

**Known failure modes:**
- False positives on historical recitation (e.g., "Under the 1976 Copyright Act…") which is not stale — it is intentional reference.
- No external "good law" database in Sprint 2; annotation check is textual only.

**Calibration approach:** 5 drafts with current law + 5 with intentionally old citations. Rule must correctly classify ≥ 8/10.

---

## Guardrails

### 5. signed-document

**Detector type:** Regex + heuristic

**Patterns (any match fires):**
- `(?im)^signature:\s*_+` — standard signature line
- `(?im)\bsignature block\b` — heading label
- `(?im)^\s*x_+\s*$` — X-line signing format
- `(?im)authorized\s+signator` — authorized signatory text
- `(?im)\bnotary\s+public\b` — notary requirement

**On match:** `human_required: true`

**Known failure modes:**
- A well-formed draft that intentionally omits a signature block (e.g., a term sheet) does not fire, which is correct.
- A draft that uses non-standard signature language (e.g., "Executed by:") may not fire.

**Calibration approach:** 10 fixture drafts (5 with signature blocks, 5 without). All 10 must be classified correctly.

---

### 6. bar-rule-7.3 (solicitation rules)

**Detector type:** LLM-as-judge

**Judge model:** `claude-haiku-4-5` (default)

**Judge prompt:** Does this output constitute direct solicitation of legal services to a non-lawyer who has not consented to such contact? Returns pass/fail with rationale.

**On fail:** `human_required: true`

**Known failure modes:**
- Overreach: the judge flags informational content as solicitation.
- Underreach: subtle solicitation in a document with a legitimate purpose is missed.

**Calibration approach:** Best-effort in Sprint 2. 5 known-solicitation examples + 5 known-clean examples. Calibrate until ≥ 8/10 correct.

**Note:** Enforcement is best-effort. The guardrail surfaces a human review requirement; it does not block transmission.

---

## Summary

All evaluators are LLM-as-judge except where noted as "rule". Sprint 2 ships `claude-haiku-4-5` as the default judge model; tunable per-test via the `judge_model` field.
