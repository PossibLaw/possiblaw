# Operator Walkthrough

This is the repeatable smoke path for proving PossibLaw as a Paperclip package.

## Goal

Start a clean Paperclip instance, import `companies/legal-operations`, open the localhost UI, and run the starter NDA matter through the imported company. The package now ships an expanded org chart, missing-info gates, notification skills, output-to-disk skills, and a reversible privacy encoder, in addition to the NDA vertical slice.

## Prerequisites

- Node.js and pnpm available.
- Paperclip dependencies installed in `paperclip/`.
- Codex CLI authenticated for the local user. If needed, run:

```bash
codex login --device-auth
```

- (Optional) `pandoc` installed if you want DOCX deliverables in addition to Markdown:

```bash
brew install pandoc
```

## Environment Variables (Optional)

The package declares these via `inputs.env` in `.paperclip.yaml`. All are optional; sensible defaults apply when omitted. You can provide them in the shell that starts Paperclip, or wire them into agent secrets via the Paperclip UI after import.

| Variable | Used by | Purpose | Default |
|---|---|---|---|
| `PAPERCLIP_BASE_URL` | chief-of-staff, chief-counsel | Builds notification deep-links back to issues | `http://127.0.0.1:3100` |
| `POSSIBLAW_SLACK_WEBHOOK_URL` | chief-of-staff, chief-counsel | Slack incoming webhook (see `companies/legal-operations/skills/notify-slack/example-webhook-setup.md`) | unset → comment-only fallback |
| `POSSIBLAW_TEAMS_WEBHOOK_URL` | chief-of-staff | MS Teams incoming webhook | unset → comment-only fallback |
| `POSSIBLAW_DELIVERABLES_DIR` | nda-drafter, contract-reviewer | Where written deliverables land | `$HOME/PossibLaw/deliverables` |
| `POSSIBLAW_PRIVACY_KEY_DIR` | nda-drafter, contract-reviewer | Reversible privacy-encoder key store | `$HOME/.possiblaw/privacy-keys` |
| `POSSIBLAW_PRIVACY_WORDLIST` | nda-drafter, contract-reviewer | Operator-supplied confidential terms | unset |
| `POSSIBLAW_PRIVACY_MONEY_FLOOR` | nda-drafter, contract-reviewer | Currency redaction threshold (USD) | `10000` |

Webhook URLs are credentials — keep them out of the repo. Either set them per-shell or store them in Paperclip's secrets and bind by reference after import.

## Terminal 1: Start Paperclip

From the repo root:

```bash
cd /Users/salvadorcarranza/possiblaw/paperclip
export POSSIBLAW_DEMO_DATA_DIR="$(mktemp -d /tmp/possiblaw-paperclip.XXXXXX)"
pnpm paperclipai run --data-dir "$POSSIBLAW_DEMO_DATA_DIR" --instance possiblaw-demo --bind loopback
```

Keep this terminal open. Paperclip prints the localhost URL. The default is `http://localhost:3100`; if that port is busy, Paperclip selects the next free port and prints it.

## Terminal 2: Import The Package

Use the same data directory and the API URL printed by Terminal 1:

```bash
cd /Users/salvadorcarranza/possiblaw/paperclip
export POSSIBLAW_DEMO_DATA_DIR="/tmp/possiblaw-paperclip.REPLACE_ME"
export PAPERCLIP_API_URL="http://127.0.0.1:3100"

pnpm paperclipai company import ../companies/legal-operations \
  --data-dir "$POSSIBLAW_DEMO_DATA_DIR" \
  --api-base "$PAPERCLIP_API_URL" \
  --target new \
  --dry-run

pnpm paperclipai company import ../companies/legal-operations \
  --data-dir "$POSSIBLAW_DEMO_DATA_DIR" \
  --api-base "$PAPERCLIP_API_URL" \
  --target new \
  --yes
```

Expected import preview:

- company create
- 11 agents create
- 20 skills packaged
- 1 project create
- 1 task create
- 2 routines create

If the importer prompts for env-input values, the optional defaults documented above are safe to accept.

## UI Demo

