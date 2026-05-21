# Launch Post Draft — Hacker News + LinkedIn

Use whichever version fits the platform. Both are under 300 words.

---

## Hacker News version

**Title:** PossibLaw – operating a legal business with AI, as a PoC on top of paperclip

---

I've been building in legal-tech long enough to know that the gap isn't intelligence — it's operations. A solo attorney or small firm spends most of their time on things that aren't the law: drafting routine NDAs, chasing invoices, coordinating intake, categorizing expenses. These are exactly the kind of tasks AI is good at.

PossibLaw is a proof-of-concept that shows how to wire AI agents into those operations. It's built as a thin layer on top of paperclip — agents, skills, workflows, guardrails, and MCP connectors — all in a `layer/` directory. Paperclip is wired as a git submodule and is never modified. The PoC runs against real datasets (CUAD, MAUD, LEDGAR) and has a Privacy Filter that masks sensitive entities before they reach the cloud.

What it is: open-source, Apache 2.0, public from day 1. A routing hierarchy (Chief Counsel → Lead → Specialist) with 9 workflows, 14 connectors, 5 eval datasets, and a guardrail layer that escalates to a human for anything that needs licensed-lawyer sign-off.

What it isn't: a productized SaaS, legal advice, a Helm chart, or a finished product. The disclaimer is load-bearing and intentional.

I'm looking for three things: (1) developers willing to follow the extending docs and tell me what's confusing, (2) operators (small firms, legal ops) willing to try it on a real matter and give honest feedback, and (3) anyone who has thoughts on the architecture.

Repo: https://github.com/PossibLaw/possiblaw
Getting started: https://github.com/PossibLaw/possiblaw/blob/main/docs/getting-started.md

---

## LinkedIn version

**PossibLaw — operating a legal business with AI, open-source, public today.**

The gap in legal-tech isn't intelligence. It's operations. PossibLaw is a proof-of-concept showing how to wire AI agents into the routine work of a small legal practice: NDA drafts, intake forms, invoices, expense categorization.

It's built as a layer on top of paperclip (not a fork), with a routing hierarchy, 9 workflows, 14 MCP connectors, a Privacy Filter, per-agent cost reporting, and a guardrail layer that always routes signature-bound work to a human for review.

Important: this is a PoC, not a product. It doesn't practice law. It's open-source (Apache 2.0) and explicitly not productized.

I'm looking for outside developers to stress-test the extending docs, and operators willing to try it on a real matter.

https://github.com/PossibLaw/possiblaw
