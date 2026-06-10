---
name: skill-authoring
description: Draft a new SKILL.md for this package as a reviewable work product when a repeatable pattern is spotted — dedup against existing skills first, follow the package format rules, and never publish without explicit operator approval.
metadata:
  sources:
    - path: paperclip/docs/companies/companies-spec.md
      kind: local-file
      usage: referenced
      license: Apache-2.0
      attribution: Paperclip
---

# Skill Authoring

Use this skill to turn a repeatable pattern ("we do this every week", "third time we've written this kind of clause summary") into a draft `SKILL.md` for the PossibLaw package. The output of this skill is a **draft posted as a work product on the issue** — never a file written into the live package and never an import.

## When To Invoke

- Chief of Staff or a lead routed a "repeatable pattern" issue to you.
- The operator explicitly asked for a new skill.
- You completed a matter and the operator's comments show the same playbook was applied for the third time or more.

## Step 0 — Dedup check (always first)

Before drafting anything, list the existing skills and check for overlap:

1. Read the package skill inventory (the `skills/` directory of the package, or the company skill list in the Paperclip UI/API).
2. If an existing skill covers ≥70% of the pattern, **do not create a duplicate**. Post a work product proposing an edit to the existing skill instead: name the skill, quote the sections to change, and show the new text.
3. If the pattern is genuinely new, continue.

## Step 1 — Gather required facts

A draftable skill needs all of these. If any are missing, use the `missing-info-gate` skill to block with the exact gaps rather than guessing:

- The trigger: when should an agent invoke this skill?
- The steps: the repeatable procedure, in order, as observed in real matters.
- The output shape: what the skill produces (document section, checklist, comment format).
- The boundaries: what the skill must NOT do (advice lines, send/transmit actions, irreversible steps).
- Source provenance: where the pattern came from (operator comments, an existing matter, an external Apache-2.0 source).

## Step 2 — Draft the SKILL.md

Format rules (match the package house style exactly):

- Frontmatter: `name` (kebab-case slug == directory name), `description` (one sentence, starts with a verb, states trigger + outcome), `metadata.sources` (list with `path`/`kind`/`usage`/`license`/`attribution`).
- Naming: `<domain>-<noun>` with the package's domain prefixes (`legal-`, `finance-`, `marketing-`, `admin-`, `output-`, `notify-`, `connector-`). Collisions at 100–200 agent scale are real; the prefix is not optional.
- Body: start with a one-paragraph "what this is", then `## When To Invoke`, then numbered steps, then boundaries/defaults. Tables for defaults. No tabs, no trailing whitespace.
- The regulated-practice note lives at package/intake surfaces only — do not add lawyer-review boilerplate to the skill body.
- Never include secrets, webhook URLs, machine-local absolute paths, or operator-specific account values. Env vars by name only.

## Step 3 — License and provenance gate (external material only)

If any content is adapted from outside this package:

1. Verify the license at the exact upstream commit. Apache-2.0/MIT/BSD: adaptable with attribution. AGPL/LGPL/unknown: STOP — post the gate and let the operator decide; do not vendor.
2. Record the upstream in `metadata.sources` with a pinned commit and set `usage: vendored | referenced | mirrored` honestly.
3. Note the attribution requirement in your work product so the operator can update `NOTICE` when integrating.

## Step 4 — Post for review (mandatory gate — no exceptions)

1. Post the complete draft SKILL.md as a work product comment on the issue, inside a fenced code block, with the intended path (`companies/legal-operations/skills/<slug>/SKILL.md`) stated above it.
2. Include a 3-line summary: what it automates, which agents should attach it, what was deduped against.
3. End with: `AWAITING OPERATOR APPROVAL — reply "APPROVED: <slug>" to integrate.`
4. **Stop.** Do not write the file into the package, do not call any import/sync endpoint, do not attach the skill to any agent. Integration happens only after the operator's explicit approval, as a separate reviewed change.

If the operator rejects or amends, revise in place on the same issue. Every revision repeats this gate.
