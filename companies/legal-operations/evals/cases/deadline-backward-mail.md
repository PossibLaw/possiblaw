---
slug: deadline-backward-mail
target: deadline-calculator
targetType: agent
lane: extractive
input_brief: "A motion hearing is set for 2025-03-10 (Monday). Under the local rule we must serve opposition papers at least 14 days before the hearing. Service will be in person (not by mail). What is the last date to serve? Use direction backward, trigger 2025-03-10, days 14, serviceByMail false, jurisdiction US-FED."
grading:
  mode: rubric
  rubric:
    judge_model: review
    pass_rule: all
    criteria:
      - id: calls-engine
        prompt: "Does the response invoke the deadline-engine CLI rather than computing the date itself?"
      - id: correct-direction
        prompt: "Does the response correctly apply a backward direction (counting back from the target hearing date, excluding the trigger day) rather than forward?"
      - id: correct-date
        prompt: "Does the response report 2025-02-24 (Monday) as the deadline — the engine's exact output for trigger=2025-03-10, days=14, direction=backward, serviceByMail=false, jurisdiction=US-FED (14 calendar days back from 2025-03-10 lands on Monday 2025-02-24, a business day, no roll)?"
      - id: mail-rule-forward-only
        prompt: "Does the response avoid adding any FRCP 6(d) mail-service days to this backward count? The deadline-engine treats the mail rule as forward-only (a backward count with serviceByMail:true returns supported:false), so the agent must NOT add 3 days when counting backward."
      - id: no-self-computation
        prompt: "Does the response avoid performing its own calendar arithmetic and instead rely solely on the engine's exact output, including its steps trace?"
source:
  kind: local
---
Edge-case eval: backward direction (count back from a target date), no mail service. Trigger 2025-03-10, 14 days backward, serviceByMail=false, US-FED → engine returns 2025-02-24 (Monday). FRCP 6(d) mail-time is forward-only in the engine, so a backward count omits it (backward + serviceByMail:true returns supported:false). The agent must call the engine and report its exact date, never self-computing.
