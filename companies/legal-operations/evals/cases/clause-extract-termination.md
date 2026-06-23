---
slug: clause-extract-termination
target: clause-extractor
targetType: agent
lane: extractive
input_brief: "Extract the termination notice period from the following contract text. Return the exact notice period phrase verbatim."
grading:
  mode: deterministic
  checks:
    - id: termination-notice-span
      type: golden
      value: "thirty (30) days prior written notice"
      threshold: 0.7
    - id: contains-thirty-days
      type: contains
      value: "thirty"
source:
  kind: benchmark
  name: cuad
---
CUAD-backed: termination for convenience notice period extraction. Maps to cuad-fixture-002.
