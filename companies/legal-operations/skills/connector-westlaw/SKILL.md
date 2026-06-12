---
name: connector-westlaw
description: Thomson Reuters Westlaw Edge API for case search, full-text retrieval, and KeyCite citation verification. Requires an enterprise contract; endpoint shapes must be confirmed against the live API spec.
metadata:
  sources:
    - path: layer/connectors/westlaw.yaml
      kind: local-file
      usage: vendored
      license: Apache-2.0
      attribution: PossibLaw
---

# Westlaw Connector

## What This Is

Westlaw (Thomson Reuters Westlaw Edge) is one of the two flagship paid legal-research platforms (the other being LexisNexis). Agents call Westlaw when a matter needs deep case-law search, full opinion text, secondary sources, or KeyCite citation-treatment data. PossibLaw treats Westlaw as the paid upgrade path from the open-access `connector-courtlistener` stand-in.

**Important:** The exact base URL and request/response shapes are **UNCONFIRMED** in the legacy descriptor and must be reconciled against the spec delivered with the firm's Thomson Reuters enterprise contract. Treat the operation patterns below as starting placeholders, not as the production contract.

## Required Environment Variables

| Env | Purpose | Default | Source |
|---|---|---|---|
| `WESTLAW_API_KEY` | API key issued under the firm's Thomson Reuters enterprise contract | — | Thomson Reuters developer portal — UNCONFIRMED, operator must verify against current vendor docs |
| `WESTLAW_USER_ID` | Westlaw user identifier associated with the API credential | — | Provided alongside the API key by the firm's TR account manager |
| `WESTLAW_BASE_URL` | API base URL (per the firm's contract — varies by product) | UNCONFIRMED | Vendor onboarding pack |

## When to Invoke

- A research agent needs KeyCite negative-treatment analysis on a citation (CourtListener does not provide this).
- A brief-drafting agent needs licensed secondary-source treatises or Westlaw-exclusive headnotes.
- A litigation agent needs comprehensive state-court coverage at scale, with paid-tier rate limits.

Do not invoke Westlaw for routine searches that CourtListener can satisfy — the firm is billed per query/seat. Prefer the open-access stand-in unless the matter justifies the paid call.

## Query Privacy Caveat

Queries themselves can carry privileged facts — a search string containing client names, case identifiers, or litigation strategy exposes those facts to Thomson Reuters' infrastructure. Keep queries to neutral legal terms for confidential or privileged matters (e.g. `indemnification software license` rather than the client's name or matter number). Firms that need all research queries gated and receipted can promote research connectors behind the gate via policy — see the comments in `companies/legal-operations/gate-policy.yaml` for the pattern.

## Authentication

UNCONFIRMED — operator must verify against current vendor docs at https://developer.thomsonreuters.com. Common Westlaw patterns use either an `Authorization: Bearer <token>` header obtained from an OAuth 2.0 client-credentials exchange, or a direct `X-API-Key: $WESTLAW_API_KEY` header on each request. Do not assume one pattern without confirming the spec for the specific Westlaw product (Westlaw Edge API vs. legacy WL APIs).

## Operation Patterns

### Search cases

`Method: POST ${WESTLAW_BASE_URL}/search/cases` — UNCONFIRMED

Headers (placeholder — verify):
- `Authorization: Bearer $WESTLAW_TOKEN`
- `X-User-Id: $WESTLAW_USER_ID`
- `Content-Type: application/json`

Body (placeholder):
```json
{ "query": "indemnification AND \"software license\"", "jurisdiction": "US", "filedAfter": "2020-01-01", "pageSize": 25 }
```

Example (scaffold — confirm endpoint and field names before running against billable account):
```sh
curl -sS -X POST \
  -H "Authorization: Bearer ${WESTLAW_TOKEN}" \
  -H "X-User-Id: ${WESTLAW_USER_ID}" \
  -H "Content-Type: application/json" \
  --data '{"query":"indemnification","pageSize":10}' \
  "${WESTLAW_BASE_URL}/search/cases" \
  | python3 -c "import json,sys; d=json.load(sys.stdin); print(json.dumps(d,indent=2)[:500])"
```

### Fetch a case by citation

`Method: GET ${WESTLAW_BASE_URL}/cases/<citation>` — UNCONFIRMED. Returns full opinion text plus headnotes.

### KeyCite a citation

`Method: GET ${WESTLAW_BASE_URL}/keycite/<citation>` — UNCONFIRMED. Returns KeyCite treatment flags (red flag, yellow flag, depth-of-treatment) per the KeyCite grading scale.

Failure modes:
- 401 → token rejected. Refresh OAuth token if applicable; if still failing, post `BLOCKED: WESTLAW_AUTH_REJECTED` and ask operator to verify with TR account manager.
- 402 / contract-limit responses → seat or query quota exhausted. Post a Paperclip comment with the exact upstream message and pause; do not retry.
- 429 → rate-limited. Backoff per `Retry-After` header.
- 5xx → upstream issue. Capture response body in a Paperclip comment.

## Output Convention

Agents must distinguish Westlaw output from open-source output in deliverables (Westlaw content is paid and licensed). Post the citation, court, date, and KeyCite flag to a Paperclip comment; save full opinion text under the matter deliverables tree with a header noting `Source: Westlaw` and the retrieval timestamp. Do not redistribute Westlaw content outside the firm.

## Given / When / Then

- **Happy path** — `WESTLAW_API_KEY` + `WESTLAW_USER_ID` set, search returns hits, KeyCite call confirms a citation has no negative treatment; agent posts a Paperclip comment with citation, treatment, and the licensed-source disclaimer.
- **Edge** — KeyCite returns a red flag (overruled or reversed); agent surfaces the negative treatment prominently in the Paperclip comment and pages the operator via `notify-slack` rather than burying it inside a longer summary.
- **Failure / security** — Endpoint shape is UNCONFIRMED and a call returns `404` because the placeholder path is wrong: agent posts `[CONNECTOR:WESTLAW_UNCONFIRMED] endpoint <path> returned 404; operator must reconcile against the contracted Westlaw API spec`, never spends additional quota retrying, and never logs the API key.
