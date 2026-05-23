---
name: connector-linear
description: Read and write issues, teams, and projects in Linear via the Linear GraphQL API using a personal API key.
metadata:
  sources:
    - path: layer/connectors/linear.yaml
      kind: local-file
      usage: vendored
      license: Apache-2.0
      attribution: PossibLaw
---

# Linear Connector

## What This Is

Linear is the issue tracker the operations team uses for internal product and engineering work that runs alongside legal matters. Agents call Linear to file new issues when a matter surfaces a recurring product-side bug (e.g. broken billing automation), to update issue status, or to list open work for a given team.

## Required Environment Variables

| Env | Purpose | Default | Source |
|---|---|---|---|
| `LINEAR_API_KEY` | Personal API key sent as `Authorization: <key>` (Linear accepts the raw key without `Bearer`) | — | Linear → Settings → API → Personal API keys |

## When to Invoke

- A matter agent identifies a defect in PossibLaw's own tooling and needs to file it for the engineering team.
- An operations agent needs to advance a sprint issue (status change, comment) based on legal-side progress.
- A reporting agent needs a snapshot of open issues for a given Linear team.

Do not invoke Linear for client-matter tracking — matters live in Paperclip, not Linear.

## Authentication

Linear's GraphQL endpoint expects the personal API key on the `Authorization` header **without** the `Bearer` prefix. Official docs: https://developers.linear.app/docs/graphql/working-with-the-graphql-api

## Operation Patterns

Linear is GraphQL-only — all calls go to a single endpoint with a POSTed query.

### Endpoint

`Method: POST https://api.linear.app/graphql`

Headers:
- `Authorization: $LINEAR_API_KEY`
- `Content-Type: application/json`

### List teams

```sh
curl -sS -X POST \
  -H "Authorization: ${LINEAR_API_KEY}" \
  -H "Content-Type: application/json" \
  --data '{"query":"query { teams { nodes { id name key } } }"}' \
  https://api.linear.app/graphql \
  | python3 -c "import json,sys; d=json.load(sys.stdin); [print(t['key'],t['name'],t['id']) for t in d['data']['teams']['nodes']]"
```

### Create an issue

```sh
curl -sS -X POST \
  -H "Authorization: ${LINEAR_API_KEY}" \
  -H "Content-Type: application/json" \
  --data "$(jq -n --arg t "$TEAM_ID" --arg title "$TITLE" --arg desc "$DESC" '{query:"mutation IssueCreate($i: IssueCreateInput!) { issueCreate(input: $i) { success issue { id identifier url } } }", variables:{i:{teamId:$t,title:$title,description:$desc}}}')" \
  https://api.linear.app/graphql \
  | python3 -c "import json,sys; d=json.load(sys.stdin); i=d['data']['issueCreate']['issue']; print(i['identifier'], i['url'])"
```

### List open issues for a team

GraphQL: `query { issues(filter: { team: { key: { eq: \"ENG\" } }, state: { type: { neq: \"completed\" } } }) { nodes { identifier title state { name } assignee { name } } } }`

Response shape: GraphQL wrapped in `{ data: { ... } }`. Always check `errors` array even on HTTP 200.

Failure modes:
- 401 / `AUTHENTICATION_ERROR` → key invalid or revoked. Post `BLOCKED: LINEAR_API_KEY rejected`.
- HTTP 200 with `errors` array → GraphQL-level error; surface the `message` and `extensions.code`.
- 429 → rate-limited (Linear has per-key complexity-based limits). Backoff per the `Retry-After` header.

## Output Convention

After creating an issue, post a Paperclip comment with the issue identifier (e.g. `ENG-123`) and the canonical URL returned by Linear. For list operations, post the count plus the first 10 identifiers + titles in a Paperclip comment; save the full JSON to the deliverables tree if more than 10 issues need to be tracked.

## Given / When / Then

- **Happy path** — Key valid, `issueCreate` returns `success: true`; agent posts `ENG-123 https://linear.app/<org>/issue/ENG-123` to Paperclip.
- **Edge** — GraphQL returns HTTP 200 but `errors: [{message: "User does not have access to team"}]`; agent treats this as a failure (not silent success), posts the message, and does not retry.
- **Failure / security** — `LINEAR_API_KEY` unset: agent posts `[CONNECTOR:LINEAR_UNCONFIGURED]`, makes no HTTP call, and never logs the key value.
