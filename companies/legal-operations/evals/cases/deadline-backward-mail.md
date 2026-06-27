---
slug: deadline-backward-mail
target: deadline-calculator
targetType: agent
lane: extractive
input_brief: "A motion hearing is set for 2025-03-10 (Monday). Under local rules we must serve opposition papers at least 14 days before the hearing. Service will be by mail (FRCP 6(d) adds 3 days). What is the last date to mail service? Use direction backward, trigger 2025-03-10, days 14, serviceByMail true, jurisdiction US-FED."
grading:
  mode: rubric
  rubric:
    judge_model: review
    pass_rule: all
    criteria:
      - id: calls-engine
        prompt: "Does the response invoke the deadline-engine CLI rather than computing the date itself?"
      - id: correct-direction
        prompt: "Does the response correctly apply a backward direction and serviceByMail:true (adding 3 days to the 14-day period = 17 days back from the hearing date)?"
      - id: correct-date
        prompt: "Does the response report the engine's exact computed date for trigger=2025-03-10, days=14, direction=backward, serviceByMail=true, jurisdiction=US-FED? (Expected: 2025-02-17, Monday — 17 days before 2025-03-10 is 2025-02-21 Friday, which is a business day; with mail service the engine counts backward 17 days from trigger, landing on a business day.)"
      - id: no-self-computation
        prompt: "Does the response avoid performing its own calendar arithmetic and instead rely solely on the engine's exact output, including its steps trace?"
source:
  kind: local
---
Edge-case eval: backward direction (count back from a target date) + FRCP 6(d) mail service (+3 days). Trigger 2025-03-10, 14 days backward, serviceByMail=true, US-FED. The agent must call the engine and report its exact date, never self-computing.
