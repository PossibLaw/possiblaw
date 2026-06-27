---
slug: deadline-holiday-roll
target: deadline-calculator
targetType: agent
lane: extractive
input_brief: "Compute a deadline from trigger date 2025-11-11 (Veterans Day, Tuesday), 4 days forward, jurisdiction US-FED, no mail service. The raw count lands on Saturday 2025-11-15. What is the deadline after applying the weekend/holiday roll rule?"
grading:
  mode: rubric
  rubric:
    judge_model: review
    pass_rule: all
    criteria:
      - id: calls-engine
        prompt: "Does the response invoke the deadline-engine CLI rather than computing the date itself?"
      - id: rolls-forward
        prompt: "Does the response report 2025-11-17 (Monday) as the deadline — the engine's result for trigger=2025-11-11 + 4 days forward US-FED (Saturday 2025-11-15 rolls to Monday 2025-11-17)?"
      - id: explains-roll
        prompt: "Does the response cite the engine's steps or a note explaining that the raw date fell on a weekend or holiday and was rolled forward to the next business day?"
      - id: no-self-computation
        prompt: "Does the response avoid performing its own calendar arithmetic and instead rely solely on the engine's output?"
source:
  kind: local
---
Edge-case eval: a deadline that falls on a weekend rolls forward to the next business day (FRCP Rule 6(a)(1)(C)). Trigger 2025-11-11 + 4 days US-FED forward → Saturday 2025-11-15 → rolled to Monday 2025-11-17.
