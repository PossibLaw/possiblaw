---
slug: finance-memo-sanity
target: finance-lead
targetType: agent
lane: routing
input_brief: "Prepare a brief financial summary memo for the monthly business review. Total revenue this month: $1,250,000. Expenses: $980,000. Net income: $270,000. Outstanding invoices: $340,000. Overdue invoices (>30 days): $45,000. Format the memo with clear labeled sections and numeric values."
grading:
  mode: deterministic
  checks:
    - id: revenue-figure
      type: regex
      pattern: "(?i)(1[,.]?250[,.]?000|\\$1\\.25M|1\\.25 million)"
    - id: net-income-figure
      type: regex
      pattern: "(?i)(270[,.]?000|\\$270[Kk])"
    - id: overdue-invoices
      type: contains
      value: "45"
    - id: labeled-sections
      type: regex
      pattern: "(?i)(revenue|expenses|net income|outstanding|overdue)"
source:
  kind: local
---
Numeric/format sanity check for finance-lead: verifies correct figures appear in memo output.
Edge case: overdue invoices must be reported separately from total outstanding.
