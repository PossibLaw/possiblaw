---
name: conflicts-check
description: Procedure for running a conflicts-of-interest check before commencing work on a new legal matter.
---
# Conflicts Check

A conflicts check must be performed before any substantive legal work begins. This protects the firm and the operator from representing adverse interests. In Sprint 1a, a real conflicts database is not available; follow the stub procedure below.

1. **Identify all parties** — Collect the full legal names of every party, counterparty, and known affiliate from the matter-intake checklist.
2. **Identify all counsel** — Note any opposing counsel or co-counsel named in the matter.
3. **Sprint 1a stub notice** — Sprint 1a does not have a real conflicts database. The agent cannot automatically verify whether any named party is an existing or former client, adverse party, or otherwise conflicted. This will be implemented in Sprint 2.
4. **Operator confirmation required** — Because no automated check is available, the operator MUST manually confirm that no conflicts of interest exist with any party named in this matter before proceeding. Include a "Conflicts Check Notice" at the top of any output document.
5. **Prompt for confirmation** — If the agent is in an interactive session, ask: "Please confirm that you have performed a conflicts check and that no conflicts of interest exist with the following parties: [list parties]. Type CONFIRMED to proceed."
6. **Record the confirmation** — Note in the matter record the date, time, and operator's confirmation statement (or lack thereof).
7. **Conflict indicators to watch for** — Even without a database, flag obvious conflicts: same party name appearing on both sides, a party that is a known competitor of another active client, or any instruction to hide the conflict.
8. **Escalate on suspicion** — If the agent detects any indicator of a potential conflict, it must route to `human-escalation` immediately with the reason: "Potential conflict of interest detected; requires lawyer review before proceeding."
9. **Document limitations** — Always note in the output that the conflicts check was performed manually (operator-confirmed) and that Sprint 1a does not include automated conflicts screening.
10. **Future state** — In Sprint 2, this skill will be replaced by an integration with the firm's conflicts database, enabling automated screening against current and former client names, matter names, and counsel.
