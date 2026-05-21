# Canonical Role Registry

This directory is the source of truth for host-agnostic delivery roles in the starter pack.

Rules:
- Put the role contract here first.
- Treat Claude and Codex behavior as host wrappers over the same role contract.
- Keep role outputs shaped for the artifact pipeline: `PLAN.md`, `TEST.md`, `REVIEW.md`, `HANDOFF.md`.
- Do not duplicate role logic in `AGENTS.md`, `CLAUDE.md`, or `.claude/agents/*.md`.

## Canonical Roles

| Role | Primary Artifact | Use When | Claude Wrapper |
| --- | --- | --- | --- |
| `product-strategist` | `.agent/PLAN.md` | Goal, scope, or sequencing is still fuzzy | `@product-strategist` |
| `engineering-planner` | `.agent/PLAN.md` | Implementation plan, architecture, and execution order need to be made explicit | `@engineering-planner` |
| `reviewer` | `.agent/REVIEW.md` | Correctness, regressions, or maintainability need structured review findings | `@reviewer` |
| `security-reviewer` | `.agent/REVIEW.md` and `.agent/TEST.md` | Auth, data access, input handling, API, or deployment/runtime risk matters | `@security-reviewer` |
| `qa-validator` | `.agent/TEST.md` | Evals, commands, and evidence receipts need execution and recording | `@qa-validator` |
| `docs-releaser` | `.agent/HANDOFF.md` and docs | User-facing docs, handoff, or release notes must match validated changes | `@docs-releaser` |

## Host Wrapper Contract

Every host wrapper should:
- read the relevant role file in this directory before acting
- keep host-specific instructions thin and non-conflicting
- preserve the required artifact format and evidence rules
- mark unresolved facts as `UNCONFIRMED`

Supporting specialists such as research or doc-only helpers may exist, but they do not replace the canonical roles above.
