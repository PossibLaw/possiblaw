---
name: legal-hiring-review
description: Review an offer letter and any restrictive covenants for the employee's actual work jurisdiction, researching enforceability and required notices per hire rather than relying on stored rules.
metadata:
  sources:
    - kind: github
      repo: anthropics/claude-for-legal
      path: employment-legal/skills/hiring-review/SKILL.md
      commit: b0aeeba
      url: https://github.com/anthropics/claude-for-legal/blob/b0aeeba/employment-legal/skills/hiring-review/SKILL.md
      license: Apache-2.0
      attribution: Anthropic, contributors to claude-for-legal
      usage: adapted
---

# Hiring Review

Use this skill to review an offer letter and any restrictive covenants for the employee's actual work jurisdiction. Offer letters are mostly boilerplate until they are not — the jurisdiction check and the restrictive-covenant check are where this skill earns its keep. The skill does not state the law from memory; every jurisdiction-specific rule is researched and cited at the time of review.

## Load the Playbook First

Before reviewing anything, pull from the operator's employment playbook:

- **Jurisdictional footprint** — which states or countries the operator already hires in, and the operator's documented positions for each.
- **Hiring review triggers** — which hires require what level of review.
- **Restrictive covenant policy** — does the operator use non-competes, customer non-solicits, employee non-solicits, confidentiality / IP assignment, and under what conditions.
- **Offer letter template location and version.**

If the operator has no documented employment playbook, surface the gap. Do not silently apply defaults — restrictive covenant policy in particular is a business-owner decision, not a skill-level call.

## Workflow

### Step 1: Jurisdiction

Where will this person work? Not where headquarters is — where *they* are.

- If remote: their home state or country governs.
- If hybrid: usually their home state, but check the offer letter's choice-of-law clause (may or may not hold up).

Check the operator's jurisdiction table for this state or country. If it is not in the table — first hire in this jurisdiction — flag it: "First hire in [jurisdiction]. The operator's jurisdiction table does not cover this. Research is needed before the offer goes out."

### Step 2: Classification

Exempt or non-exempt? The offer should say so, and the role should support it.

| Test | Check |
|---|---|
| Salary basis | Paid a fixed salary regardless of hours? |
| Salary level | Above the applicable federal and state thresholds? |
| Duties test | Does the role actually involve the exempt duties? |

> **Research before calling exemption.** Identify the currently operative salary thresholds (federal and state — several states index annually and several have tiered thresholds by employer size) and the applicable duties test(s) for the role. Cite primary sources. Verify currency.

If the offer says exempt but the role description does not support the exempt duties, flag it. Misclassification is expensive.

### Step 3: Restrictive Covenants

If the offer includes a non-compete, customer non-solicit, employee non-solicit, or confidentiality / IP assignment:

> **Research enforceability before advising.** For the employee's jurisdiction, identify the currently operative rules on each restrictive covenant in the offer. Non-compete enforceability has shifted in multiple states in recent years through legislation, agency action, and litigation — do not rely on prior memory of which states permit non-competes. Note:
> - The specific type of covenant (non-compete, customer non-solicit, employee non-solicit, confidentiality / trade-secret, IP assignment) — each has its own rules.
> - Any salary or income threshold that conditions enforceability.
> - Any notice, consideration, or garden-leave requirements.
> - Any industry-specific carve-outs (for example, healthcare, broadcasting).
> - Duration and geographic-scope reasonableness tests.
> - Choice-of-law and choice-of-forum enforceability for out-of-state covenants.
> Cite primary sources. Verify currency.

Apply the operator's restrictive covenant policy first — does this hire even get one? — then layer the jurisdiction-specific research on top.

> **No silent supplement.** If a research query to the configured research tool returns few or no results for the jurisdiction's exemption thresholds, restrictive-covenant rules, pay-transparency law, or any other item being researched, report what was found and stop. Do NOT fill the gap from web search or model knowledge without asking. Say: "The search returned [N] results from [tool]. Coverage appears thin for [jurisdiction / topic]. Options: (1) broaden the search query, (2) try a different research tool, (3) search the web — results will be tagged `[web search — verify]` and should be checked against a primary source before relying, or (4) flag as unverified and stop. Which would you like?" An attorney decides whether to accept lower-confidence sources.
>
> **Source attribution.** Tag every citation in the review with where it came from: `[Westlaw]`, `[CourtListener]`, or the tool name for citations retrieved from a legal research connector; `[web search — verify]` for web-search citations; `[model knowledge — verify]` for citations recalled from training data; `[user provided]` for citations supplied by the operator. Citations tagged `verify` carry higher fabrication risk and should be checked first. Never strip or collapse the tags.

### Step 4: Jurisdiction-Specific Requirements

Check the operator's jurisdiction table for this jurisdiction. Common categories to research for each hire:

- **Pay transparency** — does the jurisdiction require a salary range in the posting? If so, is this offer within the posted range? Research the current rule, including any recent amendments or enforcement guidance.
- **Ban-the-box** — does the jurisdiction or locality restrict the timing or scope of criminal-history inquiries?
- **Salary-history limits** — is the jurisdiction one that restricts asking about or relying on prior salary? Research current rules and recent amendments.
- **Required offer-letter or onboarding notices** — some jurisdictions require specific notices at offer or hire (wage-notice statutes, sick-leave notices, etc.). Research what is currently required and whether a template exists.

