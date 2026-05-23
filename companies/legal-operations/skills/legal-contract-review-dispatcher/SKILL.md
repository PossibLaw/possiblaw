---
name: legal-contract-review-dispatcher
description: Identify the structure of an inbound commercial agreement and route it to the right substantive review skill (NDA, SaaS/MSA, or general vendor review).
metadata:
  sources:
    - kind: github
      repo: anthropics/claude-for-legal
      path: commercial-legal/skills/review/SKILL.md
      commit: b0aeeba
      url: https://github.com/anthropics/claude-for-legal/blob/b0aeeba/commercial-legal/skills/review/SKILL.md
      license: Apache-2.0
      attribution: Anthropic, contributors to claude-for-legal
      usage: adapted
---

# Contract Review Dispatcher

Use this skill to triage an inbound commercial agreement, identify its true structure, and route it to the substantive review skills that should be applied. The output of this skill is a routing decision and a single integrated review brief — not a separate memo per skill.

## Inputs

- The agreement text, file path, or storage link supplied by the operator.
- The matter intake context (counterparty, purpose, side the operator is on).
- The operator's playbook positions if available; if the operator has no playbook positions on a specific term, surface that gap rather than silently filling it.

If no agreement is supplied, ask the operator for one before proceeding.

## Routing Procedure

1. **Read titles before body.** Extract the main agreement title (for example "Master Services Agreement", "Non-Disclosure Agreement", "Subscription Order Form") and every exhibit, schedule, addendum, annex, and attachment title. Titles are the strongest routing signal. Do not rely on body keywords alone — a long MSA that uses the word "confidential" repeatedly is not an NDA.
2. **Map each document or section to a review skill.** Use the following table as the default routing map; deviate only when the agreement structure clearly demands it.

   | Document or section title contains | Route to |
   |---|---|
   | Non-Disclosure, NDA, Confidentiality Agreement as the main agreement | `legal-nda-review` |
   | Master Services Agreement, Professional Services, Statement of Work, Consulting Agreement | general vendor review pass (apply the operator's vendor playbook) |
   | Subscription, SaaS, Cloud Services, Order Form with auto-renewal, Software License with recurring fees | `legal-saas-msa-review` (in addition to the vendor pass) |
   | Data Processing Addendum, DPA as exhibit or standalone | note for the vendor pass to cover data-protection terms |
   | Service Level Agreement, SLA as exhibit | note for `legal-saas-msa-review` to cover the SLA |
   | Open source license, dependency manifest, SBOM, or outbound code prep | `legal-oss-compliance` |

   Multiple skills can apply to the same agreement. Common combinations include MSA plus DPA exhibit, SaaS subscription plus Order Form plus SLA, and MSA plus auto-renewing Order Form.

3. **Resolve genuinely ambiguous structure.** If the title is generic (for example "Agreement") and the exhibit list does not clarify the structure, read the first two pages of the body to resolve the routing, then stop and select the skills before going further.

4. **Confirm routing with the operator unless instructed to proceed silently.** Default to confirming. Use this format:

   > I plan to review this as: [agreement type(s)].
   >
   > Documents identified:
   > - [Main title] → [skill]
   > - [Exhibit A] → [how it is handled]
   > - [Exhibit B] → [how it is handled]
   >
   > Sound right? (yes / no — or tell me what to change.)

   If the operator has previously authorized silent routing for this matter or template, skip the confirmation step but log the routing decision at the top of the integrated review brief so the operator can audit it.

5. **Run the routed skills in sequence and integrate.** Produce one combined review brief, not separate memos. Each skill section should reference the same agreement and avoid restating duplicate facts.

6. **Surface escalations.** If any finding from a routed skill would exceed the operator's stated authority (for example a deal-breaker risk, a regulated-practice trigger, or a clause type the operator has marked "never accept"), call it out at the top of the brief and propose the escalation owner from the matter intake.

7. **Offer durable follow-ups.** After the integrated review brief is produced, offer the operator:
   - A short business-owner summary suitable for the deal lead.
   - A redline-ready version of the most consequential edits.
   - Addition to the renewal register if any auto-renewal terms were found.
   - A storage destination per the matter's output convention.

## Output Format

Return a single integrated review brief with this structure:

1. **Routing decision** — which skills were applied and why.
2. **Bottom line** — one or two sentences describing whether the agreement can be signed as written, needs negotiation, or should not proceed.
3. **Section per applied skill** — substantive findings from each routed skill, with the relevant section header (for example "NDA triage", "SaaS overlay", "OSS compliance").
4. **Open items and assumptions** — any facts that were missing, defaults that were applied, and any places where the operator's playbook was silent.
5. **Recommended next action** — escalate, request approval, push back, sign, or walk.

## Guardrails

- Do not execute, sign, or transmit the agreement. Routing and analysis only.
- Do not collapse multiple skills into one section that hides which skill produced which finding. Operators must be able to trace each finding to its source.
- Do not invent playbook positions. If the operator has no documented position on a term, mark it explicitly and ask before applying a default.
- Do not strip the work-product or privilege header from the integrated review brief when the operator's output convention requires one.

## Evals

**Given** an inbound document titled "Master Services Agreement" with an "Exhibit A — Data Processing Addendum" and an "Exhibit B — Service Level Agreement",
**When** the dispatcher runs against an operator who is purchasing-side,
**Then** the routing decision selects the vendor review pass plus `legal-saas-msa-review`, notes that the DPA exhibit will be covered in the vendor pass's data-protection section, and asks the operator to confirm before producing the integrated brief.

**Given** an inbound one-page document titled "Mutual NDA" with no exhibits,
**When** the dispatcher runs with no documented playbook position on residuals,
**Then** the routing decision selects only `legal-nda-review`, the integrated brief surfaces the missing residuals position as an open item, and the dispatcher does not silently apply a default residuals position.

**Given** an inbound document titled "Agreement" with no exhibit list and ambiguous body content,
**When** the dispatcher attempts to route after reading the first two pages and cannot determine the agreement type,
**Then** it stops, marks the routing as `BLOCKED`, and asks the operator to confirm the agreement type before any substantive review runs.
