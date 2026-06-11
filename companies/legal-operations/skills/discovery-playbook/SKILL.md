---
name: discovery-playbook
description: Draft outgoing requests for production, interrogatories, and requests for admission, or responses and objections to incoming written discovery, when a discovery matter arrives, producing complete internal work products with standard definitions, instructions, numbering, an objection menu, and privilege flags.
metadata:
  sources:
    - path: companies/legal-operations/skills/discovery-playbook/SKILL.md
      kind: local-file
      usage: vendored
      license: Apache-2.0
      attribution: PossibLaw
---

# Discovery Playbook

Use this skill to draft outgoing written discovery — requests for production, interrogatories, and requests for admission — or to draft responses and objections to written discovery the company received. Every draft is an internal work product requiring explicit operator approval before any use; nothing produced under this playbook is ever served.

## When To Invoke

- The issue requests a set of requests for production, interrogatories, or requests for admission supporting stated claims or defenses.
- The issue contains or describes incoming written discovery and requests draft responses and objections.
- Do not invoke for deposition summaries, privilege logs, litigation holds, or demand letters; those belong to other skills and specialists.

## Request Drafting Steps

1. Gather from the issue: the parties and their roles, the claims and defenses in play, the disputed factual issues, any prior discovery sets, and operator constraints such as count limits or topics to avoid. If the claims and defenses are absent and no acceptable default applies, gate with `missing-info-gate` instead of guessing.
2. Map each disputed factual issue to an instrument: documents and records to a request for production, facts and contentions to an interrogatory, narrowing of facts that should be undisputed to a request for admission.
3. Build the definitions block from the standard defined terms — `Document`, `Communication`, `You` and `Your`, `Relating to`, `Person`, `Identify` — plus party-specific terms from the issue; mark gaps `[PARTY-SPECIFIC DEFINED TERMS]`.
4. Build the instruction set from the standard instructions: production format, the requirement to log withheld privileged material, the continuing duty to supplement, and the relevant time period (placeholder when unstated).
5. Draft the numbered requests. Number sequentially within each instrument starting at 1; continue numbering from a prior set when the issue identifies one. State one document category, fact, or admission per request, and tie each request to a claim, defense, or factual issue with an internal `Basis:` note marked for removal before service.
6. Flag every jurisdiction-dependent limit — numerical caps, subpart-counting rules, proportionality standards — as a `Jurisdiction flag` operator follow-up for the operator or responsible attorney; do not resolve those limits.

## Response Drafting Steps

1. Inventory the incoming set: propounding party, instrument type, set number, each request restated verbatim, and every stated response deadline recorded verbatim and flagged `OPERATOR FOLLOW-UP: confirm deadline and any legal effect with licensed counsel`. Never compute or validate a deadline.
2. Assign a response posture to each request from operator instructions and the facts in the issue. Where the operator stated no posture, default to objections preserved plus a response subject to and without waiving objections, and flag the posture choice for operator review.
3. Apply the objection menu below. State each objection specifically and tie it to the request language; never assert an objection without a stated basis, and flag any unavoidable boilerplate for attorney review.
4. Flag privilege. Where responding would reveal potentially privileged or work-product material, insert `[PRIVILEGE REVIEW REQUIRED]`, do not describe the material's content, and note that withheld material belongs on a privilege log.
5. For requests for admission, draft admit, deny, or cannot-truthfully-admit-or-deny responses only from operator-confirmed facts; where a fact is unconfirmed, insert `[OPERATOR TO CONFIRM FACT]` and flag the response as incomplete.
6. Assemble the complete response set, restating each request verbatim before its response, with a verification block placeholder where the instrument requires verification.

## Objection Menu

- Overbreadth or lack of proportionality, stating which feature of the request overreaches.
- Vagueness or ambiguity, naming the ambiguous term or phrase.
- Lack of relevance to any stated claim or defense.
- Privilege or work product, paired with a `[PRIVILEGE REVIEW REQUIRED]` flag.
- Undue burden, stating the burden basis from facts in the issue.
- Premature contention request while discovery is ongoing.
- Information equally available to the propounding party or in public records.
- Privacy or confidentiality interests of third parties.

## Defaults

| Field | Default |
|---|---|
| Caption and case number | `[CAPTION]` and `[CASE NUMBER]` placeholders |
| Propounding and responding parties | `[PROPOUNDING PARTY]` and `[RESPONDING PARTY]` placeholders |
| Definitions block | The standard defined terms above plus `[PARTY-SPECIFIC DEFINED TERMS]` |
| Instruction set | The standard instructions above |
| Relevant time period | `[RELEVANT TIME PERIOD]` placeholder flagged as an operator follow-up; never inferred |
| Numbering | Sequential from 1 per instrument; supplemental sets continue prior numbering when identified |
| Response deadline | Recorded verbatim from the incoming set, or `[RESPONSE DEADLINE PER APPLICABLE RULES]`; never computed |
| Response posture | Objections preserved plus response subject to objections, flagged for operator review |

## Output Format

Produce a single well-structured markdown document per instrument:

1. An `Assumptions and open items` section listing every default used, jurisdiction flag, privilege flag, posture decision, and operator follow-up.
2. Header: caption placeholder, instrument title (for example "Defendant's First Set of Interrogatories"), propounding and responding parties, and set number.
3. Definitions block.
4. Instructions.
5. Numbered requests (with internal `Basis:` notes) or numbered responses (each request restated verbatim before its response and objections).
6. Signature block placeholder, verification block placeholder where required, and a certificate-of-service placeholder marked `[DO NOT SERVE — OPERATOR ACTION]`.

## Boundaries

- Never serve, file, send, or transmit any request, response, or objection to opposing counsel, a court, or any external party or system; every draft is an internal work product pending operator approval.
- Do not decide privilege, discoverability, or objection enforceability as legal conclusions; flag those determinations for the operator or responsible attorney.
- Do not compute response deadlines, count limits, or other rule-based constraints; record stated deadlines verbatim and flag jurisdiction-dependent limits.
