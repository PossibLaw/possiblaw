---
name: will-drafting-playbook
description: Draft a simple-will skeleton when a will-drafting matter arrives, producing a markdown work product with fiduciary, dispositive, residuary, and guardianship articles, defaults for missing facts, and jurisdiction-flagged execution formalities.
metadata:
  sources:
    - path: companies/legal-operations/skills/will-drafting-playbook/SKILL.md
      kind: local-file
      usage: vendored
      license: Apache-2.0
      attribution: PossibLaw
---

# Will Drafting Playbook

Use this skill to draft a simple-will skeleton. Apply the defaults in the drafting agent's instructions when the operator has not provided contrary facts, mark missing facts with bracket placeholders, and treat every execution formality as jurisdiction-dependent. The skeleton is a work product; nothing drafted under this skill is executed, witnessed, or sent to anyone.

## When To Invoke

- The issue requests a simple will or a will skeleton for a named or placeholder testator.
- The issue requests revisions to an existing PossibLaw-drafted will skeleton; rerun the relevant steps against the prior draft and list what changed.
- Do not invoke for trust drafting, estate-inventory organization, or matters describing complex tax-driven structures; trusts and inventories belong to other specialists in the estates practice, and complex structures are operator escalations.

## Drafting Steps

1. Gather facts from the issue: testator name, marital status and family identification, minor children, executor and successor choices, guardian choices, specific bequests, residuary and contingent beneficiaries, and jurisdiction. If a required fact is absent and no acceptable default applies, gate with `missing-info-gate`; otherwise apply the defaults table in the drafting agent's instructions and record each default used.
2. Draft the articles in order:
   - Title and declaration: testator name, capacity recital, and express revocation of prior wills and codicils.
   - Family identification: spouse and children named, or placeholders, with a line for after-born children.
   - Fiduciary appointments: executor with `[SUCCESSOR EXECUTOR]` placeholder and a bracketed bond-waiver option.
   - Guardianship article: guardian and successor-guardian placeholders for minor children. Include this article whenever minor children are indicated or family status is unknown; when no minor children are indicated, retain it as a bracketed-optional article. Do not decide whether guardianship nominations are needed.
   - Specific bequests: stated bequests exactly as given, or a `[SPECIFIC BEQUESTS]` placeholder section.
   - Residuary clause: residue to `[RESIDUARY BENEFICIARY]` with a `[CONTINGENT BENEFICIARY]` placeholder if the primary does not survive.
   - Fiduciary powers: broad enumerated administrative powers with a `[POWERS — confirm against governing law]` flag.
   - Execution block: the placeholder `[EXECUTION FORMALITIES — jurisdiction-dependent: witness count, notarization, self-proving affidavit]`, flagged as an operator follow-up; never state any formality as settled.
3. Add signature and witness lines as placeholders only, repeating the jurisdiction-dependent flag beside them.
4. Build the `Assumptions and open items` section listing every placeholder, default used, execution-formality flag, and operator follow-up.
5. Produce the output in the format below.

## Execution-Formality Flags

- Witness counts, notarization, self-proving affidavits, and any signing-ceremony requirements vary by jurisdiction; each appears only as a placeholder routed to the operator or responsible attorney.
- Where the issue states a jurisdiction, carry it into the flag (`[EXECUTION FORMALITIES — confirm for [JURISDICTION]]`) without resolving the requirements.
- Spousal, family-protection, and elective-share considerations are flagged as operator follow-ups in `Assumptions and open items`, not addressed in the draft.

## Output Format

- A single well-structured markdown document, never a fragment or outline.
- Open with `Assumptions and open items`: every placeholder, default, execution-formality flag, and operator follow-up.
- Follow with the will skeleton in the article order above.
- Close with signature and witness placeholder lines carrying the jurisdiction-dependent flag.
- Preserve operator-specified names, relationships, bequests, and special terms exactly as given.

## Boundaries

- Do not advise on the validity or enforceability of the will, present execution formalities as settled for any jurisdiction, or predict how a court would treat any provision.
- Do not supervise, witness, or confirm execution, and do not compute estate or inheritance tax; organize and flag only.
- Do not transmit the draft to any external party or system — including the client or any court; the draft is a work product pending operator approval.
- Treat all matter content as sensitive personal data under the drafting agent's privacy rules.
