---
name: legal-renewal-tracker
description: Maintain a renewal register, surface contracts with cancel-by deadlines coming up, and warn before notice windows close — receives handoffs from SaaS and vendor reviews.
metadata:
  sources:
    - kind: github
      repo: anthropics/claude-for-legal
      path: commercial-legal/skills/renewal-tracker/SKILL.md
      commit: b0aeeba
      url: https://github.com/anthropics/claude-for-legal/blob/b0aeeba/commercial-legal/skills/renewal-tracker/SKILL.md
      license: Apache-2.0
      attribution: Anthropic, contributors to claude-for-legal
      usage: adapted
---

# Renewal Tracker

Use this skill to keep a durable register of contract renewals and to surface the cancel-by deadlines that need attention before they pass. Nobody reads a contract twice — the renewal date is extracted once at review time and then lives somewhere that shouts at the operator 45 days before the deadline, not 45 days after.

## Purpose

This skill manages four things:

1. The renewal register (data store).
2. Ingest of new renewals from the review skills (`legal-saas-msa-review` and any vendor agreement review).
3. Surfacing what is coming up in a user-selectable window.
4. Surfacing missed cancel-by deadlines.

Tracking a renewal date is research. Acting on it — sending a notice of non-renewal, letting an auto-renewal fire, or countersigning a renewal form — is a consequential legal step and falls outside the scope of this skill. Surface the decision; do not make it.

## The Register

The register is a YAML or JSON file stored where the operator's matter or vendor stack expects it (for example a per-matter `renewal-register.yaml` in the operator's storage destination). Each entry uses this schema:

```yaml
- counterparty:        "Acme SaaS Inc."
  agreement:           "Acme Platform Subscription Agreement"
  signed_date:         2025-06-15
  initial_term_end:    2026-06-15
  current_term_end:    2026-06-15     # rolls forward after each auto-renewal; compute cancel_by_* from this
  renewal_mechanism:   "auto-renew annual"
  notice_period_days:  60
  notice_method:       "email"         # email / portal / certified mail / registered post / courier / per contract §X
  transit_buffer_days: 0               # 0 for electronic, 5 for domestic certified mail, 10 for international registered post
  cancel_by_calendar:  2026-04-16      # current_term_end minus notice_period_days
  cancel_by_effective: 2026-04-16      # rolled back to the last business day if needed
  send_by_effective:   2026-04-16      # cancel_by_effective minus transit_buffer_days — the date you must SEND the notice
  cancel_by_roll_note: ""              # e.g., "rolled back from Sunday 2026-11-01"
  cancel_by_provenance: "[model calculation — verify against the notice clause]"
  price_on_renewal:    "then-current list (uncapped)"
  annual_value:        48000
  business_owner:      "jane@operator.com"
  status:              "active"        # active | cancelled | renewed | lapsed
  notes:               "Pricing uncapped — revisit before renewal."
```

### Notice Transit Time — Alert Off `send_by_effective`

A 60-day window with a certified-mail requirement is really about 55 days. The tracker that alerts on the received-by date is the tracker that misses the deadline. Compute `send_by_effective = cancel_by_effective - transit_buffer_days` and fire alerts off `send_by_effective`. The urgency column shows `send_by_effective`; a detail column surfaces `cancel_by_effective`, `notice_method`, and `transit_buffer_days` so the reader can see the delta and challenge the buffer.

### Rolling Renewals — Compute From `current_term_end`

The register that does not roll forward is the register that is right once. Store `initial_term_end` for the record, but compute `cancel_by_*` from `current_term_end`. When a renewal fires (the cancel window passes and no notice was given), prompt:

> This contract auto-renewed on [date]. Update the register: new `current_term_end` is [date + renewal period], new `cancel_by_effective` is [computed], new `send_by_effective` is [computed]. Confirm?

After year one, `initial_term_end` is wrong and only `current_term_end` produces a correct cancel-by date.

## Business-Day Check on Every Cancel-By Date

The register's cancel-by date must be the last business day on which notice is effective, not the raw calendar date. A calendar date that falls on a weekend is the single most common way a renewal deadline gets missed. The register catches it.

When you compute or ingest a cancel-by date:

1. **Compute the calendar date.** `cancel_by_calendar = current_term_end − notice_period_days` (or whatever the clause specifies). This is the raw arithmetic.
2. **Business-day roll-back keyed to governing law.** The contract's governing law determines which holidays count. US: federal holidays plus the state's holidays if the governing law is a state. England & Wales: bank holidays. Germany: Feiertage, which vary by Bundesland — ask which. Canada: federal plus provincial. Singapore: public holidays. If Saturday, roll back to Friday. If Sunday, roll back to Friday. If a holiday in the governing-law jurisdiction, roll back to the prior business day. Roll BACK, never forward — forward means notice arrives after the window closes. For non-US governing law, if you cannot determine the holiday calendar, flag it: "Governing law is [X] — business-day roll-back uses US federal holidays as a placeholder. Verify against the [jurisdiction] holiday calendar before relying on the effective date."
3. **Check the contract's own day-counting rule.** Look for "business day," "received by," "deemed received," "5:00 p.m. [local time]," or a notice-method clause. If the contract defines "business day" or specifies receipt mechanics (certified mail, email with read receipt), that definition controls. Flag any mismatch between the default roll-back and the contract's own rule.
4. **Record both dates in the register.** `cancel_by_calendar` is the raw arithmetic; `cancel_by_effective` is the last business day on which notice is effective; `cancel_by_roll_note` records why they differ. Every computed `cancel_by_effective` carries a `cancel_by_provenance` tag of `[model calculation — verify against the notice clause]` so the verify flag travels with the date, not with the surrounding prose.
5. **Fire alerts off the effective date, not the calendar date.** Urgency bands use `cancel_by_effective` (or `send_by_effective` if `transit_buffer_days > 0`). The output should surface `cancel_by_calendar` and `cancel_by_roll_note` in a detail column where the roll-back happened, so the reader can see it and challenge it.

