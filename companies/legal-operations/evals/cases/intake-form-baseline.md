---
slug: intake-form-baseline
target: intake-form-drafter
targetType: agent
lane: drafting
input_brief: "A new client wants to engage us for a commercial contract dispute involving a $500,000 software development agreement gone wrong. Draft an intake form for this new matter."
grading:
  mode: rubric
  rubric:
    judge_model: review
    pass_rule: all
    criteria:
      - id: captures-matter-type
        prompt: "Does the intake form identify the matter type as a commercial contract dispute and reference the dollar amount or software development context?"
      - id: captures-party-info
        prompt: "Does the intake form include fields or sections for client identification, opposing party, and relevant dates?"
      - id: captures-next-steps
        prompt: "Does the intake form include a next-steps or conflict-check section appropriate for a new client matter?"
source:
  kind: local
---
Substitutes for quick-counsel (slug not present); intake-form-drafter is the closest intake/counsel agent.
Note: quick-counsel does not exist as agent or skill; intake-form-drafter (agent, lane=drafting) substituted.