1. Open the localhost URL from Terminal 1.
2. Select `PossibLaw Legal Operations`.
3. Open `NDA Matters`.
4. Open `Draft Mutual NDA Demo`.
5. Trigger or assign the issue to `Chief of Staff`.
6. Confirm that the issue route goes `Chief of Staff` → `Chief Counsel` → `Commercial Lead` → `NDA Drafter`.
7. Confirm `NDA Drafter` writes the deliverable to `$POSSIBLAW_DELIVERABLES_DIR/possiblaw-legal-operations/nda-matters/draft-mutual-nda-demo/<timestamp>-mutual-nda-acme-globex.md` and posts the absolute path as a comment.

The starter task contains the regulated-work note at matter intake. Generated NDA work product should not append repeated disclaimer boilerplate.

## Exercising Other Capabilities

### Missing-information gate

Open a new issue under `NDA Matters` with only "Draft an NDA" as the body (no parties, no purpose). Chief of Staff → Commercial Lead → NDA Drafter should escalate via the `missing-info-gate` skill: the issue moves to `blocked` and a structured `Missing Information Gate` comment lists the required fields. The operator answers in a comment beginning with `RESUME:` and the agent picks back up.

### Notification

If `POSSIBLAW_SLACK_WEBHOOK_URL` is configured, the gate comment also fires a Slack message with a deep-link to the issue. With no webhook configured, the agent posts a `[NOTIFY:SLACK_UNCONFIGURED]` comment instead and continues — never silent.

### Contract review specialist

Create a new issue under `NDA Matters` with body "Review this MSA: <paste>". Commercial Lead routes to `contract-reviewer`, which uses `legal-contract-review-dispatcher` to classify, then `legal-saas-msa-review` for the actual review with structured GREEN/YELLOW/RED clause findings.

### Routines

The package declares two routines in `.paperclip.yaml`:

- `nightly-conflicts-check` — runs `0 2 * * *` America/Chicago, intended for Chief Counsel to scan open matters for conflicts notices.
- `weekly-renewal-scan` — runs `0 9 * * MON`, intended for Chief Counsel to run `legal-renewal-tracker` against contract artifacts.

Routine binding to a specific recurring issue is operator-configurable in the Paperclip UI after import.

### Privacy encoder

Mark a matter with `metadata.possiblaw.privacyTier: confidential`. `NDA Drafter` invokes the `privacy-encoder` skill before any cloud-capable call: confidential party names, contact info, money figures, etc. are replaced with stable placeholders, a per-matter key file is written to `$POSSIBLAW_PRIVACY_KEY_DIR/<matter-id>.json` with `600` perms, the cloud model sees only the masked text, and the agent decodes the response before posting.

## Adapter Notes

The package defaults to `codex_local` in `.paperclip.yaml` because the current validated smoke path uses Codex CLI subscription auth through Paperclip. Per-role lanes are encoded via `modelReasoningEffort`:

- `high` — chief-of-staff, chief-counsel, commercial-lead, nda-drafter, contract-reviewer (decision/judgment heavy)
- `medium` — finance-lead, marketing-lead, admin-lead, billing-prep, intake-form-drafter, calendar-coordinator (routing/extractive work)

After import, use Paperclip's agent environment test for one imported agent and confirm the Codex hello probe succeeds. Operators can switch individual agents to `claude_local` or another Paperclip adapter in the UI after import.

## Runtime Troubleshooting

If Codex reports a subscription usage limit during the live demo, Paperclip should leave the affected issue visible as `blocked` with an adapter failure or recovery note. Wait for the quota reset, add credits, or switch the affected agents to another working adapter/model before resuming the blocked issue.

If a recovery run reports that a fallback model is unsupported for the current ChatGPT account, keep the package default on the supported `gpt-5.3-codex` lane and resume after the account/model issue is resolved.

If `output-local-docx` reports BLOCKED with `pandoc not installed`, run `brew install pandoc` and retry; the markdown deliverable still wrote successfully.

If `privacy-encoder` reports the key directory is on a synced cloud folder (iCloud, Dropbox, OneDrive, Google Drive), the warning is non-blocking. Move the key dir off the sync target if you need the matter to be local-only.

## Reset

The walkthrough uses an isolated data directory. Removing that directory removes the demo instance state:

```bash
rm -rf "$POSSIBLAW_DEMO_DATA_DIR"
```

Privacy-encoder key files in `$POSSIBLAW_PRIVACY_KEY_DIR` are NOT cleaned by removing the data dir — they live in the operator's home directory by default. Remove explicitly if a matter must be unrecoverable:

```bash
rm -rf "${POSSIBLAW_PRIVACY_KEY_DIR:-$HOME/.possiblaw/privacy-keys}"
```
