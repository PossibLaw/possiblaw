---
name: applying-simplicity-ladder
version: 1.0.0
description: Use when about to write code or add a dependency; after understanding the problem, climb the simplicity ladder and pick the simplest option that actually works before writing anything new.
---

# Applying The Simplicity Ladder

Theme: **lazy about the solution, never about reading.** Analyze the problem
thoroughly, then build as little as possible. This is an always-on Tier 1 habit —
less generated code means fewer tokens, lighter review, and less to maintain later.

## Inputs
- a clear understanding of the problem (read the surrounding code first)
- what already exists in the codebase, the language, and the platform

## Steps
First, make sure you actually understand the problem — read the relevant code and
tests. Do not skip this; the laziness is about the solution, not the analysis.

Then prefer the simplest option that works, in this order. Stop at the first rung
that solves the problem:

1. **Does this even need to exist?** The best change is often no change. Question
   the requirement before building.
2. **Reuse something already in the codebase** — an existing function, helper, or
   pattern.
3. **Use the language standard library.**
4. **Use a native platform feature** (the OS, the framework, the runtime).
5. **Use an existing dependency** already installed in the project.
6. **A small, well-understood one-liner.**
7. **Only then write a minimal new solution** — the smallest thing that passes.

## Outputs
- the simplest workable approach, with a one-line note on why lower rungs did not fit
- less new code to read, review, and maintain

## Common Mistakes
- jumping straight to a new library or framework without checking rungs 1–5
- being lazy about *reading* (shipping a guess) instead of lazy about *building*
- gold-plating: adding options, abstractions, or generality nobody asked for
- adding a dependency to save a few lines that the standard library already covers
