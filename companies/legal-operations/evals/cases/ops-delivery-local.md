---
slug: ops-delivery-local
target: deliverables-courier
targetType: agent
lane: routing
input_brief: "Deliver the approved engagement letter draft for matter POS-7 (document: engagement-letter-meridian.md) using the local credential-free delivery path. No cloud connector credentials are configured in this environment. Report the delivery outcome, destination, and audit trail."
grading:
  mode: deterministic
  checks:
    - id: matter-reference
      type: contains
      value: "POS-7"
    - id: local-path-used
      type: regex
      pattern: "(?i)(POSSIBLAW_DELIVERABLES_DIR|deliverables)"
    - id: receipt-mentioned
      type: regex
      pattern: "(?i)receipt"
    - id: no-credential-failure
      type: regex
      pattern: "(?i)(local|credential-free|offline)"
source:
  kind: local
---
Courier routing eval for the demo spine: with no cloud credentials, delivery
must route to the local deliverables path (never fail on a missing token),
reference the matter, and surface the receipt/audit trail. Failure mode under
test: silently attempting a credentialed connector instead of the documented
local fallback.
