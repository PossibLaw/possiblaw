---
name: notify-slack
description: Post a notification to Slack when an issue needs operator attention (gate fired, blocker, awaiting approval, deliverable ready). Uses a Slack incoming webhook URL from env.
metadata:
  sources:
    - path: companies/legal-operations/skills/notify-slack/SKILL.md
      kind: local-file
      usage: original
      license: Apache-2.0
      attribution: PossibLaw
---

# Slack Notification

Use this skill whenever the operator needs to be pulled into the loop. Paperclip does not have first-class notifications; this skill is the agent-side bridge that calls a Slack incoming webhook so the operator sees gates fire in real time.

## Trust boundary — UNRECEIPTED egress channel

**A Slack webhook POST bypasses the gate proxy.** It goes straight from this
runner to Slack's servers: no gate receipt is written, no human-approval gate
fires, and no confidentiality tier-floor applies to the message body. This is a
documented v1 exception. A gate-proxy notify tool that would receipt and gate
notifications is a later build — it does not exist yet, so the discipline below
is the only control on what leaves the boundary through this channel. It is
listed among the unreceipted egress channels in `docs/known-limitations.md`.

Because the channel is unreceipted, the message body is restricted to a **fixed,
low-sensitivity template** — not a free-text summary of the matter. Permitted
content is exactly:

- **matter slug** (the Paperclip issue slug/number, e.g. `POS-142` — not the
  matter *title*, which may carry client-identifying text),
- **issue URL** (the deep link back into Paperclip),
- **gate / blocked status line** (which gate fired, or that the issue is blocked
  / a deliverable is ready — a fixed phrase, not a description of the facts),
- **agent slug** (which agent is paging, e.g. `chief-of-staff`).

**NEVER put any of the following in a webhook message:** client or party names,
matter facts, dollar figures, document text, quotes from a work product, or
**anything drawn from an `UNTRUSTED-CONTENT` envelope**. Do not write a free-text
summary of matter content — the operator gets the detail by clicking through to
Paperclip, which is gated and access-controlled; Slack is not.

Compliant message (fill the four fields, nothing more):

```
Gate fired · POS-142 · chief-of-staff
Open in Paperclip → https://…/issues/142
```

If you cannot say what you need to say within that template, do not stretch the
template — post the detail as a Paperclip comment (gated, access-controlled) and
keep the Slack message to the slug + status + link.

## When to Invoke

Invoke this skill (do not wait for the operator to poll the Paperclip UI) when any of the following happens:

- A **gate fires** (matter intake conflicts check, NDA review checkpoint, billing approval, etc.).
- An issue **moves to blocked** and needs an unblock action from the operator.
- A **deliverable is produced** and is ready for operator review (draft NDA, redlined contract, intake summary).
- An **approval is requested** before the agent takes an irreversible action (filing, send-to-client, payment).

Do not invoke for routine progress updates, internal handoffs between agents, or anything the operator does not need to act on.

## Required Environment

The operator configures these on the Paperclip agent via `inputs.env` in `.paperclip.yaml`:

- `POSSIBLAW_SLACK_WEBHOOK_URL` — Slack incoming webhook URL. Required. See `example-webhook-setup.md` for the click path and YAML stanza.
- `PAPERCLIP_BASE_URL` — Paperclip control plane base URL used to build the deep link. Optional. Defaults to `http://127.0.0.1:3100`.

The agent must read these from the environment at invocation time. Do not embed any webhook URL in this skill, in `.paperclip.yaml`, or in any committed file.

## Posting the Notification

The agent runs the following zsh-compatible shell snippet. Substitute the four variables (`KIND`, `MATTER_SUMMARY`, `ACTION_OR_PATH`, `ISSUE_PATH`) before posting. Always quote variables.

