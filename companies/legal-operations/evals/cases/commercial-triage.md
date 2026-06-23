---
slug: commercial-triage
target: commercial-lead
targetType: agent
lane: primary
input_brief: "A vendor has sent us their standard SaaS subscription agreement. The deal is worth $250,000 annually. We need to decide whether to redline their paper or push our own template. Triage this matter and indicate the recommended approach and which specialist should handle it."
grading:
  mode: rubric
  rubric:
    judge_model: review
    pass_rule: all
    criteria:
      - id: identifies-matter-type
        prompt: "Does the response correctly identify this as a commercial SaaS contract negotiation matter?"
      - id: recommends-approach
        prompt: "Does the response recommend a specific approach (redline vendor paper vs. own template) with a rationale related to deal size or negotiating leverage?"
      - id: routes-to-specialist
        prompt: "Does the response identify or route to a specialist (e.g., contract-reviewer, commercial specialist) who should handle the detailed review?"
source:
  kind: local
---
Routing/judgment eval for commercial-lead: triage a SaaS deal and recommend approach + specialist routing.
