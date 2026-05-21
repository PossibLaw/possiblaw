# PossibLaw v2 — Layer

This directory contains all PossibLaw layer content: agents, skills, workflows, templates, tests, and guardrails.

## Directory Structure

```
layer/
├── agents/              # Agent definition files (.md with YAML frontmatter + system prompt)
│   ├── chief-counsel.md         # Top-level legal router (role: router)
│   ├── leads/legal/
│   │   └── commercial-lead.md   # Commercial law lead (role: lead)
│   └── specialists/legal/commercial/
│       └── nda-drafter.md       # NDA drafting specialist (role: specialist)
│
├── skills/              # Reusable skill files (.md); injected into agent prompts at runtime
│   └── legal/
│       ├── matter-intake.md     # Checklist for capturing matter facts
│       ├── conflicts-check.md   # Conflicts-of-interest check procedure
│       └── nda-playbook.md      # NDA drafting playbook with standard defaults
│
├── workflows/           # Workflow pipeline definitions (.yaml)
│   └── quick-counsel.yaml       # Fast turnaround pipeline for low-stakes matters
│
├── templates/           # Starter roster templates (.yaml); used to instantiate a practice
│   └── solo-lawyer.yaml         # Day-one roster for a solo lawyer
│
├── tests/               # Soft (retryable) test definitions (.yaml)
│   └── groundedness.yaml        # Sprint 1a stub: always passes; real check in Sprint 2
│
├── guardrails/          # Hard guardrail definitions (.yaml)
│   └── risk-gates/
│       └── signed-document.yaml # Blocks any signature-bound document; routes to human
│
├── evals/               # Reserved for future eval harness (Sprint 2+)
├── mcp/                 # Reserved for MCP server configurations (Sprint 2+)
└── privacy-filter/      # Reserved for PII redaction configuration (Sprint 2+)
```

## Sprint 1a Contents

Sprint 1a ships the minimum vertical slice needed to demo the "draft an NDA" flow end-to-end:

- **3 agents**: chief-counsel → commercial-lead → nda-drafter
- **3 skills**: matter-intake, conflicts-check, nda-playbook
- **1 workflow**: quick-counsel
- **1 template**: solo-lawyer
- **1 stub test**: groundedness (deterministic pass)
- **1 stub guardrail**: signed-document (unconditional human-required block)
