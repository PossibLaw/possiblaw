---
name: connector-midpage
description: midpage legal-AI API for brief research, drafting, and document analysis. API schema is UNCONFIRMED and must be reconciled with midpage's live spec before production use.
metadata:
  sources:
    - path: layer/connectors/midpage.yaml
      kind: local-file
      usage: vendored
      license: Apache-2.0
      attribution: PossibLaw
---

# midpage Connector

## What This Is

midpage is a legal-AI vendor that offers brief research and drafting tools. PossibLaw treats midpage as a specialist research connector for matters where its citation-extraction or brief-summarization capabilities outperform the open-access stand-in. Contact midpage.ai for API access.

**Important:** The base URL, auth scheme, and request/response shapes were marked **UNCONFIRMED** in the legacy descriptor. Treat every operation pattern below as a placeholder and confirm against the spec midpage delivers with the API credential.

## Required Environment Variables

| Env | Purpose | Default | Source |
|---|---|---|---|
| `MIDPAGE_API_KEY` | API key for midpage requests | — | Contact https://midpage.ai for access — UNCONFIRMED, operator must verify against current vendor docs |
| `MIDPAGE_BASE_URL` | API base URL | `https://api.midpage.ai/v1` (UNCONFIRMED) | midpage onboarding pack |

## When to Invoke

- A research agent needs midpage's brief-summarization on an opposing motion.
- A drafting agent wants midpage's citation suggestions inside a working brief.
- A litigation agent needs midpage's case-vector search where open-access tools miss the target.

Do not invoke for routine queries CourtListener can satisfy, and do not invoke without operator approval — midpage is a paid call.

## Query Privacy Caveat

Queries and prompts sent to midpage can carry privileged facts — document content, client identities, or litigation strategy embedded in a summarization prompt is transmitted to midpage's infrastructure. Keep prompts to the minimum context needed; strip or replace client-identifying information for confidential or privileged matters before sending. Firms that need all AI-research queries gated and receipted can promote research connectors behind the gate via policy — see the comments in `companies/legal-operations/gate-policy.yaml` for the pattern.

## Authentication

UNCONFIRMED — operator must verify against current vendor docs at https://midpage.ai. Likely shape is `Authorization: Bearer $MIDPAGE_API_KEY` on every request, but this must be confirmed before any production call.

## Operation Patterns

### List briefs

`Method: GET ${MIDPAGE_BASE_URL}/briefs` — UNCONFIRMED

Headers:
- `Authorization: Bearer $MIDPAGE_API_KEY`
- `Accept: application/json`

Example (scaffold — verify before billable use):
```sh
curl -sS \
  -H "Authorization: Bearer ${MIDPAGE_API_KEY}" \
  -H "Accept: application/json" \
  "${MIDPAGE_BASE_URL}/briefs" \
  | python3 -c "import json,sys; d=json.load(sys.stdin); print(json.dumps(d,indent=2)[:500])"
```

### Get a brief

`Method: GET ${MIDPAGE_BASE_URL}/briefs/<id>` — UNCONFIRMED. Returns the brief body and metadata.

### Create a brief

`Method: POST ${MIDPAGE_BASE_URL}/briefs` — UNCONFIRMED. Body shape (placeholder):
```json
{ "matterId": "<matter>", "title": "Motion to Compel", "prompt": "Draft a brief in support of..." }
```

Failure modes:
- 401 → key rejected. Post `BLOCKED: MIDPAGE_AUTH_REJECTED` and link the contact page.
- 402 / quota responses → contract limit exceeded; pause and notify operator.
- 404 on the placeholder endpoint → schema is wrong; do not retry, post `[CONNECTOR:MIDPAGE_UNCONFIRMED]` with the endpoint path.
- 5xx → upstream issue; surface body in a Paperclip comment.

## Output Convention

Treat midpage output as paid licensed content. Post a Paperclip comment summarizing the response (brief ID, title, citation count) and save the full body to the matter deliverables tree with a `Source: midpage` header and retrieval timestamp.

## Given / When / Then

- **Happy path** — `MIDPAGE_API_KEY` set, brief fetch returns the expected body; agent posts the brief ID + summary to Paperclip and saves the body to the deliverables tree.
- **Edge** — midpage returns a deeply paginated result; agent paginates only as far as the operator approved and notes the truncation in the Paperclip comment rather than silently fetching all pages.
- **Failure / security** — Endpoint shape is UNCONFIRMED and a call returns `404`; agent posts `[CONNECTOR:MIDPAGE_UNCONFIRMED] endpoint <path> returned 404; operator must reconcile against the midpage API spec`, never retries with variations that could rack up quota, and never logs the API key.
