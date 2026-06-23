---
slug: nda-mutual-baseline
target: nda-drafter
targetType: agent
lane: drafting
input_brief: "Draft a mutual NDA between Acme Corp and Beta LLC, governed by Delaware law, with a two (2) year confidentiality term and standard carve-outs for publicly available information and court-ordered disclosures."
grading:
  mode: deterministic
  checks:
    - id: governing-law
      type: regex
      pattern: "(?i)(State of Delaware|Delaware law|governed by.*Delaware)"
    - id: mutual-obligations
      type: contains
      value: "mutual"
    - id: term-two-years
      type: regex
      pattern: "(?i)(two \\(2\\) year|2-year|two-year)"
source:
  kind: local
---
Happy path: mutual NDA, Delaware law, two-year term. Deterministic checks cover the three core structural requirements. A rubric case (nda-mutual-rubric) can be added for quality judgment.
