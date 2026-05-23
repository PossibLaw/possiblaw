# Microsoft Teams Webhook Setup (Operator Guide)

This is a one-page walk-through for wiring a Microsoft Teams incoming webhook into PossibLaw so the `notify-teams` skill can page you when an agent hits a gate, blocker, deliverable, or approval.

## 1. Permissions check

You need to be a **workspace / team owner** (or have been delegated permission to manage connectors) on the Microsoft Teams team that will receive the notifications. If you do not have owner rights, ask your Microsoft 365 admin to either grant ownership of the target team or to create the webhook for you.

## 2. Create the Teams incoming webhook

Click path inside Microsoft Teams:

1. Open the team and the **specific channel** that should receive PossibLaw notifications (for example `possiblaw-ops`).
2. Click the **`...`** (more options) next to the channel name → **Manage channel** → **Connectors** (older path: channel `...` → **Connectors**).
3. In the connector list, find **Incoming Webhook** and click **Configure**. If you do not see it, your tenant may require the admin to allow third-party connectors first.
4. Give it a name (`PossibLaw`) and, optionally, upload an icon.
5. Click **Create**.
6. Copy the **Webhook URL** that Teams displays. It looks like `https://<tenant>.webhook.office.com/webhookb2/.../IncomingWebhook/.../...`.
7. Click **Done**.

Treat that URL as a credential. Anyone with it can post into your channel.

> Note: Microsoft is migrating from classic Office 365 connectors to **Workflows-based** webhooks. If your tenant has already cut over, the click path is **`...` next to the channel → Workflows → "Post to a channel when a webhook request is received"**, then copy the generated URL. The `notify-teams` skill works with either flavour — both accept Adaptive Card payloads via POST.

## 3. Configure the Paperclip agent

Add `POSSIBLAW_TEAMS_WEBHOOK_URL` to the agent's `inputs.env` in your `.paperclip.yaml`. Read the value from your shell environment so the URL never lands in the repo:

```yaml
agents:
  - id: legal-operations-lead
    inputs:
      env:
        POSSIBLAW_TEAMS_WEBHOOK_URL: ${POSSIBLAW_TEAMS_WEBHOOK_URL}
        PAPERCLIP_BASE_URL: ${PAPERCLIP_BASE_URL:-http://127.0.0.1:3100}
```

Then export the value in the shell that launches Paperclip (or place it in a local, gitignored `.env` your runner sources):

```sh
export POSSIBLAW_TEAMS_WEBHOOK_URL="https://<tenant>.webhook.office.com/webhookb2/.../IncomingWebhook/.../..."
```

If you run more than one Paperclip agent that should page Teams, add the same `inputs.env` stanza to each.

## 4. Smoke-test the webhook

Run this from the same shell that has the env var exported. macOS zsh:

```sh
curl -X POST \
  -H 'Content-type: application/json' \
  --data '{"text":"PossibLaw test"}' \
  "$POSSIBLAW_TEAMS_WEBHOOK_URL"
```

You should see the literal response body `1` (classic connector) or HTTP 202 with an empty body (Workflows-based webhook), and a `PossibLaw test` message in the Teams channel within a few seconds. If you do not, double-check:

- The env var is set in the current shell (`echo "${POSSIBLAW_TEAMS_WEBHOOK_URL:0:40}"` should show the start of a Teams URL).
- The connector / workflow is still enabled in the Teams channel.
- Your tenant allows incoming webhooks (some Microsoft 365 admin policies block third-party connectors by default).

## 5. Security caveats

- Webhook URLs are credentials. Anyone with the URL can post arbitrary messages into your channel.
- **Never commit** the URL. Keep it in your shell, in a gitignored `.env`, or in a secret manager (1Password, macOS Keychain, Azure Key Vault).
- Do not paste the URL into Paperclip comments, GitHub issues, screenshots, or shared docs.
- Rotate the webhook (delete and recreate the connector / workflow in Teams) if it ever leaks or if a team owner with access leaves the firm.
- Teams incoming webhooks bypass per-user permissions — anything posted is visible to everyone in the channel. Pick the channel accordingly.
