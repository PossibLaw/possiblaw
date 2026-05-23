---
name: Weekly Renewal Scan
slug: weekly-renewal-scan
assignee: chief-counsel
project: nda-matters
recurring: true
routine:
  concurrencyPolicy: coalesce_if_active
  catchUpPolicy: skip_missed
  triggers:
    - kind: schedule
      cronExpression: "0 9 * * 1"
      timezone: America/Chicago
      enabled: true
---

Run `legal-renewal-tracker` against the configured contract artifacts to flag any agreement whose renewal or cancellation deadline falls within the next 60 days. Group findings by deadline distance (this week / next 2 weeks / next 30-60 days) and post the summary as a Paperclip comment.

If the configured `POSSIBLAW_DELIVERABLES_DIR` contains contracts to scan, walk that directory. If no contracts directory is configured, post a `missing-info-gate` BLOCKED comment listing what the operator must supply: contracts location, owner-of-record per contract, renewal-notification window preference.

For each flagged contract, include:
- Counterparty name
- Effective date
- Renewal type (auto-renew, manual, fixed term)
- Cancellation notice period
- Days until the deadline
- Owner / action

Send an aggregate notification via `notify-slack` (or `notify-teams`) if any HIGH-urgency (next 14 days) deadlines are surfaced.
