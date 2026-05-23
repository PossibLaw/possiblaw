# Missing-Information Gate — Operator Guide

This skill is how the company's agents stop and ask you for a fact they need, instead of guessing. It produces a single structured comment on the Paperclip issue, sets the issue to `blocked`, and tells you exactly what to do next.

## How the gate works at runtime

1. An agent picks up an issue (an NDA draft, an offer letter, an IP assignment, etc.).
2. Before producing the artifact, the agent loads the required-fact template for that matter type from `templates/`.
3. For every required field, the agent looks for an answer in the issue body, prior comments, and attached documents. If a field has an acceptable default (e.g., NDA term = 2 years, governing law = Delaware), the agent applies the default and lists it under `Defaults used`.
4. If any required field has no value and no acceptable default, the agent posts the `⛔ Missing Information Gate` comment, sets the issue `status` to `blocked`, and stops.
5. The comment names the **unblock owner** (you, in most cases), the **unblock action** (one concrete thing to do), and **what resumes when answered** (which agent will pick the issue back up and what they'll do next).

The agent will never silently invent a fact for a `NO DEFAULT` field.

## How to answer (the `RESUME:` convention)

To unblock the issue, post a follow-up comment on the same issue whose **first line begins with `RESUME:`** (case-sensitive). Anything after that can be free-form or structured. Both of these work:

Example — structured:

```
RESUME:
- Counterparty legal name: Acme Holdings, Inc.
- Counterparty entity type: Delaware C-corporation
- Counterparty jurisdiction: Delaware
- Permitted purpose: evaluation of a potential acquisition of Acme by us
```

Example — prose:

```
RESUME: Use Acme Holdings, Inc. (Delaware C-corp). Purpose is an acquisition evaluation. Everything else use defaults.
```

What happens next:

- The named gating agent re-reads the issue, including your `RESUME:` comment.
- If you supplied every gating field, the agent sets `status` back to `in_progress` and continues from where it stopped.
- If anything is still missing, the agent posts a new BLOCKED comment listing only what is still needed.

A comment without the `RESUME:` prefix is treated as discussion. The issue stays blocked. Use `RESUME:` when you want work to continue.

## Discussion vs. resumption

| You want to... | Do this |
| --- | --- |
| Ask a clarifying question without unblocking | Post a normal comment. The agent will treat it as discussion. |
| Provide one or more missing facts and let work continue | Post a comment starting with `RESUME:` on its own first line. |
| Change a default the agent applied | Post `RESUME:` and state the new value, e.g. `RESUME: change governing law to New York`. |
| Cancel the matter | Close the Paperclip issue. The gating agent will not auto-resume on a closed issue. |

## Confidentiality note

The BLOCKED comment refers to your provided values by field name only (e.g. `Compensation: provided`). It does not echo back sensitive values like compensation figures, deal prices, or unfiled patent descriptions in the public comment thread. The actual values flow into the draft artifact for your review.

## How to add a new matter-type template

To add a new template (e.g., for a commercial lease, services agreement, or stock purchase agreement):

1. Create a new file under `templates/`, named `<matter-slug>.md`. Use kebab-case and match a matter-type slug used by the matter intake skill.
2. Use the same table shape: `Field | Why it matters | Acceptable inputs | Default if any`.
3. For every field, choose between:
   - a defensible default (state it), or
   - `NO DEFAULT` (the gate will fire if the operator does not supply it).
4. Be specific about jurisdictional caveats. If a field's enforceability or required form depends on the jurisdiction, say so in the `Why it matters` cell and mark the default `NO DEFAULT` for jurisdictions where no safe default exists.
5. Update the `Decision Rule` section of `SKILL.md` to point at the new template (the only allowed edit to `SKILL.md` is adding the new matter-type to the routing list).
6. Add at least one Given/When/Then eval entry to `SKILL.md` exercising the new template — happy, missing-field, and a jurisdiction-sensitive case.

Templates are deliberately production-honest. Omit a field rather than invent one. If you find yourself writing "consult a lawyer" inside a cell, the cell is in the wrong place — that guidance belongs at matter intake, not in the gate.