```sh
# Preconditions
if ! command -v curl >/dev/null 2>&1; then
  paperclip comment "[NOTIFY:SLACK_UNCONFIGURED] curl not available on this runner; cannot post Slack notification."
  exit 0
fi

if [ -z "${POSSIBLAW_SLACK_WEBHOOK_URL:-}" ]; then
  paperclip comment "[NOTIFY:SLACK_UNCONFIGURED] POSSIBLAW_SLACK_WEBHOOK_URL is not set on this agent; the operator will not be paged in Slack. Configure inputs.env in .paperclip.yaml to enable Slack notifications."
  exit 0
fi

KIND="${KIND:-Gate fired}"                       # e.g. "Gate fired", "Deliverable ready", "Approval requested", "Blocked"
MATTER_SUMMARY="${MATTER_SUMMARY:-Matter update}"  # Matter SLUG + fixed status only (e.g. "POS-142"). Not a free-text summary of matter content. See "Trust boundary" — never client names, matter facts, document text, or UNTRUSTED-CONTENT.
ACTION_OR_PATH="${ACTION_OR_PATH:-Open the issue to continue.}"
ISSUE_PATH="${ISSUE_PATH:-/}"                    # e.g. "/issues/123"
BASE_URL="${PAPERCLIP_BASE_URL:-http://127.0.0.1:3100}"
ISSUE_URL="${BASE_URL%/}${ISSUE_PATH}"

payload=$(cat <<JSON
{
  "blocks": [
    { "type": "header", "text": { "type": "plain_text", "text": "${KIND}" } },
    { "type": "section", "text": { "type": "mrkdwn", "text": "*Matter*: ${MATTER_SUMMARY}" } },
    { "type": "section", "text": { "type": "mrkdwn", "text": "*Action*: ${ACTION_OR_PATH}" } },
    {
      "type": "actions",
      "elements": [
        {
          "type": "button",
          "text": { "type": "plain_text", "text": "Open in Paperclip" },
          "url": "${ISSUE_URL}",
          "style": "primary"
        }
      ]
    }
  ]
}
JSON
)

http_status=$(curl -sS -o /tmp/notify-slack.out -w "%{http_code}" \
  -X POST \
  -H "Content-type: application/json" \
  --data "${payload}" \
  "${POSSIBLAW_SLACK_WEBHOOK_URL}")

if [ "${http_status}" != "200" ]; then
  paperclip comment "[NOTIFY:SLACK_FAILED] Slack webhook returned HTTP ${http_status}. Body: $(cat /tmp/notify-slack.out)"
  exit 0
fi
```

## Fallback Behaviour

If `POSSIBLAW_SLACK_WEBHOOK_URL` is unset, or `curl` is missing, or the webhook returns a non-200 status, the agent must **not** fail silently. Post a Paperclip comment on the same issue prefixed with `[NOTIFY:SLACK_UNCONFIGURED]` (env missing) or `[NOTIFY:SLACK_FAILED]` (HTTP error) and proceed with the workflow. The operator will still see the comment in Paperclip even if Slack delivery did not happen.

## Security Notes

- Webhook URLs are credentials. Never echo `${POSSIBLAW_SLACK_WEBHOOK_URL}` to logs, never commit it to the repo, and never paste it into a Paperclip comment.
- Never include raw confidential client data (party names of sealed matters, settlement amounts, privileged communications, PII) in the Slack message body. This channel is unreceipted — keep the body to the fixed template in the "Trust boundary" section above (matter slug, issue URL, gate/blocked status line, agent slug). Do not relay the matter *title* (it may carry client-identifying text) or a free-text summary; the operator gets the detail by clicking through to Paperclip.
- If you are unsure whether a field is safe to relay, default to the fixed template (matter slug + status line + Paperclip link) — never a free-text or redacted summary.

## Eval (Given/When/Then)

**Happy path.** *Given* `POSSIBLAW_SLACK_WEBHOOK_URL` is configured and reachable, *when* the agent invokes this skill with a valid kind, summary, action, and issue path, *then* the curl call returns HTTP 200 and a Block Kit message appears in the configured Slack channel with header, matter summary, action, and a working deep link.

**Edge case.** *Given* the operator has not configured `POSSIBLAW_SLACK_WEBHOOK_URL`, *when* the agent invokes this skill, *then* no exception is raised, no HTTP call is attempted, and a Paperclip comment is posted on the issue prefixed with `[NOTIFY:SLACK_UNCONFIGURED]` so the operator still has a paper trail.

**Failure / security case.** *Given* the operator placed confidential client text (a sealed party name, a settlement amount) in the matter title, *when* the agent invokes this skill, *then* the Slack payload carries only the fixed template — the matter slug, a fixed status line, the agent slug, and the deep link to Paperclip (for example `Gate fired · POS-142 · chief-of-staff`) — never the matter title, a free-text summary, or the raw confidential text. The webhook URL is never echoed to logs or comments.
