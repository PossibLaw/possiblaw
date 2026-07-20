---
name: connector-no-op-signature
description: Stub e-signature provider that routes through the gate proxy sign_document tool (action package v1) and writes a placeholder JSON locally. Use for offline demos, tests, and walkthroughs where DocuSign is not configured.
metadata:
  sources:
    - path: layer/connectors/no-op-signature.yaml
      kind: local-file
      usage: vendored
      license: Apache-2.0
      attribution: PossibLaw
---

# No-Op Signature Connector

## What This Is

The no-op signature connector is the open-access stand-in for DocuSign. It routes signature requests through the gate proxy `sign_document` tool — the proxy writes a local action package (the same v1 contract as DocuSign) and returns a synthetic envelope ID. Status checks always report `pending`. Use it for offline demos, CI, eval runs, and operator walkthroughs where wiring real DocuSign would be overkill.

**Credentials live in the gate proxy only.** No external API is called in v1 — the action package is a local JSON file. If you see `credential_missing` from the proxy for a non-stub tool, the operator must export it before launching (see the walkthrough Gate Proxy section); never ask for or handle tokens yourself.

## Required Environment Variables

| Env | Purpose | Default | Source |
|---|---|---|---|
| `POSSIBLAW_SIGNATURE_STUB_DIR` | Directory where stub signature-request JSON files are written. | `$HOME/PossibLaw/local-signatures` | Operator chooses; document in `.paperclip.yaml` `inputs.env`. |

No credentials are required. The connector routes through the proxy, which writes locally.

## When to Invoke

- Demo / PoC matters where DocuSign is not provisioned.
- CI and eval runs that exercise the contract-signature workflow end-to-end without billing DocuSign.
- Operator walkthroughs that need to confirm the workflow gate fires even when the e-signature provider is offline.

Do not invoke for any real client signature — the stub does not actually deliver the document and does not produce a legally-binding signed PDF.

## Authentication

None. The proxy writes a local action package; no external service is contacted.

## Operation Patterns

### Create a signature request via the gate proxy

```sh
curl -sS -X POST \
  -H "Authorization: Bearer ${PAPERCLIP_API_KEY}" \
  -H "Content-Type: application/json" \
  --data "$(jq -n \
    --arg docPath "${DOC_PATH:?DOC_PATH required}" \
    --arg recipient "${RECIPIENT:?RECIPIENT required}" \
    --arg agent "$PAPERCLIP_AGENT_ID" \
    --arg issue "$ISSUE_ID" \
    '{payload:{documentPath:$docPath,recipient:$recipient,subject:"Signature request (no-op stub)"},
      meta:{agentId:$agent,issueId:$issue,confidentiality:"standard",entities:[$recipient]}}')" \
  "${GATE_PROXY_URL}/egress/sign_document"
```

**v1 action-package contract:** The proxy writes a JSON action package under `~/.possiblaw/action-packages/` and returns:

```json
{
  "actionPackage": "/path/to/<timestamp>-sign_document.json",
  "note": "no external API in v1 — a human executes this package manually"
}
```

The package contains `tool`, `payload` (including `documentPath` and `recipient`), `agentId`, and `issueId`. No external signature service is contacted.

**202 `{status:"pending_approval", approvalId, resumeHint}`** — if `SIGNATURE: human` is set in `gate-policy.yaml`, a human must approve. End your turn: post a Paperclip comment with the `approvalId`. When approved, re-call the SAME endpoint with the IDENTICAL payload plus `meta.approvalId`.

### Get signature status (stub)

```sh
STUB_DIR="${POSSIBLAW_SIGNATURE_STUB_DIR:-$HOME/PossibLaw/local-signatures}"
ENVELOPE_ID="${ENVELOPE_ID:?}"
TARGET="${STUB_DIR}/${ENVELOPE_ID}.json"
if [ ! -f "$TARGET" ]; then
  paperclip comment "[CONNECTOR:NO_OP_SIGNATURE_NOT_FOUND] ${TARGET}"
  exit 0
fi
cat "$TARGET" | python3 -c "import json,sys; d=json.load(sys.stdin); print('envelopeId=', d['envelopeId'], 'status=', d['status'])"
```

The stub always reports `status=pending`. There is no "complete" transition unless the operator manually edits the JSON.

Failure modes:
- Directory missing → `mkdir -p` handles it on write; read posts a NOT_FOUND comment.
- Disk full → surface OS error to a Paperclip comment.
- Stub mistakenly used in production → the action package's contents are a paper trail; agents should also surface a `[CONNECTOR:NO_OP_SIGNATURE_STUB]` warning on every invocation to make this loud.

## Output Convention

After every stub call, post a Paperclip comment that **explicitly** says the signature is a stub (`[CONNECTOR:NO_OP_SIGNATURE_STUB]`) with the action package path and the local JSON location. The visual loudness is intentional — the workflow should never silently succeed against a non-binding signature.

## Given / When / Then

- **Happy path** — Proxy receives the sign_document call, writes the action package, returns 200; agent posts a `[CONNECTOR:NO_OP_SIGNATURE_STUB] actionPackage=... pending` comment to Paperclip.
- **Edge** — Operator runs `eval` that polls status many times; each poll returns `pending` and the agent does not loop forever — it caps the poll count and notes "stub will never complete" in the Paperclip comment.
- **Failure / security** — Operator has accidentally pointed a production workflow at this connector; agent's `[CONNECTOR:NO_OP_SIGNATURE_STUB]` warning is visible in both Paperclip and the matter deliverable so an operator review will catch it before the matter closes. The stub never claims a signature was delivered.
