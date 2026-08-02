---
slug: legal-ops-spend-report
target: legal-spend-reporter
targetType: agent
lane: drafting
input_brief: "Prepare the Q2 outside-counsel spend report. Invoiced spend this quarter: $84,500 across 6 matters. Accrued but uninvoiced: $12,000. Largest matter: Meridian acquisition at $31,200. Budget for the quarter was $90,000. Produce the spend register and summary tables with an accrual line."
grading:
  mode: deterministic
  checks:
    - id: invoiced-total
      type: regex
      pattern: "(?i)(84[,.]?500|\\$84\\.5[Kk])"
    - id: accrual-figure
      type: regex
      pattern: "(?i)(12[,.]?000|\\$12[Kk])"
    - id: largest-matter-figure
      type: regex
      pattern: "(?i)(31[,.]?200)"
    - id: accrual-labeled
      type: regex
      pattern: "(?i)accru"
    - id: budget-context
      type: regex
      pattern: "(?i)(90[,.]?000|\\$90[Kk]|budget)"
source:
  kind: local
---
Numeric sanity check for legal-spend-reporter: supplied figures must appear in
the spend report with an explicit accrual line and budget context. Edge:
accrued-but-uninvoiced must not be folded into invoiced spend.
