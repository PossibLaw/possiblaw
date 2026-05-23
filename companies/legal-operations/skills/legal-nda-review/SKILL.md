---
name: legal-nda-review
description: Triage an inbound NDA into GREEN, YELLOW, or RED against the operator's NDA playbook so attorney time is spent only on the NDAs that need it.
metadata:
  sources:
    - kind: github
      repo: anthropics/claude-for-legal
      path: commercial-legal/skills/nda-review/SKILL.md
      commit: b0aeeba
      url: https://github.com/anthropics/claude-for-legal/blob/b0aeeba/commercial-legal/skills/nda-review/SKILL.md
      license: Apache-2.0
      attribution: Anthropic, contributors to claude-for-legal
      usage: adapted
---

# NDA Triage

Use this skill to sort an inbound NDA into one of three buckets — GREEN (route to signature), YELLOW (specific items need a human's eyes), or RED (stop and talk to the responsible attorney). The goal is to keep attorney attention on the NDAs that actually carry risk and let the rest move.

## Purpose

Most inbound NDAs are fine. A few hide landmines. This skill sorts them in under a minute so the responsible attorney only reviews the ones that matter. A GREEN NDA should need nothing more than a signature. A YELLOW needs a focused review of one or two specific items. A RED stops before anyone wastes time on something that should not be signed.

## Load the Playbook First

Before triaging anything, identify two things:

1. **Which side is the operator on?** Sales-side (the counterparty is evaluating something the operator discloses) or purchasing-side (the operator is evaluating something the counterparty discloses). Mutual NDAs still have a side — whose paper is it and which direction is the evaluation running. If it is not obvious from the matter context, ask.
2. **What does the operator's NDA playbook say?** Read the operator's documented NDA positions (mutuality, term, survival, carveouts, governing law, restrictive covenants, fee-shifting, residuals). If the operator has no documented position on a term that comes up, surface the gap and ask before applying any default. Do not silently fill an attorney-set field.

If the operator has no attorney-reviewed NDA positions at all, do not issue GREEN. YELLOW is the right call when positions are missing — it surfaces the NDA to a human who can decide.

## Scope Check

Before reviewing NDA-specific provisions, check whether the document is doing more than its name suggests. Mutual commercial NDAs can hide standstills, license grants, exclusivity, non-solicits, non-competes, IP assignments, rights of first refusal, most-favored-nation clauses, and arbitration or jurisdiction clauses that govern far more than confidentiality disputes.

If the NDA contains obligations beyond confidentiality, auto-flag YELLOW regardless of the NDA-term analysis and call out the non-NDA provisions explicitly:

> This document is labeled an NDA but contains [standstill / license grant / non-solicit / exclusivity / IP assignment / ROFR / MFN / broad arbitration]. It is more than an NDA. Route for responsible-attorney review.

## The Triage

Classify the NDA into GREEN, YELLOW, or RED by applying the operator's playbook positions. The bucket definitions below are stable; the criteria that fill each bucket come from the playbook.

### GREEN — route to signature

The NDA satisfies every position in the operator's playbook, and no term triggers a RED flag. Confirm each playbook check before calling GREEN. GREEN is the only path to signature without attorney review and cannot be issued against default or absent positions.

If the operator is not the responsible attorney (for example a non-lawyer sales lead), even a GREEN result must be confirmed with the responsible attorney before the NDA is countersigned.

**Output for GREEN:**

```markdown
## NDA Triage: [Counterparty]

GREEN — route to signature

### Executive Summary

No red flags identified under the playbook. Route for signature per standard process.

| Check | Status | Playbook reference |
|---|---|---|
| [Each playbook check] | pass | [operator playbook section] |

**Next step:** [Send to the responsible attorney or approver for signature per the operator's standard NDA workflow.]
```

### YELLOW — needs a human's eyes on specific items

One or more terms deviate from the playbook but are not categorical deal-breakers, OR a term appears that the playbook does not address. Surface each item individually so the responsible attorney can make the call.

**Output for YELLOW:**

```markdown
## NDA Triage: [Counterparty]

YELLOW — flag for [approver name]

### Executive Summary

- [One-line actionable edit, e.g. "Strike non-solicit clause (Section 6)"]
- [One-line actionable edit]

### Flagged items

**1. [Issue]** — Section [X]
   What: [one line]
   Why flagged: [one line — the playbook position this hits, or "playbook is silent on this"]
   Legal risk: [Critical / High / Medium / Low]
   Business friction: [Blocks deals / Slows deals / Confuses customers / Invisible]
   Likely resolution: [accept / push back on X / depends on deal context]

[repeat for each flag]

### Everything else

| Check | Status | Playbook reference |
|---|---|---|
| [Checks that passed] | pass | [operator playbook section] |

**Next step:** Ask [approver] about the flagged items, then route to signature if they are okay with it.
```

### RED — stop, talk to the responsible attorney first

The NDA hits a position on the playbook's "never accept" list, or the structure of the agreement is incompatible with the operator's standard posture (for example a one-way NDA where the playbook requires mutual, a perpetual term where the playbook caps at a finite period, governing law on the "never" list).

**Output for RED:**

```markdown
## NDA Triage: [Counterparty]

RED — do not submit, talk to the responsible attorney first

### Executive Summary

- [One-line actionable edit, e.g. "Section 4 — route to the responsible attorney for review"]
- [One-line actionable edit]

### Critical issues

**1. [Issue]** — Section [X]
   > "[exact quote]"
   Why this is a problem: [specific risk; cite the playbook position it violates]
   Legal risk: [Critical / High / Medium / Low]
   Business friction: [Blocks deals / Slows deals / Confuses customers / Invisible]
   Recommended response: [use our paper instead | push back with specific language | walk]

**Next step:** Send this triage to the responsible attorney. Do not send to the standard NDA workflow. Do not tell the counterparty the operator will sign.
```

## Redline Granularity

Edit at the smallest possible granularity. A redline is a negotiation artifact, not a rewrite. Wholesale clause replacement signals "we threw out your drafting" — it is aggressive, it forces the counterparty to re-read the whole clause, and it discards the parts of their drafting that were fine. Surgical redlines — strike a word, insert a phrase, restructure a subclause — signal "we have specific asks" and are faster to read, understand, and accept.

Default to the smallest edit that achieves the playbook position:

- Replace a **word** before a phrase. ("twelve (12)" → "twenty-four (24)")
- Replace a **phrase** before a sentence. ("paid by the Buyer" → "paid and payable by the Buyer")
- Restructure a **subclause** before replacing the sentence. (Add "(a)" and "(b)" to split a compound condition.)
- Replace a **sentence** before replacing the clause.
- Only replace a **whole clause** when the counterparty's version is so far from the playbook position that surgical edits would be harder to read than a fresh draft — and when you do, say so in the transmittal: "We have replaced §8.2 rather than marking it up because the changes were extensive. Happy to walk you through the delta."

When in doubt, smaller.

## Jurisdiction Assumption

This triage applies the governing-law and restrictive-covenant positions recorded in the operator's playbook. Legal rules (enforceability of non-competes, non-solicits, fee-shifting, choice of law) vary materially by jurisdiction. If the NDA involves a jurisdiction outside the operator's configured posture, flag it in the output and note that the triage may not transfer as written.

## Output Rules

- **Complexity filter:** If addressing an issue would require drafting new language, restructuring a clause, or inserting substantive new provisions, do not attempt it. Instead write: "Section [X] — route to the responsible attorney for review." Only include simple, mechanical actions in the Executive Summary (strike, delete, replace a word or phrase).
- **Clean NDA rule:** If the NDA passes all checks with no flags, the Executive Summary should say only: "No red flags identified. Route for signature per standard process." Do not produce a lengthy report for a clean NDA.

## Detailed Check Reference

For each check below, the bucket (GREEN/YELLOW/RED) is determined by the operator's playbook. This skill lists the categories to check; it does not hardcode thresholds.

### Mutuality

Is the NDA mutual or one-way? Apply the operator's position. If the playbook does not address one-way NDAs for this context, run the one-way questionnaire below and surface the result for a human.

**One-way NDA questionnaire.** When the NDA is unilateral (one party discloses, the other only receives), do not immediately flag RED or exit. Ask:

> A one-way NDA is appropriate in some situations. Before flagging this, a few quick questions:
>
> 1. In this relationship, is the operator the only party disclosing confidential information?
> 2. Is this for a limited, specific disclosure — for example, sharing technology with a vendor who will work on it, but not sharing theirs back?
> 3. Is this related to M&A, employment, or investment? (If yes, stop — this skill is for commercial mutual NDAs only. Route to the responsible attorney.)

Use the answers plus the playbook position to decide GREEN/YELLOW/RED. If the playbook does not take a position on this fact pattern, flag YELLOW and surface the questionnaire answers for the approver.

### Definition of Confidential Information

Check scope (marked-only vs. everything-disclosed), marking requirements, and oral-disclosure confirmation windows. Apply the operator's position. If the playbook is silent on any of these, ask.

### Carveouts

The five carveouts typically present in an NDA:

1. Information that is or becomes public (other than through breach).
2. Information the receiving party already had.
3. Information independently developed without reference to the confidential information.
4. Information received from a third party without restriction.
5. Information required to be disclosed by law or court order, with notice to the disclosing party where legally permitted.

Which carveouts the operator requires, and how strictly, is a playbook question. Check the operator's playbook for required carveouts, acceptable variations in wording, and what happens when one is missing.

### Residuals

A residuals clause lets the receiving party use information retained in unaided memory. Whether this is acceptable — and under what conditions (for example narrow "unaided memory" wording versus broader scope covering notes or copies) — is a playbook question. If the playbook does not address residuals, ask.

### Term and Survival

Check the initial term length, the post-term survival period for confidentiality obligations, and whether trade secrets are carved out with longer protection. Apply the operator's position. If the playbook does not cover one of these, ask.

### Restrictive Covenants

Check for non-solicits (employee, customer), non-competes, exclusivity, and any restriction on who else the receiving party can engage. Apply the operator's position. If the playbook is silent, ask — restrictive covenants are jurisdiction-sensitive and the operator's posture matters.

### Attorneys' Fees

Check for fee-shifting provisions and whether they are mutual, one-sided, or prevailing-party. Apply the operator's position.

### Backup and Archival Carveout

Check whether the destruction or return clause includes an exception for standard backup and archival retention systems. Apply the operator's position — some teams require this carveout and will push to add it; others accept an NDA without it. If the playbook does not address this, ask.

### Governing Law

Apply the operator's governing-law and venue position. Flag any deviation.

## Counterparty Context

- **Large-enterprise NDAs:** Fortune 500 counterparties generally will not negotiate NDAs. Calibrate whether the RED flag is a true deal-breaker or "different from our form." If the business relationship matters, the call is whether to accept their paper — escalate that decision, do not make it.
- **Startup NDAs:** Smaller counterparties will usually take the operator's paper. If their NDA has issues, the fastest path is often "let's use ours" rather than redlining theirs.

## What This Skill Does Not Do

- It does not negotiate. It sorts.
- It does not draft an NDA. If the answer is "use our paper," the operator pulls their form from their standard NDA workflow.
- It does not make the call on YELLOW items. It surfaces them for a human.
- It does not state a position on any NDA term. Positions live in the operator's playbook.

## Closing Action

If the operator has a documented closing action (for example "send the full triage and the NDA to legal@operator.com before signing", or "submit to the standard NDA workflow"), append it verbatim at the end of every output. If the operator has not documented a closing action, append: "Route the final NDA through the operator's standard approval process."

## Evals

**Given** a mutual NDA from a vendor with a 2-year term, standard five carveouts, Delaware governing law, no non-solicit, and an operator playbook that accepts all of those terms,
**When** the skill runs,
**Then** the output is GREEN with a one-line Executive Summary and a passing check table, and no further drafting is produced.

**Given** a one-way NDA where the operator is the receiver, the playbook is silent on one-way NDAs in this context, and the document also contains a 12-month non-solicit,
**When** the skill runs,
**Then** the output is YELLOW with the non-solicit and the one-way posture surfaced as separate flagged items, the questionnaire is included, and the routing is to the named approver — not to signature.

**Given** an NDA with a perpetual confidentiality term, governing law on the operator's "never accept" list, and a hidden standstill clause,
**When** the skill runs,
**Then** the output is RED, the standstill is called out under the scope check, and the next step routes to the responsible attorney with explicit instructions not to send to the standard NDA workflow.
