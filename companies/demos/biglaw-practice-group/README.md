# Whitfield Sterling LLP — Technology Transactions Group Demo

Whitfield Sterling LLP is a fictional 2,000-lawyer global firm; this demo persona is its 40-lawyer Technology Transactions Group. The group runs high-volume specialist work — licensing deals, acquisition diligence, knowledge-bank research, and litigation support — where agents do first-pass drafting and extraction at scale and group lawyers review everything that leaves the building. Compared with the other demo profiles, this one is built to show high-volume specialist use: extraction-heavy tasks, connector-backed research, and verbatim-only workstreams that exercise the deeper specialist tiers of the org chart.

## Use at Launch

- Org name: `Whitfield Sterling — Tech Transactions`
- Mission: `The Technology Transactions Group of Whitfield Sterling LLP runs high-volume licensing, diligence, and knowledge work for technology clients. Agents handle first-pass drafting and extraction at scale; group lawyers review and own every deliverable.`

## Run the Demo

All tasks import into the backlog assigned to `chief-of-staff`. Move tasks from backlog to todo to start them. Suggested first pair: `helix-dataroom-extraction` (high-volume extraction chain) and `browsewrap-clickwrap-memo` (connector-backed research chain). Expected routing per task:

- `orion-tessellate-license` → chief-of-staff → chief-counsel → ip-lead → ip-licensing-drafter
- `orion-oss-compliance` → chief-of-staff → chief-counsel → ip-lead → ip-licensing-drafter
- `helix-dataroom-extraction` → chief-of-staff → chief-counsel → corporate-lead → corporate-diligence-extractor
- `helix-msa-clause-inventory` → chief-of-staff → chief-counsel → commercial-lead → clause-extractor
- `browsewrap-clickwrap-memo` → chief-of-staff → chief-counsel → research-lead → legal-research-analyst
- `client-alert-citation-check` → chief-of-staff → chief-counsel → research-lead → legal-citation-checker
- `orion-litigation-hold` → chief-of-staff → chief-counsel → litigation-lead → litigation-hold-drafter
- `docket-monitor-setup` → chief-of-staff → chief-counsel → litigation-lead → litigation-docket-monitor

Watch for specialist discipline: the clause inventory must stay verbatim with no risk analysis, the research memo must flag unverified leads instead of citing them, and the docket monitor should report that the synthetic case number returns no live results.

## Synthetic Data Notice

Every client, target, person, citation, case number, court, statute, and package name in this profile is synthetic and exists only for demonstration. The State of Calverton, its courts, and its reporters are fictional. Do not reuse any of it as real legal work product. The practice of law is regulated; to the extent an operator is practicing law with this workflow, the operator needs to involve a lawyer.
