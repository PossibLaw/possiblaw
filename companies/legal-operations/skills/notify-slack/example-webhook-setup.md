# Slack Webhook Setup (Operator Guide)

This is a one-page walk-through for wiring a Slack incoming webhook into PossibLaw so the `notify-slack` skill can page you when an agent hits a gate, blocker, deliverable, or approval.

## 1. Create the Slack incoming webhook

Reference: <https://api.slack.com/messaging/webhooks>

Click path inside Slack:

1. Open the workspace you want notifications in.
2. Click the workspace name (top left) → **Settings & administration** → **Manage apps**. This opens the Slack App Directory for your workspace.
3. In the App Directory search bar, type `Incoming Webhooks` and open the app.
4. Click **Add to Slack** (older path: **Custom Integrations** → **Incoming Webhooks** → **Add Configuration**).
5. Pick the channel that should receive PossibLaw notifications (for example `#possiblaw-ops`).
6. Click **Add Incoming WebHooks integration**.
7. Copy the **Webhook URL**. It looks like `https://hooks.slack.com/services/T000.../B000.../xxxxxxxxxxxx`.

Treat that URL as a credential. Anyone with it can post into your channel.

## 2. Configure the Paperclip agent

Add `POSSIBLAW_SLACK_WEBHOOK_URL` to the agent's `inputs.env` in your `.paperclip.yaml`. Read the value from your shell environment so the URL never lands in the repo:

```yaml
agents:
  - id: legal-operations-lead
    inputs:
      env:
        POSSIBLAW_SLACK_WEBHOOK_URL: ${POSSIBLAW_SLACK_WEBHOOK_URL}
        PAPERCLIP_BASE_URL: ${PAPERCLIP_BASE_URL:-http://127.0.0.1:3100}
```

Then export the value in the shell that launches Paperclip (or place it in a local, gitignored `.env` your runner sources):

```sh
export POSSIBLAW_SLACK_WEBHOOK_URL="https://hooks.slack.com/services/T000.../B000.../xxxxxxxxxxxx"
```

If you run more than one Paperclip agent that should page Slack, add the same `inputs.env` stanza to each.

## 3. Smoke-test the webhook

Run this from the same shell that has the env var exported. macOS zsh:

```sh
curl -X POST \
  -H 'Content-type: application/json' \
  --data '{"text":"PossibLaw test"}' \
  "$POSSIBLAW_SLACK_WEBHOOK_URL"
```

You should see the literal response body `ok` and a `PossibLaw test` message in the Slack channel within a second or two. If you do not, double-check:

- The env var is set in the current shell (`echo "${POSSIBLAW_SLACK_WEBHOOK_URL:0:30}"` should show the start of a Slack URL).
- The webhook is still active in Slack (workspace admins can disable it).
- The Slack channel still exists and the webhook is bound to it.

## 4. Security caveats

- Webhook URLs are credentials. Anyone with the URL can post arbitrary messages into your channel.
- **Never commit** the URL. Keep it in your shell, in a gitignored `.env`, or in a secret manager (1Password, macOS Keychain, AWS Secrets Manager).
- Do not paste the URL into Paperclip comments, GitHub issues, screenshots, or shared docs.
- Rotate the webhook (delete and recreate in the Slack admin UI) if it ever leaks or if a workspace member with access leaves the firm.
- Slack incoming webhooks bypass per-user Slack permissions — anything posted is visible to everyone in the channel. Pick the channel accordingly.
