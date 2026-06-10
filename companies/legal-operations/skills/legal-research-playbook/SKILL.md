---
name: legal-research-playbook
description: Run structured legal research through the attached research connectors when a research matter arrives, producing a memo with exact citations, coverage notes, and open questions for counsel.
metadata:
  sources:
    - path: companies/legal-operations/skills/legal-research-playbook/SKILL.md
      kind: local-file
      usage: vendored
      license: Apache-2.0
      attribution: PossibLaw
---

# Legal Research Playbook

Use this skill to take a research matter from question to finished memo. The memo summarizes what located sources state; it is research for the operator or responsible attorney, never legal advice.

## When To Invoke

- The issue asks a legal research question, requests authority on a point, or requests a research memo.
- The issue requests an update or expansion of a prior PossibLaw research memo; rerun the relevant steps and list what changed.
- Do not invoke for citation verification of an existing draft (that belongs to the citation checker), and do not invoke to answer strategy or conclusion-of-law questions; escalate those instead.

## Source-Tier Rules

Only two source tiers are citable:

1. Connector results — authorities returned by `connector-courtlistener`, `connector-lexis`, `connector-westlaw`, or `connector-midpage` during this matter, with the connector named.
2. Operator-supplied sources — documents, opinions, or excerpts the operator attached to or referenced in the issue, cited to the supplied document.

Everything else — model recall, authorities remembered from training, citations seen in other matters, secondary mentions inside a retrieved source that were not themselves retrieved — is an unverified lead. Unverified leads never appear in Findings; list them in the `Unverified leads` section for the operator to verify.

## Research Steps

1. Frame the question presented. Restate the research question from the issue without expanding its scope; record the jurisdictions, date ranges, and controlling-law constraints stated by the operator.
2. Plan the searches. Choose connectors by coverage and the matter's needs; record each planned query before running it.
3. Run the connectors. Execute the queries per each connector skill, capture results as returned, and log every outage, unconfigured connector, or rate limit as a coverage gap rather than substituting recollection.
4. Read and extract. For each responsive authority, capture the exact citation as returned, the court and date, the passages that address the question, and a factual note on what the source states.
5. Assemble the memo in the format below, separating verified findings from unverified leads and recording coverage honestly.

## Memo Format

Produce the memo with these sections, in this order:

1. Question presented
2. Sources consulted — connector or operator source, queries run, date ranges
3. Findings — per authority: exact citation, source named, what the authority states on its face
4. Unverified leads — authority as encountered, where it surfaced, what is needed to verify it
5. Confidence and coverage notes
6. Open questions for counsel

## Citation-Fidelity Rules

- Cite every authority exactly as the source returned it — case name, citation string, court, and date — with no normalization, completion, or correction from memory.
- Name the connector or operator source immediately next to each citation so every finding is traceable.
- Quote sparingly and exactly; mark every alteration with brackets and every omission with an ellipsis.
- If two sources return the same authority with different citation strings, record both and flag the discrepancy.

## Coverage Notes

Close every memo with what the search did and did not cover: jurisdictions and date ranges searched, queries run, connectors unavailable or rate-limited, and question aspects no located source addressed. A narrow, honest memo beats a broad-looking one with silent gaps.

## Escalation Triggers

- Privileged strategy questions, should-we questions, or requests for a conclusion of law → return to `research-lead` for escalation to `chief-counsel`.
- All attached connectors unavailable or unconfigured for the needed coverage → mark the issue blocked with the operator as unblock owner.
- The question requires non-legal expert input (for example financial or scientific analysis) → flag for the operator rather than answering outside scope.

## Boundaries

- Do not fabricate, reconstruct, or cite from memory; every cited authority must trace to a connector result or an operator-supplied source.
- Do not state conclusions of law, predict outcomes, or recommend a course of action; findings describe what sources state.
- Do not transmit the memo to any external party or system; the memo is a work product pending operator approval.
