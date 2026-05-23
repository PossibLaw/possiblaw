---
name: connector-no-op-signature
description: Stub e-signature provider that returns a synthetic envelope ID and writes a placeholder signature-request JSON to disk. Use for offline demos, tests, and walkthroughs where DocuSign is not configured.
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

The no-op signature connector is the open-access stand-in for DocuSign. It does **not** contact any external service. Instead, it writes a placeholder signature-request JSON file to a local directory and returns a synthetic envelope ID. Status checks always report `pending`. Use it for offline demos, CI, eval runs, and operator walkthroughs where wiring real DocuSign would be overkill.

## Required Environment Variables

| Env | Purpose | Default | Source |
|---|---|---|---|
| `POSSIBLAW_SIGNATURE_STUB_DIR` | Directory where stub signature-request JSON files are written. | `$HOME/PossibLaw/local-signatures` | Operator chooses; document in `.paperclip.yaml` `inputs.env`. |

No credentials are required. The connector is a write-only stub on the local filesystem.

## When to Invoke

- Demo / PoC matters where DocuSign is not provisioned.
- CI and eval runs that exercise the contract-signature workflow end-to-end without billing DocuSign.
- Operator walkthroughs that need to confirm the workflow gate fires even when the e-signature provider is offline.

Do not invoke for any real client signature — the stub does not actually deliver the document and does not produce a legally-binding signed PDF.

## Authentication

None. Local filesystem write only.

## Operation Patterns

### Create a signature request (stub)

```sh
STUB_DIR="${POSSIBLAW_SIGNATURE_STUB_DIR:-$HOME/PossibLaw/local-signatures}"
mkdir -p "$STUB_DIR"
ENVELOPE_ID="stub-$(date +%Y%m%d%H%M%S)-$$"
DOC_PATH="${DOC_PATH:?DOC_PATH required}"
RECIPIENT="${RECIPIENT:?RECIPIENT required}"
cat > "${STUB_DIR}/${ENVELOPE_ID}.json" <<JSON
{
  "envelopeId": "${ENVELOPE_ID}",
  "status": "pending",
  "createdAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "documentPath": "${DOC_PATH}",
  "recipient": "${RECIPIENT}",
  "provider": "no-op-signature",
  "note": "STUB — no real e-signature was requested. Replace with connector-docusign for production."
}
JSON
echo "envelopeId=${ENVELOPE_ID}"
```

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
- Stub mistakenly used in production → the JSON's `note` field is a paper trail; agents should also surface a `[CONNECTOR:NO_OP_SIGNATURE_STUB]` warning on every invocation to make this loud.

## Output Convention

After every stub call, post a Paperclip comment that **explicitly** says the signature is a stub (`[CONNECTOR:NO_OP_SIGNATURE_STUB]`) with the envelope ID and the local JSON path. The visual loudness is intentional — the workflow should never silently succeed against a non-binding signature.

## Given / When / Then

- **Happy path** — `POSSIBLAW_SIGNATURE_STUB_DIR` set (or default), create writes the JSON, agent posts a `[CONNECTOR:NO_OP_SIGNATURE_STUB] envelopeId=stub-... pending` comment to Paperclip.
- **Edge** — Operator runs `eval` that polls status many times; each poll returns `pending` and the agent does not loop forever — it caps the poll count and notes "stub will never complete" in the Paperclip comment.
- **Failure / security** — Operator has accidentally pointed a production workflow at this connector; agent's `[CONNECTOR:NO_OP_SIGNATURE_STUB]` warning is visible in both Paperclip and the matter deliverable so an operator review will catch it before the matter closes. The stub never claims a signature was delivered.
