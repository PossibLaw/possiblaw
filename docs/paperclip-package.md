# PossibLaw as a Paperclip Package

PossibLaw is being reframed from a standalone CLI runtime into an Agent Companies package for Paperclip. Paperclip should own orchestration, UI, auth, audit trail, budgets, approvals, task state, and adapter execution. PossibLaw should own legal-business content: agent instructions, skills, playbooks, templates, and workflows.

## Current Package

The first package slice lives at:

```bash
companies/legal-operations/
```

It contains:

| Item | Count | Notes |
|---|---:|---|
| Agents | 4 | Chief of Staff, Chief Counsel, Commercial Lead, NDA Drafter |
| Skills | 3 | NDA playbook, matter intake, conflicts check |
| Projects | 1 | `NDA Matters` |
| Starter tasks | 1 | `Draft Mutual NDA Demo` assigned to Chief of Staff |

This is intentionally smaller than the legacy `layer/*` inventory. It proves the Paperclip-native path before the standalone runtime is removed.

## Import

From a running Paperclip checkout:

```bash
pnpm paperclipai company import ../companies/legal-operations --target new --dry-run
pnpm paperclipai company import ../companies/legal-operations --target new --yes
```

Paperclip's current CLI uses a positional import path. Do not use `--from`.

For a clean first-time demo with an isolated data directory, follow [operator-walkthrough.md](operator-walkthrough.md).

## Runtime Shape

```text
Operator
  -> Chief of Staff
    -> Chief Counsel
      -> Commercial Lead
        -> NDA Drafter
          -> legal-nda-playbook
          -> legal-matter-intake
          -> legal-conflicts-check
```

The package sets explicit `codex_local` adapters for each agent in `.paperclip.yaml`. This is a Paperclip sidecar decision, not base Agent Companies markdown, and matches the operator-validated Codex subscription-auth smoke path. Timer heartbeats are disabled on import, while assignment, on-demand, and automation wakes are enabled.

Operators can switch agents to `claude_local` or another adapter in the Paperclip UI after import. The package does not export API keys, absolute local paths, provider secret IDs, or machine-specific `cwd` values.

## Validation

The package has been validated against disposable local Paperclip instances:

- Import preview returned 4 agents, 3 skills, 1 project, 1 starter issue, and no warnings/errors.
- Actual import created the company, agents, project, and starter issue.
- Post-import readback confirmed NDA Drafter received all three company-scoped legal skills through `paperclipSkillSync.desiredSkills`.
- Static file checks found no unreadable files and no tabs or trailing whitespace.
- The operator reported a clean localhost UI smoke test using a fresh data directory, fresh instance, package import, Codex CLI device auth, and the starter workflow.

## Known Gaps

- Approval-gate enforcement is not yet represented as a portable package primitive.
- Only the NDA vertical slice has been converted. The broader legacy `layer/*` content remains source material for later package expansion.
- The standalone CLI still exists for historical continuity, but new work should not extend it.
