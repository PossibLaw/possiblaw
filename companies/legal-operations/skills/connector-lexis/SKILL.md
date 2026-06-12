---
name: connector-lexis
description: LexisNexis legal-research API for case search, full-text retrieval, and Shepard's citation verification. Requires an enterprise contract; endpoint shapes must be confirmed against the live API spec.
metadata:
  sources:
    - path: layer/connectors/lexis.yaml
      kind: local-file
      usage: vendored
      license: Apache-2.0
      attribution: PossibLaw
---

# LexisNexis Connector

## What This Is

LexisNexis is one of the two flagship paid legal-research platforms (the other being Westlaw). Agents call Lexis when a matter needs deep case-law search, full opinion text, secondary sources, or Shepard's citation-treatment data. PossibLaw treats Lexis as the paid upgrade path from the open-access `connector-courtlistener` stand-in.

**Important:** The exact base URL and request/response shapes are **UNCONFIRMED** in the legacy descriptor and must be reconciled against the spec delivered with the firm's enterprise contract. Treat the operation patterns below as starting placeholders, not as the production contract.

## Required Environment Variables

| Env | Purpose | Default | Source |
|---|---|---|---|
| `LEXIS_API_KEY` | API key issued under the firm's LexisNexis enterprise contract | — | LexisNexis developer portal — UNCONFIRMED, operator must verify against current vendor docs |
| `LEXIS_USER_ID` | LexisNexis user identifier associated with the API credential | — | Provided alongside the API key by the firm's Lexis account manager |
| `LEXIS_BASE_URL` | API base URL (per the firm's contract — varies by product) | UNCONFIRMED | Vendor onboarding pack |

## When to Invoke

- A research agent needs Shepard's negative-treatment analysis on a citation (CourtListener does not provide this).
- A brief-drafting agent needs licensed secondary-source treatises or Lexis-exclusive annotations.
- A litigation agent needs comprehensive state-court coverage at scale, with paid-tier rate limits.

Do not invoke Lexis for routine searches that CourtListener can satisfy — the firm is billed per query/seat. Prefer the open-access stand-in unless the matter justifies the paid call.

## Query Privacy Caveat

Queries themselves can carry privileged facts — a search string containing client names, case identifiers, or litigation strategy exposes those facts to LexisNexis' infrastructure. Keep queries to neutral legal terms for confidential or privileged matters (e.g. `indemnification software license` rather than the client's name or matter number). Firms that need all research queries gated and receipted can promote research connectors behind the gate via policy — see the comments in `companies/legal-operations/gate-policy.yaml` for the pattern.

## Authentication

UNCONFIRMED — operator must verify against current vendor docs at https://developer.lexisnexis.com. Common LexisNexis API patterns use either an `Authorization: Bearer <token>` header obtained from an OAuth 2.0 client-credentials exchange, or a direct `X-API-Key: $LEXIS_API_KEY` header on each request. Do not assume one pattern without confirming the spec for the specific Lexis product (Lexis+ API vs. legacy Lexis Web Services).

## Operation Patterns

### Search cases

`Method: POST ${LEXIS_BASE_URL}/search/cases` — UNCONFIRMED

Headers (placeholder — verify):
- `Authorization: Bearer $LEXIS_TOKEN`
- `X-User-Id: $LEXIS_USER_ID`
- `Content-Type: application/json`

Body (placeholder):
```json
{ "query": "indemnification AND \"software license\"", "jurisdiction": "US", "filedAfter": "2020-01-01", "pageSize": 25 }
```

Example (treat as scaffold — confirm endpoint and field names before running against billable account):
```sh
curl -sS -X POST \
  -H "Authorization: Bearer ${LEXIS_TOKEN}" \
  -H "X-User-Id: ${LEXIS_USER_ID}" \
  -H "Content-Type: application/json" \
  --data '{"query":"indemnification","pageSize":10}' \
  "${LEXIS_BASE_URL}/search/cases" \
  | python3 -c "import json,sys; d=json.load(sys.stdin); print(json.dumps(d,indent=2)[:500])"
```

### Fetch a case by citation

`Method: GET ${LEXIS_BASE_URL}/cases/<citation>` — UNCONFIRMED. Returns full opinion text plus headnotes.

### Shepardize a citation

`Method: GET ${LEXIS_BASE_URL}/shepards/<citation>` — UNCONFIRMED. Returns negative-treatment signals (`questioned`, `overruled`, `distinguished`, etc.) per the Shepard's grading scale.

Failure modes:
- 401 → token rejected. Refresh OAuth token if applicable; if still failing, post `BLOCKED: LEXIS_AUTH_REJECTED` and ask operator to verify with Lexis account manager.
- 402 / contract-limit responses → seat or query quota exhausted. Post a Paperclip comment with the exact upstream message and pause; do not retry.
- 429 → rate-limited. Backoff per `Retry-After` header.
- 5xx → upstream issue. Capture response body in a Paperclip comment.

## Output Convention

Agents must distinguish Lexis output from open-source output in deliverables (Lexis content is paid and licensed). Post the citation, court, date, and Shepard's signal to a Paperclip comment; save full opinion text under the matter deliverables tree with a header noting `Source: LexisNexis` and the retrieval timestamp. Do not redistribute Lexis content outside the firm.

## Given / When / Then

- **Happy path** — `LEXIS_API_KEY` + `LEXIS_USER_ID` set, search returns hits, Shepard's call confirms a citation is `good law`; agent posts a Paperclip comment with citation, treatment, and the licensed-source disclaimer.
- **Edge** — Shepard's returns `questioned by` a later opinion; agent posts the negative-treatment flag prominently in the comment and pages the operator via `notify-slack` rather than burying it.
- **Failure / security** — Endpoint shape is UNCONFIRMED and a call returns `404` because the placeholder path is wrong: agent posts `[CONNECTOR:LEXIS_UNCONFIRMED] endpoint <path> returned 404; operator must reconcile against the contracted Lexis API spec`, never spends additional quota retrying, and never logs the API key.
