---
name: employment-separation-playbook
description: Draft separation agreements, severance terms, and release language when a separation matter arrives, producing a markdown work product with consideration-period placeholders and defaults for missing facts.
metadata:
  sources:
    - path: companies/legal-operations/skills/employment-separation-playbook/SKILL.md
      kind: local-file
      usage: vendored
      license: Apache-2.0
      attribution: PossibLaw
---

# Separation Agreement Playbook

Use this skill to draft a separation agreement with severance terms and release language. Apply the defaults below when the operator has not provided contrary instructions, and mark missing legal or business facts with bracket placeholders. Separation matters are sensitive: when the matter's `metadata.possiblaw.privacyTier` is `confidential` or `privileged`, run the `privacy-encoder` flow before any cloud-capable call and decode the final output before posting.

## When To Invoke

- The issue requests a new separation agreement, severance terms, release language, or revisions to a prior PossibLaw separation draft.
- Run the privacy-tier check before any other step; the encoder decision precedes fact gathering when matter content will reach a cloud-capable model.
- Do not invoke for offer letters, policy reviews, or performance-management questions; those belong to other specialists in the employment practice.

## Drafting Steps

1. Gather facts from the issue: employee name and role, separation date and reason category, severance amount or weeks, benefits continuation terms, equity treatment, release scope, non-disparagement expectations, return-of-property items, reference handling, jurisdiction, and whether the employee is or may be age 40 or older.
2. Draft the agreement structure in order:
   - Recitals: parties, employment history summary, and the fact of separation, without characterizing fault.
   - Separation terms: last day of employment, final pay, accrued vacation treatment, and equity treatment or an `[EQUITY TREATMENT]` placeholder.
   - Consideration: severance amount or weeks, payment schedule, and the statement that severance is conditioned on the agreement becoming effective.
   - Release of claims: a general release through the effective date, scoped per the issue or the default below.
   - Release exceptions: a `[RELEASE EXCEPTIONS]` placeholder for claims that cannot be released by law; do not enumerate or resolve them in the draft.
   - Confidentiality and non-disparagement: confidentiality of agreement terms and mutual non-disparagement, with a bracketed note that some jurisdictions limit the scope of these clauses.
   - Return of property: company equipment, credentials, documents, and data, with a `[PROPERTY LIST]` placeholder when items are unspecified.
   - References: the agreed reference statement or a `[REFERENCE PROTOCOL]` placeholder.
   - Breach and remedies: consequences of breach and any severance clawback terms the operator specified.
   - Signature blocks: company signatory and employee with name, title, date, and an effective-date line tied to any revocation period.
3. Insert consideration-period placeholders. Where the employee is or may be age 40 or older, add `[21-DAY CONSIDERATION PERIOD — confirm ADEA/OWBPA applicability]` plus a revocation-period placeholder; for group terminations, use `[45-DAY CONSIDERATION PERIOD — confirm ADEA/OWBPA group-termination applicability]`. Flag each as an operator follow-up; do not advise on whether the requirement applies.
4. Apply defaults. Fill every remaining gap from the defaults table in the drafting agent's instructions, and list each default used.
5. Produce the output in the format below.

## Output Format

- A single well-structured markdown document: title, parties block, recitals, numbered sections in the order above, and signature blocks.
- A short `Assumptions and open items` section before the agreement body listing every placeholder, default, consideration-period flag, and operator follow-up.
- Preserve operator-specified names, figures, dates, and special terms exactly as given.

## Boundaries

- Do not assess the strength, value, or likelihood of any claim by or against the employee.
- Do not advise on whether ADEA/OWBPA or any other statutory requirement applies; flag and route to the operator.
- Do not transmit the document to the employee, their counsel, or any external party or system; the draft is a work product pending operator approval.
- For confidential or privileged matters, never send unencoded matter content to a cloud-capable model; the privacy-encoder flow is mandatory.
