---
slug: clause-extract-governing-law
target: clause-extractor
targetType: agent
lane: extractive
input_brief: "Extract the governing law clause from the following contract text. Return the governing law phrase verbatim."
grading:
  mode: deterministic
  checks:
    - id: governing-law-delaware
      type: golden
      value: "the laws of the State of Delaware"
      threshold: 0.7
    - id: contains-delaware
      type: contains
      value: Delaware
source:
  kind: benchmark
  name: cuad
---
CUAD-backed: governing law extraction (Delaware). Maps to cuad-fixture-001.