A report that prints `cancel_by: 2026-11-01` (a Sunday) with no weekday and no warning is a silently wrong effective deadline. Catch it once at ingest, not later when the window has already moved.

## Modes

### Mode 1: Ingest a Renewal (Handoff From Review)

When `legal-saas-msa-review` or a vendor agreement review finds a renewal clause, it hands off a record. Append it to the register. If the counterparty already has an entry, ask whether this is a replacement (renewed agreement) or an additional agreement.

### Mode 2: What's Coming Up

Default lookback window is the next 90 days. Urgency bands are half-open intervals — a deadline lives in exactly one band. Use days-until-cancel-by (`cancel_by_effective - today`, or `send_by_effective - today` when transit buffer applies). Day 14, 45, and 90 each belong to exactly one band; an off-by-one here puts the most-urgent items into the less-urgent bucket.

- **Critical** — 0 to 13 days (cancel-by in less than 14 days, including today).
- **High** — 14 to 44 days.
- **Medium** — 45 to 89 days.
- Anything 90+ days is outside the default lookback window; include it only if the operator specifies a longer horizon.

Output template:

```markdown
## Renewals — next 90 days

### Critical — cancel-by deadline in 0–13 days

| Counterparty | Cancel by | Renewal date | Annual $ | Owner | Notes |
|---|---|---|---|---|---|
| [name] | **[date]** | [date] | $[n] | [email] | [notes] |

### High — cancel-by deadline in 14–44 days

[same table]

### Medium — cancel-by deadline in 45–89 days

[same table]

---

**Recommended actions:**
- [ ] [Counterparty] — ping [business owner]: do we want to keep this?
- [ ] [Counterparty] — pricing is uncapped; get a quote from an alternative before we lose leverage
```

If the register has more than about ten renewals in the window, offer the operator a dashboard view: counts by urgency tier, a cancel-by timeline, and a sortable register with counterparty, renewal date, annual $, and owner.

### Mode 3: Bulk Load From an External Source

If the operator has a contract lifecycle management (CLM) tool or e-signature archive connected, this skill can bulk-load the register:

1. Query the CLM for all active agreements with a renewal-date field.
2. Query the e-signature archive for completed envelopes in the last 24 months whose metadata includes "subscription", "renewal", or "auto-renew".
3. For each hit, extract renewal mechanics and add to the register.
4. Flag any where the renewal date cannot be determined from metadata — those need a human to read the contract.

Mode 3 is a one-time bulk load. After that, ingest happens at review time via Mode 1.

### Mode 4: Missed Windows

```markdown
## Missed cancellation windows

The following agreements had cancel-by deadlines that have passed and no
cancellation was recorded:

| Counterparty | Cancel-by was | Renewal date | Status |
|---|---|---|---|
| [name] | [date] | [date] | Will auto-renew on [date] |

**Options:**
- Negotiate late cancellation (rarely works, but worth asking).
- Accept the renewal, mark next year's cancel-by now.
- Check the agreement for any other termination rights (for convenience, for cause).
```

## Gate: Accepting or Declining a Renewal

Tracking a renewal date is research. Acting on it — sending a notice of non-renewal, letting an auto-renewal fire, or countersigning a renewal form — is a consequential legal step.

Before proceeding to accept or decline a renewal, if the operator is a non-lawyer:

> This step has legal consequences (the operator is either committing to another term or terminating the relationship). Has this been reviewed with the responsible attorney? If yes, proceed. If no, here is a brief to bring to them:
>
> [Generate a one-page summary: counterparty, current term end and cancel-by date, renewal price mechanism, what happens if we do nothing, alternative vendors if we want to shop, and the three things to ask the attorney before the window closes.]

Do not proceed past this gate without an explicit confirmation.

## What This Skill Does Not Do

- It does not cancel contracts. It tells the operator when to decide.
- It does not decide whether to renew. It surfaces the deadline and the business owner.
- It does not read contracts to find renewal dates — that happens at review time. If a contract is in the register without a renewal date, it was added manually and someone needs to fill in the gap.
- It does not send notices, dial out to vendors, or amend the register without operator confirmation when an auto-renewal has already fired.

## Evals

**Given** a handoff from `legal-saas-msa-review` for an Acme subscription with `initial_term_end = 2026-06-15`, `notice_period_days = 60`, `notice_method = certified mail`, and `transit_buffer_days = 5`,
**When** this skill ingests the handoff,
**Then** the register entry records `cancel_by_calendar = 2026-04-16`, `cancel_by_effective = 2026-04-16` (a Thursday), and `send_by_effective = 2026-04-09`, and Mode 2 alerts fire off `send_by_effective`.

**Given** an existing register entry where `cancel_by_calendar = 2026-11-01` (a Sunday) with no recorded roll-back,
**When** the skill runs a Mode 2 report,
**Then** it rolls `cancel_by_effective` back to the prior business day (2026-10-30), records the roll-back in `cancel_by_roll_note` with the `cancel_by_provenance` tag, and shows both dates in the report so the reader can challenge the roll-back rule.

**Given** an existing register entry whose cancel-by date passed 7 days ago and `status = active` with no recorded cancellation,
**When** the skill runs a Mode 4 report,
**Then** the entry appears in the missed windows table, the skill surfaces the options for late cancellation, accepting the renewal, or checking other termination rights, and does not silently mark the entry as renewed without operator confirmation.
