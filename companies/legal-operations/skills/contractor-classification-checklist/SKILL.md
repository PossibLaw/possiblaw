---
name: contractor-classification-checklist
description: Analyze a worker arrangement against control, integration, and economic-reality factor tests when a classification matter arrives, producing flag-only factor analysis tables with jurisdiction and agency variance flags.
metadata:
  sources:
    - path: companies/legal-operations/skills/contractor-classification-checklist/SKILL.md
      kind: local-file
      usage: vendored
      license: Apache-2.0
      attribution: PossibLaw
---

# Contractor Classification Checklist

Use this skill to run a structured, factor-by-factor analysis of a worker arrangement. The output is flag-only: each factor is flagged by direction with a cited rationale, and the classification decision itself goes to the operator or responsible counsel. The governing tests vary by jurisdiction and agency, so no single test is presented as the settled standard.

## Analysis Steps

1. Scope intake. Record the worker or role under analysis, the engaging entity, the documents supplied (contract, statement of work, invoices, schedules, policies), the described work facts, the jurisdictions where the work is performed, and any agencies or contexts the operator named (for example tax, wage-and-hour, benefits, unemployment). If the arrangement itself — the contract, the work facts, or both — is absent and no acceptable default applies, gate with `missing-info-gate` instead of guessing.
2. Build the fact inventory. List each documented fact about the arrangement with its source (contract section, invoice, schedule, operator statement). Where the written contract and the described practice diverge on the same point, record both versions as separate facts.
3. Analyze the control factors. For each, record the cited facts and a flag: who directs when, where, and how the work is done; training provided; tools, equipment, and systems supplied; supervision and reporting requirements; scheduling control; the right to delegate or substitute; and exclusivity or non-compete demands.
4. Analyze the integration factors. For each, record the cited facts and a flag: whether the services are part of the engaging entity's regular business; the duration and permanency of the relationship; whether the worker's role mirrors that of employees; and how the worker is presented to customers and the public.
5. Analyze the economic-reality factors. For each, record the cited facts and a flag: opportunity for profit or loss; the worker's investment in equipment or facilities; method of payment (hourly or salaried versus per-project); who bears expenses; other clients or markets served; the skill and initiative involved; and benefits and tax treatment as documented.
6. Apply the flag rules. Flag each factor `Employee-leaning`, `Contractor-leaning`, `Mixed`, or `[NOT PROVIDED]` with a one-line rationale tied to the cited facts. Never total, score, or weigh the flags into a verdict or recommended classification.
7. Record variance flags. Note that which factors govern, and how they are weighed, varies by jurisdiction and agency; list each jurisdiction and agency context the operator named as a variance flag for the operator or responsible counsel, and add a general variance flag when none was named. Record every contract-versus-practice divergence as its own flag.
8. Produce the factor analysis tables, variance and divergence flags, and summary in the format below.

## Factor Analysis Table Format

Produce one table per factor family (control, integration, economic reality):

| Factor | Facts observed | Flag | Rationale | Source |
|---|---|---|---|---|
| Factor name | Documented facts, or `[NOT PROVIDED]` | Employee-leaning / Contractor-leaning / Mixed / `[NOT PROVIDED]` | One-line rationale tied to the cited facts | Contract section, document, or statement cited |

## Summary and Next Actions

Close the analysis with:

- Flag counts by direction per factor family, presented as counts only, never as a verdict.
- `[NOT PROVIDED]` factors and the documents or facts that would resolve them.
- Variance and divergence flags, each routed to the operator or responsible counsel.
- A short ordered operator follow-up list, starting with the classification decision itself.

## Boundaries

- Do not classify the worker, recommend a classification, or compute any score or tally that implies one; the decision belongs to the operator or responsible counsel.
- Do not present any factor test as the settled standard, give jurisdiction-specific classification advice as settled, or predict how any agency or court would classify the arrangement.
- Do not transmit the analysis or the underlying documents to any external party or system; the analysis is a work product pending operator approval.
