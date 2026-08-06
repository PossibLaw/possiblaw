# We tested our own thesis. Here's what we found.

**TL;DR — The result:** Under a rule we registered before running, our
atomic-decomposition thesis — that orchestrated teams of specialist agents
produce measurably better legal work product than one strong agent — came
back **not supported at the tier we tested**. Completed, fully-judged
orchestrated runs scored at the same floor as single agents. We're
publishing that plainly, with every receipt, because a trust layer that
massages its own benchmark isn't a trust layer.

**TL;DR — The build:** Getting to that answer required an experiment
apparatus almost none of the legal-AI market has: an A/B harness driving a
real multi-agent control plane end-to-end (matter intake → document
furnishing → delegation → reconstitution → independent judging by Harvey's
own open scorer), with validity guardrails that caught our own baseline
cheating, per-child cost telemetry, and a receipt chain under all of it.
Seven real defects were found and fixed test-first along the way — each one
a small proof of why behavioral verification, identity separation, and
fail-closed design are the right defaults. The instrument outlived the
hypothesis. That's how it's supposed to work.

---

## The claim and the rule

PossibLaw's README has argued that decomposing legal work into atomic units
— one agent, one skill, one gate decision, one receipt — yields *more
control* and *better work*. The control half is architectural and stands on
its own (receipts, gates, walls). The **better-work half is an empirical
claim**, so we tested it:

- **Arm A (baseline):** the single best-suited practice lead works the
  matter alone, with an explicit no-delegate instruction.
- **Arm B (treatment):** the chief of staff decomposes the same matter
  across specialists and reconstitutes one deliverable. Its freedom to
  decompose *is* the treatment.
- **Tasks:** Harvey LAB (MIT-licensed) curated subset — real legal work
  with expert-written rubrics of 27–50 criteria per task.
- **Judge:** Harvey's own unmodified scorer (`evaluation/run_eval.py`),
  judge model held fixed (`gpt-5.4`) across every run in the campaign.
- **Pre-registered rule:** orchestration's criterion pass-rate consistently
  above the single agent's = supported; parity = **not supported at this
  tier**. Stated before the deciding run, in writing.

## The result

Final deciding run — Claude Sonnet on every lane, 3 tasks × both arms ×
K=2, 90-minute ceiling for the orchestrated completions:

| Task | Arm A (single, no-delegate) | Arm B (orchestrated, completed) |
|---|---|---|
| immigration/compare-draft-eb | 1/27 | 1/27 · 1/27 |
| banking-finance/commitment-letter | (timed out ×2) | 2/47 · 1/47 |
| real-estate/title-commitment | 5/50 · 5/50 | 5/50 · 5/50 |

Parity. **Not supported at this tier.**

### The honest nuance

Across the full campaign — three models (DeepSeek V4 Flash, Claude Sonnet,
Claude Opus lanes), 21 judged scorecards:

- **No single-agent run ever exceeded 10% of rubric criteria.** Not once,
  on any model.
- **Three orchestrated runs reached 48–81%**: DeepSeek-orchestrated
  immigration runs at 22/27 and 16/27, and an Opus-orchestrated GDPR
  analysis at 34/46. Nothing in the single-agent column ever came close.

So orchestration showed a higher *ceiling* and an equal *median*:
occasionally it unlocked results no single agent reached; usually it
didn't. "Sometimes brilliant, usually the same" is a research lead, not a
product claim — so the product claim is withdrawn until the lead is run
down.

### Open anomaly (flagged, unresolved)

The immigration task scored **exactly 1/27 for every Claude-family run in
either arm** — six runs, two models, identical score — while only
DeepSeek-orchestrated runs ever beat it. That pattern smells like
deliverable-genre/rubric fit rather than pure capability. It's the first
thing the next measurement cycle should chase.

### Also honest: these rubrics are brutal for everyone

Harvey LAB criteria demand exhaustive, expert-level cross-referencing (a
missing exhibit inferred from an index skipping from G to I; a financing
gap quantified to the day). Even the best run of the campaign (34/46)
failed the all-pass bar. Absolute scores here say as much about the bar as
about the agents — which is why we report per-criterion counts, not just
pass/fail.

## What the campaign proved about the trust layer

The negative result cost us a claim. The campaign itself validated the
architecture, repeatedly and in public view:

1. **Behavioral verification catches what source review can't.** A routine
   upstream version bump (~800 commits) silently changed four API
   behaviors: a required document format field, a document-key grammar, a
   per-agent authorization boundary on assigned issues, and
   wake-on-assignment semantics. Every one was caught by running real
   behavior against the real system and fixed test-first — the same
   philosophy as our `bin/conformance-paperclip` gate, vindicated four
   times in one week.
2. **Identity separation is not optional.** The harness originally
   authenticated as the chief-of-staff's own agent key — and the moment
   that agent had a live session, the shared identity's requests started
   bouncing off its authorization boundary. The fix (the harness acts as
   the operator, never as a combatant) is the same principle behind the
   gate proxy holding egress credentials that agents never see.
3. **The validity guardrails worked on us.** Arm A leads delegated when
   the design assumed they wouldn't — 7 of 12 early baseline runs — and
   the harness's decomposition detector flagged every one for exclusion.
   One lead delegated *despite* an explicit instruction not to. Guardrails
   that catch your own experiment cheating are guardrails you can trust on
   someone else's.
4. **Fail-closed hygiene has a cost model.** Abandoned matters kept their
   agents working — invisible spend, starved queues — until
   cancel-on-timeout landed. Budget caps fired exactly as designed (a $20
   cap paused a runaway $37 reasoning-model burn mid-flight), and the gap
   between internally-metered and vendor-billed cost (~40% on a reasoning
   model) is now a documented finding for anyone metering agent spend.
5. **The economics are real data.** Same experiment, three tiers:
   reasoning-frontier tokens ran ~$3/run before completing anything; a
   flash-tier model ran the entire 12-run pipeline for $1.70;
   subscription-billed frontier arms cost $0 marginal cash. Orchestrated
   arms cost ~60% more than single agents — the multiplier your
   architecture buys, now quantified.

None of the architecture claims — hash-chained receipts, RFC 3161
anchoring, ethical walls with non-disclosure, the citation gate, the
deterministic deadline engine, human gates at consequential boundaries —
depended on the quality thesis. They are what made this experiment
*auditable*, and they came through it stronger.

## What changes

- The README no longer asserts decomposition produces better work product
  as a settled fact; it links here instead. Control, auditability, and
  provenance claims stand unchanged.
- The harness ships with everything this campaign hardened: judge-model
  selection, tunable await ceilings, cancel-on-timeout, furnish-then-assign
  matter setup, board-actor identity, and per-criterion score mining.
- Next measurement cycle, when budget and curiosity align: resolve the
  immigration rubric-fit anomaly, re-test at K≥3 on the tasks where the
  ceiling appeared, and run the cost-frontier arm (the GLM/Kimi experiment
  this campaign designed but did not finish).

## Reproduce it

Everything here is reproducible from a clone: the harness
(`orchestration-eval/`), the variants (`companies/legal-operations/variants.yaml`),
the runbook (`docs/operator-test-checklist.md` §G), and Harvey LAB pinned as
a submodule. Scores land as per-criterion JSON you can read yourself. If
you find a flaw in our method, we want the issue.
