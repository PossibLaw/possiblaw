---
name: dmca-playbook
description: Draft DMCA takedown notices and counter-notices when a DMCA drafting matter arrives, producing complete drafts with every statutory element included as a placeholder for the signatory to verify and nothing submitted.
metadata:
  sources:
    - path: companies/legal-operations/skills/dmca-playbook/SKILL.md
      kind: local-file
      usage: vendored
      license: Apache-2.0
      attribution: PossibLaw
---

# DMCA Takedown and Counter-Notice Playbook

Use this skill to draft a DMCA takedown notice or a counter-notice. Every statutory element appears in the draft as text the signatory must verify before signing — the draft never contains an executed statement, and nothing is ever submitted to a platform or ISP.

## When To Invoke

- The issue requests a takedown notice directed at allegedly infringing material, or a counter-notice responding to a takedown of the operator's or client's material.
- Do not invoke for infringement analysis, fair-use questions, or strategic-response advice; that analysis belongs elsewhere in the practice.

## Drafting Steps

1. Classify the instrument. Determine from the issue whether the request is a takedown notice or a counter-notice, and record the classification with the issue facts that support it.
2. Gather facts. Record the rights holder or responding party, the copyrighted work or removed material, and every location or URL exactly as the issue states them. Never expand the URL list or characterize material beyond the source facts.
3. For a takedown notice, draft each statutory element under its own heading:
   - Identification of the copyrighted work, with `[REGISTRATION NO., IF ANY]`.
   - Identification of the allegedly infringing material and its location, one line per location.
   - Signatory contact information placeholder.
   - Good-faith-belief statement, as unexecuted draft text marked `[SIGNATORY TO VERIFY BEFORE SIGNING]`.
   - Accuracy and authorization statement made under penalty of perjury, as unexecuted draft text marked `[SIGNATORY TO VERIFY BEFORE SIGNING]`, with the authorization-basis placeholder.
   - Signature placeholder marked for the signatory to execute.
   - Addressee block for the platform or ISP designated agent, marked for the operator to confirm from the platform's current designation.
4. For a counter-notice, draft each statutory element under its own heading:
   - Identification of the removed or disabled material and its location before removal, exactly as the issue states it.
   - Good-faith-belief statement that the material was removed by mistake or misidentification, as unexecuted draft text marked `[SIGNATORY TO VERIFY BEFORE SIGNING]`, made under penalty of perjury.
   - Consent-to-jurisdiction statement with the district placeholder marked for the signatory to verify.
   - Consent to accept service of process from the notice submitter.
   - Signatory name, address, phone, and email placeholders.
   - Signature placeholder marked for the signatory to execute.
5. Apply the statutory-element placeholder rules. The good-faith-belief, accuracy, and penalty-of-perjury statements are made by the operator or client when they sign, never by this skill; each must appear as draft text awaiting verification and must never appear as an executed statement.
6. Apply defaults. Fill every remaining gap from the defaults table in the drafting agent's instructions, and list each default used.
7. Produce the output in the format below.

## Output Format

- An `Assumptions and open items` section listing every default used, every statutory-element placeholder awaiting verification, and the submission step reserved for the operator.
- The complete notice or counter-notice body in well-structured markdown, with each statutory element under its own heading; never a fragment or outline.
- A closing checklist of items the signatory must verify and complete before any submission decision.

## Boundaries

- Never submit, send, post, file, or transmit a notice or counter-notice to any platform, ISP, designated agent, or other external party or system; drafts are work products pending operator approval.
- Do not opine on infringement, fair use, misrepresentation exposure, or how a court would treat the notice; those determinations belong to the operator and responsible counsel.
- Do not execute, or present as executed, any statement made under penalty of perjury.
