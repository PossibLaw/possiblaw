---
name: connector-linear
description: Read issues, teams, and projects in Linear via the Linear GraphQL API. Write operations (create/update issues) are routed through the gate proxy share_external tool — v1 gate refuses this with not_implemented, so writes are visibly blocked rather than silently credentialed.
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

Linear is the issue tracker the operations team uses for internal product and engineering work that runs alongside legal matters. Agents call Linear directly for read-only operations (listing teams, listing issues). Write operations — filing new issues, updating issue status — are routed through the gate proxy `share_external` tool. **In v1 the gate returns `502 not_implemented` for `share_external`**, so these writes are visibly blocked rather than silently credentialed. This is an honest posture: Linear write paths are future gate work.

**Write credentials will live in the gate proxy once Linear is implemented gate-side — they do not yet.** The v1 proxy returns `502 not_implemented` for `share_external` unconditionally, before it would ever check for a Linear credential; credential wiring arrives when the connector is implemented gate-side (see "Write operations" below). For the **read** path, the agent holds its own `LINEAR_API_KEY`; a `401` / `AUTHENTICATION_ERROR` means it was invalidated or revoked — the operator must export a fresh one (see the walkthrough Gate Proxy section); never ask for or handle tokens yourself.

## Required Environment Variables

Read-only operations use the agent's API key. Writes go through the proxy.

| Env | Purpose | Default | Source |
|---|---|---|---|
| `LINEAR_API_KEY` | Personal API key for read operations | — | Linear → Settings → API → Personal API keys |

## When to Invoke

- A matter agent identifies a defect in PossibLaw's own tooling and needs to file it for the engineering team (write via proxy — v1 blocked).
- An operations agent needs to advance a sprint issue (write via proxy — v1 blocked).
- A reporting agent needs a snapshot of open issues for a given Linear team (read directly).

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

### List teams (read-only — direct)

```sh
curl -sS -X POST \
  -H "Authorization: ${LINEAR_API_KEY}" \
  -H "Content-Type: application/json" \
  --data '{"query":"query { teams { nodes { id name key } } }"}' \
  https://api.linear.app/graphql \
  | python3 -c "import json,sys; d=json.load(sys.stdin); [print(t['key'],t['name'],t['id']) for t in d['data']['teams']['nodes']]"
```

### List open issues for a team (read-only — direct)

GraphQL: `query { issues(filter: { team: { key: { eq: \"ENG\" } }, state: { type: { neq: \"completed\" } } }) { nodes { identifier title state { name } assignee { name } } } }`

Response shape: GraphQL wrapped in `{ data: { ... } }`. Always check `errors` array even on HTTP 200.

### Write operations (create issue, update status) via the gate proxy

Write operations go through the proxy — never the Linear API directly:

```sh
curl -sS -X POST \
  -H "Content-Type: application/json" \
  --data "$(jq -n \
    --arg op "$OPERATION" \
    --arg target "linear" \
    --argjson payload "$WRITE_PAYLOAD" \
    --arg agent "$PAPERCLIP_AGENT_ID" \
    --arg issue "$ISSUE_ID" \
    '{payload:{target:$target,operation:$op,data:$payload},
      meta:{agentId:$agent,issueId:$issue,confidentiality:"standard",entities:[]}}')" \
  "${GATE_PROXY_URL}/egress/share_external"
```

**v1 response: `502 not_implemented`** — the gate refuses `share_external` with `not_implemented: share_external needs an operator-configured destination (v1)`. Post this as a Paperclip comment and mark the write blocked. The operator must file the Linear issue manually or wait for gate v2 Linear support.

**403** — blocked by policy; post reason as a comment.

Failure modes:
- 401 / `AUTHENTICATION_ERROR` → key invalid or revoked (read path). Post `BLOCKED: LINEAR_API_KEY rejected`.
- HTTP 200 with `errors` array → GraphQL-level error; surface the `message` and `extensions.code`.
- 429 → rate-limited (Linear has per-key complexity-based limits). Backoff per the `Retry-After` header.

## Output Convention

For read operations, post the count plus the first 10 identifiers + titles in a Paperclip comment; save the full JSON to the deliverables tree if more than 10 issues need to be tracked. For attempted writes that return `not_implemented`, post `[CONNECTOR:LINEAR_WRITE_NOT_IMPLEMENTED_V1]` with the operation details and a note that the operator must execute it manually or wait for gate v2 support.

## Given / When / Then

- **Happy path** — Key valid; team listing returns results; agent posts team IDs and names to Paperclip.
- **Edge** — GraphQL returns HTTP 200 but `errors: [{message: "User does not have access to team"}]`; agent treats this as a failure (not silent success), posts the message, and does not retry.
- **Failure / security** — Write attempt returns `502 not_implemented` from the proxy: agent posts `[CONNECTOR:LINEAR_WRITE_NOT_IMPLEMENTED_V1]`, does not retry the direct Linear API, and never logs the key value.
