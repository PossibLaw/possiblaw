# Evals — convention placeholder

This directory locks the eval convention without shipping the runtime. When eval
work begins (a separate sprint), follow these rules so cases, the judge, and
the results project hang together.

## How a PossibLaw eval works

```
            ┌────────────────────────┐
routine ──▶ │ eval-runner skill      │ ──▶ enqueues one issue per case
            └────────────────────────┘            into target project
                       │
                       ▼
               target agent runs
                       │
                       ▼
            ┌────────────────────────┐
            │ judge agent            │ ──▶ reads output, comments PASS/FAIL,
            └────────────────────────┘     adds issue to `eval-results` project
```

1. **Routine** — a recurring Paperclip routine (cron-triggered). Declared in
   `.paperclip.yaml` `routines:` or as `recurring: true` on a task. Owns the
   schedule and the set of cases to evaluate this cycle.
2. **eval-runner skill** — reads one or more case markdown files from
   `evals/cases/`, opens a new Paperclip issue per case, assigns it to the
   *target* agent (whatever agent we are evaluating), and tags the issue's
   metadata with `metadata.possiblaw.evalCaseId: <case-slug>`.
3. **Target agent** — runs the case as normal work. No special path; the eval
   is whatever the target would do for this kind of input in production.
4. **Judge agent** — separate agent (planned: `eval-judge`) that watches for
   issues tagged with the eval metadata, reads the target's output, and posts
   a PASS / FAIL comment with a structured rubric result. Moves the issue into
   the `eval-results` project.
5. **eval-results project** — collects judged outcomes. Operator can browse
   pass/fail rate over time in the Paperclip UI.

## Case file format

Each case is a single markdown file under `evals/cases/<slug>.md` with this
frontmatter shape (planned — locked here, not consumed by anything yet):

```yaml
---
slug: nda-mutual-baseline-acme-globex
target: nda-drafter             # agent slug under test
project: nda-matters            # project where the test issue should land
input_brief: |
   Draft a mutual NDA between ACME Inc. and Globex Corp.,
   Delaware law, two-year term.
rubric:
   - id: governing-law
     prompt: "Is the governing law Delaware?"
   - id: term
     prompt: "Is the confidentiality term two years?"
   - id: mutual
     prompt: "Are both parties bound symmetrically?"
metadata:
   possiblaw:
     priority: high
     introduced: 2026-05-23
---

Optional free-text expansion of the brief, examples of expected output,
known traps, references to source contracts, etc.
```

The eval-runner skill (when built) parses this file, opens an issue in
`projects.<project>` with the input brief as the issue description, and stores
the rubric under `metadata.possiblaw.rubric` for the judge to read.

## What lives here today

- `README.md` — this file. Documents the convention.
- `cases/.gitkeep` — placeholder so the directory survives in git until cases
  land.

## What does NOT live here yet (build later)

- `eval-runner` skill (`skills/eval-runner/SKILL.md` — to be authored).
- `eval-judge` agent (`agents/eval-judge/AGENTS.md` — to be authored).
- Actual eval cases (`cases/*.md`).
- The `eval-results` project's lead agent (currently a placeholder
  pointing at `chief-of-staff` in `.paperclip.yaml`; swap to `eval-judge`
  when that agent ships).

When you start the eval sprint, the order is: judge agent → runner skill →
case authoring → wire a routine into `.paperclip.yaml` → commit.
