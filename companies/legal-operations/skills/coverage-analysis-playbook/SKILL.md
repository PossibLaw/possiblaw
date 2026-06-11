---
name: coverage-analysis-playbook
description: Map claim facts against policy provisions when a coverage matter arrives, producing a draft coverage-position memo with provision-by-provision findings and the final position flagged to the operator or responsible counsel.
metadata:
  sources:
    - path: companies/legal-operations/skills/coverage-analysis-playbook/SKILL.md
      kind: local-file
      usage: vendored
      license: Apache-2.0
      attribution: PossibLaw
---

# Coverage Analysis Playbook

Use this skill to map claim facts against the provisions of an insurance policy and assemble a draft coverage-position memo. The memo states findings provision by provision; the final coverage position is a determination for the operator or responsible counsel and is always flagged, never settled.

## When To Invoke

- The issue asks how claim facts map against a policy's insuring agreements, definitions, exclusions, conditions, or endorsements, or requests a coverage-position memo.
- The issue requests revisions to an existing PossibLaw-drafted coverage memo; rerun the relevant steps against the prior draft and list what changed.
- Do not invoke for notice-of-claim drafting or policy-renewal comparison; those belong to other specialists in the insurance practice.

## Analysis Steps

1. Intake. Record the policy and its period, the parties, the endorsements supplied, the claim facts and timeline, and the coverage question as received. If the policy text, the endorsements, or the claim facts are absent and no acceptable default applies, gate with `missing-info-gate`; never analyze coverage from a policy you have not seen.
2. Build the provision map. List every provision implicated: insuring agreements, definitions the claim facts implicate, exclusions, conditions (notice, cooperation, consent, and any others), and endorsements. Read each endorsement against the provisions it modifies and record the modification explicitly; an unread or missing endorsement is a flagged gap, not an assumption.
3. Map facts to provisions. Work provision by provision through the map — do not skip a provision because it appears inapplicable. For each provision, record the facts supporting coverage, the facts cutting against it, and the facts still missing — all three columns, every row. Quote policy language verbatim with a location cite whenever a finding turns on it; never paraphrase decisive language.
4. Record condition deadlines. Treat notice, cooperation, and consent conditions as findings rows with their dates and deadlines stated; route timeliness questions to the operator or responsible counsel rather than resolving them.
5. Assemble the memo. Produce the memo skeleton in the format below, stating the draft position only as `[COVERAGE POSITION — OPERATOR/COUNSEL DETERMINATION]` with the supporting and opposing findings summarized beneath it.

## Findings Table Format

| Provision | Policy language (verbatim, with cite) | Facts supporting coverage | Facts against coverage | Facts missing |
|---|---|---|---|---|

Condition rows include the relevant dates and deadlines in the facts columns. Unread endorsements appear as their own rows marked as flagged gaps.

## Memo Skeleton

1. Question presented and policy summary — policy, period, parties, and the coverage question as received.
2. Fact summary — the claim facts and timeline as supplied, with gaps marked.
3. Findings table — the provision-by-provision table above.
4. Draft position and flag — the `[COVERAGE POSITION — OPERATOR/COUNSEL DETERMINATION]` block with supporting and opposing findings summarized, the open facts, and a short ordered list of next actions for the operator or responsible counsel.

## Boundaries

- Do not issue a final coverage position, predict how a court would construe a provision, or advise the operator to accept or deny a claim; map, record, and flag.
- Do not paraphrase decisive policy language or assume the content of an endorsement that was not supplied; quote verbatim and flag gaps.
- Do not send, transmit, or file the memo or the underlying policy with any insurer, insured, broker, or other external party or system; the memo is a work product pending operator approval.
