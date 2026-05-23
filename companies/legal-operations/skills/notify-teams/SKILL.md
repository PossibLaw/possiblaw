---
name: notify-teams
description: Post a notification to Microsoft Teams when an issue needs operator attention (gate fired, blocker, awaiting approval, deliverable ready). Uses a Teams incoming webhook URL from env.
metadata:
  sources:
    - path: companies/legal-operations/skills/notify-teams/SKILL.md
      kind: local-file
      usage: original
      license: Apache-2.0
      attribution: PossibLaw
---

# Microsoft Teams Notification

Use this skill whenever the operator needs to be pulled into the loop and the firm runs on Microsoft Teams instead of Slack. Paperclip does not have first-class notifications; this skill is the agent-side bridge that calls a Teams incoming webhook so the operator sees gates fire in real time.

## When to Invoke

Invoke this skill (do not wait for the operator to poll the Paperclip UI) when any of the following happens:

- A **gate fires** (matter intake conflicts check, NDA review checkpoint, billing approval, etc.).
- An issue **moves to blocked** and needs an unblock action from the operator.
- A **deliverable is produced** and is ready for operator review (draft NDA, redlined contract, intake summary).
- An **approval is requested** before the agent takes an irreversible action (filing, send-to-client, payment).

Do not invoke for routine progress updates, internal handoffs between agents, or anything the operator does not need to act on.

## Required Environment

The operator configures these on the Paperclip agent via `inputs.env` in `.paperclip.yaml`:

- `POSSIBLAW_TEAMS_WEBHOOK_URL` — Microsoft Teams incoming webhook URL. Required. See `example-webhook-setup.md` for the click path and YAML stanza.
- `PAPERCLIP_BASE_URL` — Paperclip control plane base URL used to build the deep link. Optional. Defaults to `http://127.0.0.1:3100`.

The agent must read these from the environment at invocation time. Do not embed any webhook URL in this skill, in `.paperclip.yaml`, or in any committed file.

## Posting the Notification

The agent runs the following zsh-compatible shell snippet. Substitute the four variables (`KIND`, `MATTER_SUMMARY`, `ACTION_OR_PATH`, `ISSUE_PATH`) before posting. Always quote variables. Teams uses Adaptive Cards, not Block Kit; the payload below is a v1.4 Adaptive Card wrapped in the Teams message envelope.

```sh
# Preconditions
if ! command -v curl >/dev/null 2>&1; then
  paperclip comment "[NOTIFY:TEAMS_UNCONFIGURED] curl not available on this runner; cannot post Teams notification."
  exit 0
fi

if [ -z "${POSSIBLAW_TEAMS_WEBHOOK_URL:-}" ]; then
  paperclip comment "[NOTIFY:TEAMS_UNCONFIGURED] POSSIBLAW_TEAMS_WEBHOOK_URL is not set on this agent; the operator will not be paged in Teams. Configure inputs.env in .paperclip.yaml to enable Teams notifications."
  exit 0
fi

KIND="${KIND:-Gate fired}"                       # e.g. "Gate fired", "Deliverable ready", "Approval requested", "Blocked"
MATTER_SUMMARY="${MATTER_SUMMARY:-Matter update}"  # Redacted one-liner. Never include raw confidential client data.
ACTION_OR_PATH="${ACTION_OR_PATH:-Open the issue to continue.}"
ISSUE_PATH="${ISSUE_PATH:-/}"                    # e.g. "/issues/123"
BASE_URL="${PAPERCLIP_BASE_URL:-http://127.0.0.1:3100}"
ISSUE_URL="${BASE_URL%/}${ISSUE_PATH}"

payload=$(cat <<JSON
{
  "type": "message",
  "attachments": [
    {
      "contentType": "application/vnd.microsoft.card.adaptive",
      "contentUrl": null,
      "content": {
        "\$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
        "type": "AdaptiveCard",
        "version": "1.4",
        "body": [
          { "type": "TextBlock", "size": "Large", "weight": "Bolder", "text": "${KIND}" },
          { "type": "TextBlock", "wrap": true, "text": "**Matter**: ${MATTER_SUMMARY}" },
          { "type": "TextBlock", "wrap": true, "text": "**Action**: ${ACTION_OR_PATH}" }
        ],
        "actions": [
          {
            "type": "Action.OpenUrl",
            "title": "Open in Paperclip",
            "url": "${ISSUE_URL}"
          }
        ]
      }
    }
  ]
}
JSON
)

http_status=$(curl -sS -o /tmp/notify-teams.out -w "%{http_code}" \
  -X POST \
  -H "Content-type: application/json" \
  --data "${payload}" \
  "${POSSIBLAW_TEAMS_WEBHOOK_URL}")

# Teams returns 200 with body "1" on success for legacy connectors,
# or 202 for the newer Workflows-based webhook. Treat 2xx as success.
case "${http_status}" in
  2*) ;;
  *)
    paperclip comment "[NOTIFY:TEAMS_FAILED] Teams webhook returned HTTP ${http_status}. Body: $(cat /tmp/notify-teams.out)"
    exit 0
    ;;
esac
```

## Fallback Behaviour

If `POSSIBLAW_TEAMS_WEBHOOK_URL` is unset, or `curl` is missing, or the webhook returns a non-2xx status, the agent must **not** fail silently. Post a Paperclip comment on the same issue prefixed with `[NOTIFY:TEAMS_UNCONFIGURED]` (env missing) or `[NOTIFY:TEAMS_FAILED]` (HTTP error) and proceed with the workflow. The operator will still see the comment in Paperclip even if Teams delivery did not happen.

## Security Notes

- Webhook URLs are credentials. Never echo `${POSSIBLAW_TEAMS_WEBHOOK_URL}` to logs, never commit it to the repo, and never paste it into a Paperclip comment.
- Never include raw confidential client data (party names of sealed matters, settlement amounts, privileged communications, PII) in the Teams message body. Use the matter title plus a redacted one-line summary. If the matter title itself contains confidential text, summarise it (for example `Matter 2026-014 (sealed) — NDA review ready`) rather than relaying verbatim.
- If you are unsure whether a field is safe to relay, default to the redacted summary and link the operator into Paperclip for the full content.

## Eval (Given/When/Then)

**Happy path.** *Given* `POSSIBLAW_TEAMS_WEBHOOK_URL` is configured and reachable, *when* the agent invokes this skill with a valid kind, summary, action, and issue path, *then* the curl call returns 2xx and an Adaptive Card appears in the configured Teams channel with title, matter summary, action, and a working "Open in Paperclip" button.

**Edge case.** *Given* the operator has not configured `POSSIBLAW_TEAMS_WEBHOOK_URL`, *when* the agent invokes this skill, *then* no exception is raised, no HTTP call is attempted, and a Paperclip comment is posted on the issue prefixed with `[NOTIFY:TEAMS_UNCONFIGURED]` so the operator still has a paper trail.

**Failure / security case.** *Given* the operator placed confidential client text (a sealed party name, a settlement amount) in the matter title, *when* the agent invokes this skill, *then* the Teams payload contains only a summarised redaction (for example `Matter 2026-014 (sealed) — NDA review ready`) and the deep link to Paperclip, not the raw confidential text. The webhook URL is never echoed to logs or comments.
