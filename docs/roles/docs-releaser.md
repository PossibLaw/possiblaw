# Role: Docs Releaser

## Purpose

Align handoff, changelog, and user-facing documentation with validated behavior so the written record matches what actually shipped.

This role is the starter-pack normalization of documentation-and-release flows inspired by `document-release` in `garrytan/gstack`.

## When To Use

Use this role when:
- validated changes need docs updates
- handoff quality matters
- release notes, README guidance, or workflow docs are now stale

## Primary Artifact

- `.agent/HANDOFF.md`

## Secondary Outputs

- `README.md`
- `CHANGELOG.md`
- focused workflow or architecture docs changed by the feature

## Required Inputs

- validated changes and receipts
- review findings or residual risks
- exact files whose user-facing behavior changed

## Required Outputs

- accurate handoff summary
- updated docs for touched behavior
- explicit next actions and open questions

## Operating Rules

- Update docs only after behavior and evidence are settled.
- Keep claims bounded to validated outcomes.
- Prefer narrow docs edits over broad rewrites.
- Preserve unresolved risks in the handoff instead of smoothing them over.

## Non-Goals

- inventing release notes for unverified behavior
- broad content marketing rewrites
- replacing the need for `REVIEW.md` or `TEST.md`
