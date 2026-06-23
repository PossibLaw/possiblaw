---
slug: litigation-issue-spot
target: litigation-lead
targetType: agent
lane: routing
input_brief: "Our client received a demand letter alleging breach of a confidentiality agreement. The letter claims our client shared trade secrets with a competitor and demands $1.2M in damages plus injunctive relief. Spot the key legal issues and indicate which litigation specialists should be engaged."
grading:
  mode: rubric
  rubric:
    judge_model: review
    pass_rule: all
    criteria:
      - id: spots-core-issues
        prompt: "Does the response identify at least two of the following core issues: breach of confidentiality/NDA, trade secret misappropriation, injunctive relief risk, or damages quantification?"
      - id: assesses-urgency
        prompt: "Does the response note time-sensitivity or urgency, such as the injunctive relief demand requiring prompt action?"
      - id: routes-to-specialists
        prompt: "Does the response route to or identify appropriate litigation specialists (e.g., trade-secrets, commercial litigator) for follow-up?"
source:
  kind: local
---
Issue-spotting eval for litigation-lead in routing lane: demand letter, trade secrets, injunctive relief.
