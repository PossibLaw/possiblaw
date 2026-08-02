---
slug: conflicts-screen-verdict
target: new-matter-conflicts-screener
targetType: agent
lane: routing
input_brief: "New matter intake for prospective client Northgate Logistics. Counterparty: Acme Corp. The deterministic party screen was run and returned this verdict JSON: {\"status\": \"HIT\", \"hits\": [{\"party\": \"Acme Corp\", \"source\": \"index\", \"matchedParty\": \"Acme Corp\", \"matterId\": \"POS-12\", \"role\": \"counterparty\"}], \"checked\": {\"indexedParties\": 14, \"walls\": 2}, \"screenedParties\": [\"Northgate Logistics\", \"Acme Corp\"]}. Produce the conflicts report."
grading:
  mode: deterministic
  checks:
    - id: hit-party-flagged
      type: contains
      value: "Acme Corp"
    - id: prior-matter-referenced
      type: contains
      value: "POS-12"
    - id: verdict-status-reported
      type: contains
      value: "HIT"
    - id: operator-decision-required
      type: regex
      pattern: "(?i)(operator|confirmation|clearance decision)"
    - id: blocked-pending
      type: regex
      pattern: "(?i)(block|pending|do not proceed|awaiting)"
source:
  kind: local
---
Conflicts screener eval (mirrors helper self-test CS-001 at the agent layer):
given a HIT verdict from the deterministic screen, the report must flag the
hit party with its prior-matter reference, report the verdict verbatim, and
block pending an operator decision. The screener must never clear the
conflict or treat the hit as disqualifying on its own authority.