Cite primary sources. Verify currency.

### Step 5: Offer Letter Content

Read the letter. Check:

**Employment-at-will is US-only.** "At-will" means either party can terminate without cause or notice (subject to statutory exceptions). This concept does not exist outside the US:

- **US (most states)** — at-will is the default. Offer letters often include at-will language to defeat implied-contract arguments. Check that it is present if US.
- **Montana** — not at-will. The Wrongful Discharge from Employment Act requires cause after probation.
- **UK** — no at-will. Employees have statutory protections from day one (unfair dismissal after two years of service, automatic unfair dismissal for protected reasons from day one). The offer letter must contain the written statement of particulars (ERA 1996 s.1): pay, hours, notice period, holidays, pension, disciplinary / grievance procedures.
- **EU** — no at-will. Termination requires cause, notice, and often works council consultation or collective redundancy procedures. Offer letter requirements vary by member state but notice periods and written particulars are standard.
- **Australia** — no at-will. Fair Work Act minimum notice periods, unfair dismissal protections, NES.
- **Canada** — no at-will. Common-law reasonable notice (can be months), ESA minimums, wrongful dismissal exposure.
- **Singapore, other APAC** — no at-will. Employment Act and contract-based protections.

**Check for at-will language ONLY if the jurisdiction is US.** For non-US jurisdictions, check instead for: notice period (and whether it meets statutory minimum), the written-statement particulars the jurisdiction requires, probation period terms, and any jurisdiction-specific mandatory clauses.

**Never recommend adding at-will language to a non-US offer letter.** It is legally meaningless, it can conflict with mandatory statutory terms, and it signals to the employee's lawyer that the employer did not understand the jurisdiction.

Checklist:

- At-will language present and not undermined elsewhere (US only — see above).
- Contingencies clear (background check, reference, I-9 if US / right-to-work verification for the applicable jurisdiction).
- Start date, title, salary, reporting structure stated.
- Equity terms (if any) consistent with the plan.
- Integration clause so the letter is the whole deal.
- For non-US: notice period meets statutory minimum, jurisdiction's required written-statement particulars included, probation period compliant with local rules.

## Output

> **Jurisdiction assumption.** This review applies the rules of the employee's work jurisdiction identified in Step 1. Enforceability of restrictive covenants, exemption thresholds, pay-transparency obligations, salary-history limits, and required notices vary materially by state and locality, and several have shifted recently. If the candidate's work location changes, or the role spans jurisdictions, this review may not apply as written.

```markdown
## Hiring Review: [Candidate] — [Role] — [Jurisdiction]

**Overall:** [Clear to send | Changes needed | Escalate]

### Jurisdiction: [State/Country]
[Jurisdiction table entry. Any auto-escalate triggers that fire.]

### Classification
[Exempt/non-exempt call, grounded in researched thresholds and duties test. Any flags.]

### Restrictive covenants
[If any. Enforceability call per researched jurisdiction rules, with pinpoint cites and currency note. Suggested changes.]

### Jurisdiction-specific requirements
[Pay transparency, notices, salary-history rules, etc. — each researched and cited, or flagged as needing research.]

### Offer letter
[Any issues with the letter itself.]

### Action items
- [ ] [specific change needed before sending]
```

## What This Skill Does Not Do

- Draft the offer letter — it reviews one.
- Make the hire decision — it checks the paperwork.
- State restrictive-covenant or exemption rules from memory — every jurisdiction-specific call is based on researched, cited sources verified for currency.
- Research a new jurisdiction in depth on its own — it flags that research is needed and routes for follow-up.

## Evals

**Given** an offer letter for a remote software engineer based in California with a salary of $180K, an exempt classification, a non-compete clause, a customer non-solicit, and an at-will provision,
**When** the skill runs,
**Then** the output classifies the jurisdiction as California, researches and cites the current California rule that non-competes are largely unenforceable (with the at-the-time-of-review statutory cite tagged with source attribution), flags the non-compete for removal, evaluates the customer non-solicit under current California law, confirms the at-will language is appropriate for the US, and produces an "Overall: Changes needed" verdict with specific action items.

**Given** an offer letter for a first hire in a jurisdiction (for example, a UK-based contractor being converted to employee) where the operator's jurisdiction table has no entry,
**When** the skill runs,
**Then** the output flags "First hire in [jurisdiction]" and pauses for research, identifies that at-will is inapplicable, lists the UK ERA 1996 s.1 written-statement particulars that must appear in the letter, surfaces notice-period and probation requirements as items to research and cite, and does not produce a "Clear to send" verdict without that research completed.

**Given** an offer letter where the role title is "Sales Coordinator" with a $52K salary and the offer marks the role exempt, and the configured research tool returns thin coverage on the current state-specific exemption thresholds,
**When** the skill runs,
**Then** the output flags the potential misclassification, does NOT silently fall back to web search or model knowledge for the threshold, surfaces the no-silent-supplement options to the operator, and tags any citation that does come through with the source attribution required by the playbook so an attorney can verify before relying on it.
