---
name: claim-notice-playbook
description: Draft notices of claim and notices of circumstance when a claim-notice matter arrives, producing a markdown notice skeleton with defaults applied and the notice deadline flagged prominently.
metadata:
  sources:
    - path: companies/legal-operations/skills/claim-notice-playbook/SKILL.md
      kind: local-file
      usage: vendored
      license: Apache-2.0
      attribution: PossibLaw
---

# Claim Notice Playbook

Use this skill to draft a notice of claim or notice of circumstance to an insurer under an insurance policy. Apply the defaults in the drafting agent's instructions when the operator has not provided contrary instructions, mark missing facts with bracket placeholders, and keep the notice deadline at the top of the draft at all times.

## When To Invoke

- The issue requests a notice of claim, a notice of circumstance, or a notice update or supplement under an insurance policy.
- The issue requests revisions to an existing PossibLaw-drafted notice; rerun the relevant steps against the prior draft and list what changed.
- Do not invoke for coverage analysis or policy-renewal comparison; those belong to other specialists in the insurance practice.

## Drafting Steps

1. Gather facts from the issue: insured name, insurer name, broker contact, policy number and period, the policy's notice provision and its deadline and address, whether the matter is a claim or a circumstance, the date of loss or occurrence, the claimant or third party, the factual description, any amounts demanded or estimated, and the supporting documents available.
2. Surface the notice deadline first. Place the deadline — or `[NOTICE DEADLINE — CONFIRM]` when unknown — in a banner at the top of the draft with the policy number and insurer. A known notice deadline is the most time-critical fact in the draft; never leave it to body text.
3. Characterize the notice type. Draft as a notice of claim or notice of circumstance per the supplied facts; where the facts could support either, draft per the operator's instruction or the default in the drafting agent's instructions and mark the characterization `[OPERATOR / COUNSEL]` for confirmation.
4. Draft the notice body: identification of the insured and the policy; a statement that notice is given under the policy; the factual description with dates, parties, and locations exactly as supplied; and the amounts demanded or estimated, or `[AMOUNT UNKNOWN AT THIS TIME]`.
5. Guard the language. State facts as supplied without admitting liability, characterizing fault, or conceding coverage or policy interpretation. Include a rights-reservation line stating that the notice is provided without admission of liability and with all rights under the policy and at law reserved.
6. Close the notice: a request for written acknowledgment of receipt and the insurer's claim number, a contact block, a signature block with signatory placeholders, and an attachments list marking each referenced document `In hand` or `Missing`.
7. Apply defaults. Fill every remaining gap from the defaults table in the drafting agent's instructions, and list each default used.
8. Produce the output in the format below.

## Output Format

- A single well-structured markdown draft: deadline banner with policy number, period, and insurer; an `Assumptions and open items` section listing every placeholder, default applied, and operator or counsel flag; the notice header with date and recipient placeholders and a re-line; the notice body; the rights-reservation line; the acknowledgment request; contact and signature blocks; and the attachments list.
- Repeat the notice deadline in the closing line of the draft.
- Preserve operator-specified names, dates, policy details, and amounts exactly as given.

## Boundaries

- Do not send, serve, file, post, submit, or transmit the notice to any insurer, broker, claims portal, or other external party or system; the draft is a work product pending operator approval.
- Do not opine on coverage, the timeliness or sufficiency of notice, or how an insurer or court would treat the claim; flag those determinations for the operator or responsible counsel.
- Do not admit liability, characterize fault, or concede policy interpretation in the notice text; state facts as supplied and reserve rights.
- Do not invent dates, amounts, deadlines, or document titles; use placeholders and list the gaps as operator follow-ups.
