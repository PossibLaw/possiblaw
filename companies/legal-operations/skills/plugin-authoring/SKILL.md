---
name: plugin-authoring
description: Draft a new connector descriptor or external-source integration as a reviewable work product — verify vendor endpoints and upstream licenses first, and never publish without explicit operator approval.
metadata:
  sources:
    - path: paperclip/docs/companies/companies-spec.md
      kind: local-file
      usage: referenced
      license: Apache-2.0
      attribution: Paperclip
---

# Plugin / Connector Authoring

Use this skill when the repeatable pattern is an **integration**: a vendor API the agents keep needing (research database, document store, billing system, signature service), or an external skill/agent source worth adapting into the package. The output is a **draft posted as a work product on the issue** — never a file written into the live package and never an import.

In this package, integrations ship as connector descriptor skills (`skills/connector-<vendor>/SKILL.md`) that document scope, auth, endpoints, and usage rules for the agents that attach them. Paperclip-native plugins/tools are out of scope for drafts — flag those to the operator as engineering work.

## When To Invoke

- An agent repeatedly describes manual steps against an external system ("operator, please look this up in X").
- The operator names a vendor to integrate.
- An external skill/agent repo is proposed as source material for the package.

## Step 0 — Dedup check (always first)

Read the existing connector inventory (`skills/connector-*/`). If the vendor is already described, propose extending that descriptor (new endpoint section, new usage rule) instead of creating a parallel one.

## Step 1 — Verify before describing

Connector descriptors are only useful if they are true:

1. Endpoints, auth model, and rate limits come from the vendor's **current official docs** — cite the doc URL and the date checked in the descriptor body. Anything unverifiable is written as `UNCONFIRMED` next to the specific claim, never silently invented (this package already carries `UNCONFIRMED` flags on Lexis/Westlaw/midpage/iManage/NetDocuments — follow that precedent).
2. Auth is described by env var name only (e.g. `POSSIBLAW_NOTION_TOKEN`). Never include a real token, account id, or workspace URL.
3. State the data-sensitivity posture: does matter content leave the machine? If yes, note the privacy-encoder interaction for confidential/privileged tiers.

## Step 2 — License and provenance gate (external sources)

For adapting external skills/agents/plugins into the package:

1. Verify the license at the exact upstream commit before reading deeply. Apache-2.0/MIT/BSD: adaptable with attribution and a pinned `metadata.sources` entry. AGPL/LGPL: reference-architecture only — post the gate and stop; vendoring needs an explicit operator license decision (standing precedent: Mike is AGPL-3.0 and LegalRabbit is LGPL-3.0; both are excluded from this Apache-2.0 package).
2. Record in the draft's `metadata.sources`: `repo`, `path`, `commit`, `license`, `attribution`, `usage: vendored | referenced | mirrored`.
3. Note the `NOTICE` update the operator must make when integrating vendored or materially adapted content.

## Step 3 — Draft the descriptor

Match the house style of an existing descriptor (e.g. `skills/connector-notion/SKILL.md`): frontmatter (`name: connector-<vendor>`, one-sentence `description`, `metadata.sources`), then `# <Vendor> Connector`, `## What This Is`, scope/endpoints/auth/usage-rules sections, boundaries (read-only vs write, send/transmit restrictions, approval gates for anything irreversible).

## Step 4 — Post for review (mandatory gate — no exceptions)

1. Post the complete draft as a work product comment, fenced, with its intended path.
2. Include a 3-line summary: vendor + scope, auth model, what remains `UNCONFIRMED`.
3. End with: `AWAITING OPERATOR APPROVAL — reply "APPROVED: <slug>" to integrate.`
4. **Stop.** No package writes, no imports, no live API calls against the vendor. Integration is a separate reviewed change after explicit operator approval.
