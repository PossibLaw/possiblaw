---
name: legal-saas-msa-review
description: Review a SaaS or subscription agreement with attention to the terms that compound over renewals — auto-renewal mechanics, price escalation, data portability, SLAs, subprocessors, and AI/ML training rights.
metadata:
  sources:
    - kind: github
      repo: anthropics/claude-for-legal
      path: commercial-legal/skills/saas-msa-review/SKILL.md
      commit: b0aeeba
      url: https://github.com/anthropics/claude-for-legal/blob/b0aeeba/commercial-legal/skills/saas-msa-review/SKILL.md
      license: Apache-2.0
      attribution: Anthropic, contributors to claude-for-legal
      usage: adapted
---

# SaaS / Subscription Agreement Review

Use this skill to review a SaaS or subscription agreement on top of a general vendor agreement review. SaaS deals carry a distinct risk profile — the dollars compound over renewals, the data accumulates, and the switching cost grows every month. This skill adds the SaaS-specific overlay on the terms that bite hardest in subscription deals.

## Purpose

Run the operator's general vendor playbook checks first (liability, indemnity, termination, governing law, warranties). Then apply the SaaS-specific overlay below. The output is a single integrated review memo, not two separate documents.

## Jurisdiction Assumption

SaaS terms — auto-renewal notice requirements, price-escalation caps, data-portability mandates, subprocessor rules — are jurisdiction-sensitive. California, New York, and EU rules diverge materially, and several US states have auto-renewal statutes that override private contract terms. This review applies the operator's positions, which assume the governing law recorded in the operator's playbook. If the agreement picks a different governing law, or the deal spans jurisdictions with statutory overrides (for example EU-based users, California consumers), flag it — the analysis may not transfer as written.

### No Silent Supplement

If a research query to the operator's configured legal research tool returns few or no results for a statutory override that might bear on the deal (auto-renewal statute, data-portability mandate, consumer-protection rule), report what was found and stop. Do not fill the gap from web search or model knowledge without asking. Say:

> The search returned [N] results from [tool]. Coverage appears thin for [jurisdiction / rule]. Options: (1) broaden the search query, (2) try a different research tool, (3) search the web — results will be tagged `[web search — verify]` and should be checked against a primary source before relying, or (4) flag as unverified and stop. Which would you like?

The responsible attorney decides whether to accept lower-confidence sources.

### Source Attribution

Where the review cites a statute, regulation, or case (for example a state auto-renewal law overriding contract terms), tag the citation: `[Westlaw]`, `[statute / regulator site]`, or the connector name for citations retrieved from a legal research connector; `[web search — verify]` for web-search citations; `[model knowledge — verify]` for citations recalled from training data; `[user provided]` for citations from the counterparty draft or operator files. Citations tagged `verify` carry higher fabrication risk and should be checked first. Never strip or collapse the tags.

## Load the Playbook

Determine which side the operator is on before applying the playbook. Usually obvious: if the counterparty is a SaaS vendor selling the operator their platform, the operator is purchasing-side. If the operator is the SaaS vendor and the counterparty is their customer, the operator is sales-side. If it is not obvious (a reseller arrangement, a white-label deal), ask.

Read the operator's general vendor playbook for the matching side first — that controls liability, indemnity, termination, and governing law. Then look for the operator's SaaS-specific positions covering auto-renewal notice windows, acceptable price escalators, data export rights, SLA thresholds, subprocessor approval rights, and deprecation notice. This skill does not ship defaults for these — the right numbers vary by deal size, vendor leverage, and the operator's risk tolerance. If the playbook does not address a SaaS-specific term that comes up in this review, ask before applying any default.

## SaaS-Specific Overlay

For each category below, list what you found in the contract and compare it to the operator's position. Do not apply hardcoded thresholds from this skill.

### 1. Auto-Renewal Mechanics

The single most common way a SaaS deal goes wrong: nobody notices the renewal-notice window and the operator is locked in for another year at a higher price.

Check each element and compare against the operator's SaaS positions:

- **Renewal term length** (same as initial, longer, multi-year auto-convert).
- **Notice-to-cancel window** (number of days before renewal).
- **Notice method** (email, written notice to legal, portal-only, certified mail).
- **Price on renewal** (same, CPI-capped, then-current list, uncapped discretionary).

