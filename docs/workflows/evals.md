# Evals-Driven Development (EDD)

Use evals to help novice developers build and ship features without guessing what “done” means.

## The One Loop
Repeat this loop for every user-visible feature or behavior change:

1. **Define the goal** (what the user is trying to do).
2. **Define evals** (how we know the goal is met).
3. **Make one eval fail first** (test, script, or manual checklist).
4. **Implement the smallest change** to make it pass.
5. **Run checks and record receipts** in `.agent/TEST.md`.
6. **Review for regressions and security** using `.agent/REVIEW.md` when applicable.
7. **Handoff** with clear next steps in `.agent/HANDOFF.md` (or `.claude/history.md`).

For stage linkage and required artifact headers, use `docs/workflows/contracts.md`.

## Evals (What To Write Down)
Prefer concrete pass/fail criteria. Avoid 1–5 scores unless you are only ranking items for curation.

Minimum eval coverage for any behavior change:
- **Happy path**: the most common successful scenario.
- **Edge/boundary**: the “almost works” scenario (empty input, maximum length, unusual but valid case).
- **Failure/security**: the expected rejection or guardrail behavior (invalid input, unauthorized user, missing dependency).

Use this format (copy into `.agent/TEST.md`):

| Eval ID | User Goal | Given | When | Then | Inputs/Fixtures | Expected Output | How User Verifies |
| --- | --- | --- | --- | --- | --- | --- | --- |
| E1 |  |  |  |  |  |  |  |
| E2 |  |  |  |  |  |  |  |
| E3 |  |  |  |  |  |  |  |

Worked example — a "Export contacts as CSV" feature:

| Eval ID | User Goal | Given | When | Then | Inputs/Fixtures | Expected Output | How User Verifies |
| --- | --- | --- | --- | --- | --- | --- | --- |
| E1 (happy) | Download contacts as CSV | Signed-in user with 3 contacts | User clicks "Export CSV" | A `contacts.csv` file downloads with header row + 3 data rows | Seeded user `u1` with contacts `c1`, `c2`, `c3` | File `contacts.csv` 4 lines; headers `name,email,phone` | Open the file and count lines; spot-check one contact's row |
| E2 (edge) | Export when no contacts exist | Signed-in user with 0 contacts | User clicks "Export CSV" | A `contacts.csv` downloads with only the header row (no error) | Seeded user `u2` with no contacts | File `contacts.csv` 1 line; headers only | Open file; confirm only one line |
| E3 (failure/security) | Block anonymous export | Anonymous (not signed in) user | User hits the `/export` URL directly | Request is rejected with HTTP 401; no file returned | Unauth request to `/export` | HTTP 401 JSON `{"error":"unauthenticated"}` | `curl -i` the endpoint; confirm 401 and no CSV body |

## Choosing Evaluators
1. **Fix obvious issues first** (missing prompt instruction, missing tool, configuration bug, retrieval bug).
2. Prefer **deterministic checks** when possible:
   - schema validation, parsing, regex, golden files, snapshot tests, execution checks.
3. Use **LLM-as-judge** only for criteria that truly require interpretation (tone, faithfulness, relevance).
4. If you use an LLM judge, **validate it against human labels** before trusting it.

## Error Analysis (For LLM Features)
If the feature involves an LLM or agent behavior:

1. Collect ~50–100 representative traces (real preferred; synthetic if needed).
2. Review traces and label **Pass/Fail**.
3. Write down **what went wrong** for failures (observations, not theories).
4. Cluster failures into **5–10 actionable categories**.
5. Prioritize by frequency and impact; fix the top category first.

Anti-patterns:
- Brainstorming failure categories before reviewing traces.
- Using a single holistic “quality score” instead of specific failure modes.

## RAG/Tools (Debug Faster)
When a system uses retrieval and generation:
- Evaluate **retrieval** (did we fetch what we needed?) separately from **generation** (did we use it correctly?).
- Fix retrieval before tuning generation when context is missing.
