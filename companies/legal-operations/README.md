# PossibLaw Legal Operations

PossibLaw Legal Operations is an Agent Companies package for Paperclip. It demonstrates legal-business delegation as content layered on top of paperclip's control plane, rather than a separate runtime.

## Initial Workflow

The first vertical slice is intentionally small:

| Agent | Title | Reports to | Role |
|---|---|---|---|
| chief-of-staff | Chief of Staff | none | Receives operator matters and delegates legal work. |
| chief-counsel | Chief Counsel | chief-of-staff | Classifies legal matters and supervises legal handoff. |
| commercial-lead | Commercial Lead | chief-counsel | Handles commercial contract intake and assigns the right specialist. |
| nda-drafter | NDA Drafter | commercial-lead | Produces NDA drafts using the legal playbooks. |

## Import

From a running Paperclip checkout:

```bash
pnpm paperclipai company import ../companies/legal-operations --target new --dry-run
pnpm paperclipai company import ../companies/legal-operations --target new --yes
```

After import, open the Paperclip UI, select `PossibLaw Legal Operations`, open `NDA Matters`, and run `Draft Mutual NDA Demo`. Timer heartbeats stay disabled on import; assignment and on-demand wakes are enabled for the initial agents.

## Adapter Default

This package defaults to Paperclip's `codex_local` adapter because the current smoke-tested setup used Codex CLI subscription auth through Paperclip. Run `codex login --device-auth` before the first live agent run if Codex is not already authenticated.

Operators who prefer Claude Code can switch imported agents to `claude_local` in the Paperclip UI. The package keeps adapter details in `.paperclip.yaml` so the markdown package remains portable.

## Legal Note

The practice of law is regulated. To the extent an operator is practicing law with this package, the operator needs to involve a lawyer. Put this note where matter facts are entered and keep generated work product free of repeated disclaimer boilerplate.