Extract and record the exact renewal date and notice window regardless of whether any item is flagged. This feeds `legal-renewal-tracker`.

### 2. Price Escalation

Check each element against the operator's positions:

- **Annual escalator** (fixed percentage, CPI, uncapped, etc.).
- **Usage overage pricing** (published rate card, premium rate, unspecified).
- **Scope of "fees"** (subscription only versus "additional services" broadly defined).

### 3. Data Portability and Exit

When — not if — the operator leaves this vendor, can they get their data out? Check each element against the operator's positions:

- **Export format** (open or standard, proprietary-but-documented, "commercially reasonable").
- **Export availability** (self-serve anytime, on request during term, only at termination).
- **Post-termination access** (days available to export after termination).
- **Export cost** (free, time-and-materials, per-GB or per-record).
- **Deletion certification** (certified on request, none, vendor retains derivatives).

Vendor retention of "anonymized" or "aggregated" derivatives is a material position — confirm the operator's stance and flag either way.

### 4. Uptime and SLA

Only matters if the operator's business actually depends on this service being up. If it is a nice-to-have tool, skip this section — do not spend negotiating capital on SLAs for a survey tool.

Check each element against the operator's positions:

- **Uptime commitment** (percentage, or "commercially reasonable efforts").
- **Measurement period** (monthly, quarterly, annual).
- **Remedy** (service credits — how calculated, whether capped, whether sole remedy).
- **Scheduled maintenance exclusions** (defined window, advance notice, unlimited).
- **Credit-as-sole-remedy interaction with the liability cap.**

### 5. Subprocessors

This is a data protection issue but it is SaaS-specific because the subprocessor list changes over the life of the subscription.

Check each element against the operator's positions:

- **Current list** (published, on request, unavailable).
- **Change notification** (advance notice period, or none).
- **Objection rights** (blocking, notice-and-terminate, notice-only, none).

### 6. Service Changes and Deprecation

SaaS vendors change their product. Usually fine. Sometimes they deprecate the thing the operator bought.

Check each element against the operator's positions:

- **Material adverse changes** (right to terminate on material degradation, notice-only, unrestricted).
- **Deprecation notice period** for features the operator relies on.
- **Feature parity on replacement** (same price tier, higher tier).

## AI and Machine Learning Rights

Do not just check whether an AI training clause exists. The number-one emerging negotiation point in SaaS contracts is structurally more than a one-line existence check. Work through:

1. **Explicit grant.** Does the contract explicitly grant the vendor rights to use Customer Data, Customer Content, or Usage Data for AI training, model improvement, or ML development? Purchasing-side, this is usually a no — customer data training the vendor's models means the customer is subsidizing the vendor's product and possibly leaking competitive information. Sales-side, this is revenue if you get it, reputation risk if you abuse it.
2. **Implicit grant via policy.** Does the contract incorporate the vendor's privacy policy or terms of service by reference? Can the vendor add training rights via a unilateral policy update? Phrases like "The parties agree to the Provider's Privacy Policy as updated from time to time" are a training-rights grant waiting to happen. Watch for "service improvement" or "analytics" catch-alls and "usage data" definitions that carve logs and telemetry out of the Customer Data definition so data-use restrictions do not apply.
3. **Anonymization standard.** If the vendor claims it only trains on "anonymized" or "aggregated" data, what is the standard? "Anonymized" without a definition is weak. Does it meet GDPR Recital 26, HIPAA Safe Harbor, or a named standard? Is it reversible?
4. **Competitive contamination.** Does the vendor serve the operator's competitors? If so, training on the operator's data could leak competitive intelligence into outputs other customers see. Is there a competitive isolation commitment?
5. **Opt-out scope and durability.** If there is an opt-out, does it cover all AI uses or only some? Does it survive renewals and TOS updates? Is it per-user or per-org? Many vendors default to training and offer an opt-out buried in an admin console — check whether the contract makes the default explicit.
6. **Output ownership.** If the SaaS product is itself AI-generated (drafting, summarization, analysis), who owns the outputs? Can the vendor use the operator's outputs as training examples? Check third-party AI subprocessors too — the vendor may send customer data to a third-party LLM and the subprocessor list or data flow is where that shows up.
7. **Downstream regulatory chain.** Does the vendor's use of the operator's data for AI create regulatory exposure for the operator? EU AI Act deployer obligations, FTC §5 undisclosed data-sharing exposure, state AI laws.

