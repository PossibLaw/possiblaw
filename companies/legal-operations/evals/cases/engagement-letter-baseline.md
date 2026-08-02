---
slug: engagement-letter-baseline
target: engagement-letter-drafter
targetType: agent
lane: drafting
input_brief: "Draft an engagement letter for a new client, Meridian Staffing LLC (fictional), for review and negotiation of a vendor master services agreement. Hourly rates: partner $450, associate $275. Estimated fees for this engagement: $8,000 to $12,000. Governing law: Illinois. The scope is limited to the vendor MSA review and negotiation; litigation is excluded."
grading:
  mode: deterministic
  checks:
    - id: partner-rate
      type: regex
      pattern: "\\$?450"
    - id: associate-rate
      type: regex
      pattern: "\\$?275"
    - id: fee-estimate
      type: regex
      pattern: "(?i)(8[,.]?000|\\$8[Kk])"
    - id: scope-section
      type: regex
      pattern: "(?i)scope"
    - id: exclusion-preserved
      type: regex
      pattern: "(?i)(exclud|not include|outside the scope)"
    - id: client-name-preserved
      type: contains
      value: "Meridian Staffing"
source:
  kind: local
---
Engagement-letter baseline for the operator demo path: supplied rates, fee
estimate, client name, and the litigation exclusion must all survive into the
draft, with an explicit scope section. Edge: the exclusion must appear as an
exclusion, not silently dropped.
