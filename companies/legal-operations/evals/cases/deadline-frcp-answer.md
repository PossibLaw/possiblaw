---
slug: deadline-frcp-answer
target: deadline-calculator
targetType: agent
lane: extractive
input_brief: "Our client was served with a complaint on 2024-12-20. What is the deadline to file a responsive pleading under FRCP Rule 12(a)? The standard answer period is 21 calendar days. Service was personal (not by mail). Jurisdiction: US federal court."
grading:
  mode: rubric
  rubric:
    judge_model: review
    pass_rule: all
    criteria:
      - id: calls-engine
        prompt: "Does the response invoke the deadline-engine CLI rather than computing the date itself or reasoning about calendar days?"
      - id: correct-date
        prompt: "Does the response report 2025-01-10 (Friday) as the deadline — the exact date the engine returns for trigger=2024-12-20, days=21, direction=forward, jurisdiction=US-FED, serviceByMail=false?"
      - id: shows-trace
        prompt: "Does the response include the engine's steps array or a verbatim provenance line stating the date was computed deterministically (e.g. 'Computed deterministically by deadline-engine (FRCP Rule 6) — not estimated')?"
      - id: counsel-caveat
        prompt: "Does the response include the required operator follow-up noting that the result should be confirmed with licensed counsel before relying on it?"
source:
  kind: local
---
Happy-path FRCP Rule 6 answer-period eval: trigger 2024-12-20 + 21 days forward US-FED → expect exact date 2025-01-10 (Friday) from the engine.