Match each to a playbook position. If the agreement is silent on all seven, that is still a finding: "The agreement is silent on AI/ML training rights — request an explicit prohibition or a defined carve-out tied to each of the seven dimensions above."

## Liability Cap Decision Procedure

The cap amount is the least important part of the cap. Limitation-of-liability is not a single "check against playbook" item. Work through:

1. **Direct vs. indirect/consequential damages.** Does the cap apply to ALL liability, or only direct damages? A 12-month cap on direct damages with uncapped consequential damages is a completely different position than a 12-month aggregate cap. State both treatments explicitly.
2. **The cap base — quote it verbatim.** "12-month cap" could mean (a) fees paid in the 12 months preceding the claim, (b) fees payable in the current 12-month period, (c) fees over the last 12 months of usage, (d) fees under the current order form, or (e) total fees ever paid. These can differ by an order of magnitude. Quote the exact language. If ambiguous, flag it: "Cap base is ambiguous — `[the quoted language]` — could mean [X] or [Y]. Confirm before signing."
3. **Cap-carveout interaction.** A $100K cap with uncapped indemnity for data breach, IP, and confidentiality is functionally uncapped for the claims that actually arise in SaaS disputes. Enumerate what sits ABOVE the cap (the carveouts), what sits BELOW (what is actually capped), and assess whether the capped surface is meaningful.
4. **Operator playbook position per dimension.** The operator's playbook should have positions for direct cap (multiple of fees), indirect damages (excluded / capped / uncapped), carveout list (what is acceptable above the cap), and cap base (which definition the operator will accept). If the playbook has one "standard position" field, suggest splitting it into the four dimensions for more precise review.

## Jurisdiction Delta Check

The playbook applies one governing-law preference globally. Enforceability varies materially. Check the SaaS contract's actual governing law against the top divergences before accepting playbook positions at face value:

- **Non-solicits and non-competes:** Largely unenforceable in California (Bus. & Prof. Code §16600). Restricted in many EU jurisdictions. Enforceable with limitations elsewhere. `[jurisdiction — verify]`
- **Auto-renewal:** California GBL §§17600–17606, New York GBL §527-a, and Illinois 815 ILCS 601 have specific consumer or B2B notice requirements. Other states vary. `[jurisdiction — verify]`
- **Liability exclusions:** EU and UK unfair contract terms rules (UCTA 1977, Consumer Rights Act 2015) constrain consumer exclusions. Some US states limit exclusion of gross negligence or willful misconduct. `[jurisdiction — verify]`
- **Indemnification:** Some states void indemnification for the indemnitee's own negligence. `[jurisdiction — verify]`
- **Confidentiality term:** Some jurisdictions limit "perpetual" confidentiality to a reasonable period. `[jurisdiction — verify]`

When the playbook position conflicts with the contract's governing-law enforceability, flag: "Operator playbook prefers [X], but this contract is governed by [Y] law where [X] is [unenforceable / restricted / subject to statutory override]. `[jurisdiction — verify]`"

## Redline Granularity

Edit at the smallest possible granularity. A redline is a negotiation artifact, not a rewrite. Wholesale clause replacement signals "we threw out your drafting" — it is aggressive, it forces the counterparty to re-read the whole clause, and it discards the parts of their drafting that were fine. Surgical redlines — strike a word, insert a phrase, restructure a subclause — signal "we have specific asks" and are faster to read, understand, and accept.

Default to the smallest edit that achieves the playbook position:

- Replace a word before a phrase.
- Replace a phrase before a sentence.
- Restructure a subclause before replacing the sentence.
- Replace a sentence before replacing the clause.
- Only replace a whole clause when surgical edits would be harder to read than a fresh draft — and when you do, say so in the transmittal.

When in doubt, smaller.

