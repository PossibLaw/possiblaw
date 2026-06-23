---
slug: bd-outreach-draft
target: bd-lead
targetType: agent
lane: routing
input_brief: "We want to reach out to a mid-market technology company (Series B, ~$50M ARR, SaaS) that recently closed a $30M funding round. They likely need outside counsel for their next commercial agreements and potential M&A work. Draft an outreach strategy and indicate which BD resources or templates should be used."
grading:
  mode: rubric
  rubric:
    judge_model: review
    pass_rule: all
    criteria:
      - id: identifies-target-profile
        prompt: "Does the response acknowledge the target company's profile (Series B, recently funded, SaaS) and tailor the outreach strategy accordingly?"
      - id: proposes-value-proposition
        prompt: "Does the response articulate a relevant value proposition for legal services (e.g., commercial agreements, M&A readiness) appropriate for a growth-stage tech company?"
      - id: routes-to-resources
        prompt: "Does the response route to or recommend BD resources, templates, or specialists (e.g., bd-proposal-drafter, CRM coordination) for executing the outreach?"
source:
  kind: local
---
BD routing eval: outreach strategy for a funded SaaS target, routing to BD resources.