## Output

Use the operator's vendor-review memo structure and add a SaaS-specific section after the standard playbook checks. Every SaaS-specific finding carries dual severity:

- **Legal risk:** Critical, High, Medium, Low.
- **Business friction:** Blocks deals, Slows deals, Confuses customers, Invisible.

Data-exit, auto-renewal, and price-escalation findings are the ones most likely to be Low legal / Critical business — the clause is enforceable, but it is the reason a customer cannot leave or a renewal surprises finance. Surface those at the business-friction severity, not the legal one.

```markdown
### Bottom line

[Can the operator sign / Need to fight for X first / Walk — one-sentence why]

### AI and machine learning rights

[The #1 emerging SaaS negotiation point. Flag: explicit ML training clauses, "service improvement" catch-alls, usage data definitions, output ownership, third-party AI subprocessors, opt-out vs opt-in. If the agreement is silent: "Silent on AI/ML training rights — request explicit prohibition or defined carve-out."]

## SaaS-specific findings

### Auto-renewal
**Renewal date:** [date]
**Notice window:** Cancel by [date] ([N] days before renewal)
**Renewal price mechanism:** [as written]
**Playbook fit:** [within position / deviation / not addressed]
**Flag for legal-renewal-tracker:** [yes — and the record the tracker needs]

### Price escalation
[findings against operator positions]

### Data exit
[findings — this is the one the business owner should read]

### SLA
[findings, or "Skipped — service is not business-critical per [stakeholder]"]

### Subprocessors
[findings against operator positions]

### Service changes
[findings against operator positions]
```

## Handoffs

**To `legal-renewal-tracker`.** When this skill finds the renewal date and notice window, hand them off. The renewal register expects:

```yaml
counterparty:         [name]
agreement:            [title]
signed_date:          [ISO date]
initial_term_end:     [ISO date]
renewal_mechanism:    [e.g., "auto-renew annual"]
notice_period_days:   [integer]
cancel_by_effective:  [ISO date — initial_term_end minus notice_period_days]
price_on_renewal:     [mechanism as written]
annual_value:         [integer, if stated]
business_owner:       [email, if known]
status:               active
```

Leave any field out that cannot be determined and note which fields were missing so a human can fill them in. `annual_value` and `business_owner` are especially likely to need human input.

**To escalation.** If any of the SaaS-specific checks hits the operator's "never accept" or escalation-trigger list, route to the named escalation owner.

## A Note on What to Fight Over

SaaS vendors, especially large ones, negotiate their paper about as willingly as airlines negotiate ticket terms. Pick battles per the operator's playbook — the SaaS positions section should distinguish between terms the operator always pushes on, terms the operator fights only for material deals, and terms the operator lets slide. If the playbook does not draw those lines, ask.

Calibrate based on contract value and switching cost. A $5K/year tool with easy alternatives gets a lighter touch than a $500K/year platform the operator will build on top of.

## Evals

**Given** a SaaS subscription agreement with a 12-month initial term, 60-day notice-to-cancel window, uncapped annual price escalation, a vendor-defined "Usage Data" carveout from Customer Data, and an operator playbook that requires a CPI-capped escalator and explicit prohibition on AI/ML training,
**When** the skill runs,
**Then** the output flags the price escalator and the AI/ML grant as YELLOW with surgical redline language, extracts the renewal date and notice window for `legal-renewal-tracker`, and notes that the "Usage Data" carveout is the primary risk vector for training rights.

**Given** a SaaS agreement governed by California law with a 30-day cancellation notice window and a 12-month liability cap with uncapped consequential damages,
**When** the skill runs and the operator playbook is silent on cap base and consequential damages,
**Then** the output applies the four-dimension liability cap procedure, quotes the cap base verbatim, calls out California's auto-renewal statute as a jurisdiction delta, and asks the operator to set positions on consequential damages and cap base before signing.

**Given** a SaaS agreement where the connected legal research tool returns no usable hits for a state-specific auto-renewal override,
**When** the skill runs,
**Then** the output stops short of asserting the statutory rule, surfaces the four options under the No Silent Supplement rule, and waits for the operator to choose how to proceed before continuing the review.
