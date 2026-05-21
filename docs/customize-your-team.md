# Customize Your Team

A guide for operators who want to change what their PossibLaw team can do — without touching any source code.

---

## 1. What This Guide Is For

PossibLaw comes with a built-in team of AI agents: routers that triage incoming work, leads that manage a legal or business domain, and specialists that produce actual deliverables (NDAs, invoices, intake forms, etc.).

You will eventually want more. Maybe you handle trademark filings and none of the built-in specialists cover that. Maybe you want NDA drafts to use a cheaper model. Maybe you have a new business line and want a custom agent for it.

This guide shows you how to do all of that from the command line. No TypeScript required. No editing source files. All changes live in `.possiblaw/` — a directory that is gitignored by default, which means your customizations stay local to your deployment.

---

## 2. Concepts in 30 Seconds

**Agent** — an AI agent with a role, a system prompt, and a model. Every agent is a `.md` file with a YAML frontmatter header that defines its behavior.

**Router** — the first agent a request reaches. Reads the user prompt and decides which lead or specialist handles it. Example: `chief-counsel`.

**Lead** — sits between a router and specialists. Owns a domain (legal, finance, marketing, admin). Routes to the right specialist. Example: `commercial-lead`.

**Specialist** — does the actual work: drafts documents, categorizes expenses, proposes meeting times. Example: `nda-drafter`.

**Template** — a named roster that lists which routers, leads, and specialists are active for your deployment. Example: `small-firm`. Templates live in `layer/templates/`.

**Override** — a change you make in `.possiblaw/` that layers on top of the built-in template without modifying source files. Overrides survive `git pull` updates to the layer.

**Model** — the AI model an agent uses. Specified as `anthropic/claude-sonnet-4-6`, `anthropic/claude-haiku-4-5`, `ollama/llama3.1:8b`, etc. Changing an agent's model changes its cost and capability trade-off.

---

## 3. Common Tasks

### Make NDA Drafting Cheaper

Run NDAs on Haiku instead of Sonnet — roughly 4× cheaper per token:

```bash
possiblaw team set-model nda-drafter anthropic/claude-haiku-4-5
```

Verify the change:

```bash
possiblaw team show-model nda-drafter
```

To revert: edit `.possiblaw/overrides.yaml` and remove the `nda-drafter` entry, or set it back to `anthropic/claude-sonnet-4-6`.

---

### Add a Specialist for Trademark Filings

**Step 1 — Scaffold the agent:**

```bash
possiblaw team add specialist legal/trademark/trademark-filer --lead commercial-lead
```

This creates `.possiblaw/custom-agents/trademark-filer.md` and registers the agent in the `small-firm` template.

To target a different template:

```bash
possiblaw team add specialist legal/trademark/trademark-filer --lead commercial-lead --template solo-lawyer
```

**Step 2 — Fill in the system prompt:**

Open `.possiblaw/custom-agents/trademark-filer.md` in any text editor. The file has a placeholder system prompt. Replace the `## TODO` section with real instructions.

For reference, copy the structure from:

```
layer/agents/specialists/legal/commercial/nda-drafter.md
```

That file shows the pattern: what the specialist does, what it does not do, defaults for missing information, and the required disclaimer format.

**Step 3 — Verify it appears in the roster:**

```bash
possiblaw team list --template small-firm
```

You should see `trademark-filer` in the specialists list.

**Step 4 — Test offline:**

```bash
env -u ANTHROPIC_API_KEY possiblaw run quick-counsel "file a trademark application for ACME logo design"
```

In offline mode, the pipeline routes through your new agent and returns `[OFFLINE STUB FOR trademark-filer]`. That confirms routing works. Once you fill in the system prompt, the live run will produce real output.

---

### Remove a Specialist You Don't Need

```bash
possiblaw team remove pitch-polisher
```

This removes `pitch-polisher` from the `small-firm` template roster. The agent file in `layer/agents/` is not deleted — it belongs to the layer. If you had created `pitch-polisher` as a custom agent, its file at `.possiblaw/custom-agents/pitch-polisher.md` is retained too. Delete it manually if you want it gone entirely.

To remove from a specific template:

```bash
possiblaw team remove pitch-polisher --template solo-lawyer
```

If the agent is still listed in another agent's `manages` field, the command will refuse and tell you which file to edit first.

---

### Save Your Roster to Share

Export a complete snapshot of your current effective team — including all overrides and custom agents — to a YAML file:

```bash
possiblaw team export small-firm --output my-team.yaml
```

The output file includes:
- The effective roster (base template + your additions/removals)
- The full frontmatter for every active agent (with models reflecting your overrides)
- Which agents are custom (from `.possiblaw/`) vs. built-in (from `layer/`)
- A log of which overrides were applied

This file is safe to commit to a private configuration repo (it contains no credentials) and is useful for auditing what your team looked like on a given date.

---

### Compare Two Templates

See what is different between the `solo-lawyer` and `small-firm` templates:

```bash
possiblaw team diff solo-lawyer small-firm
```

Output uses `+` for agents/workflows in the second template that are not in the first, `-` for agents that are in the first but not the second, and `~` for per-agent model changes.

---

### Rename a Custom Agent

If you want to rename an agent you created (only works on agents in `.possiblaw/custom-agents/`, not on built-in `layer/agents/` files):

```bash
possiblaw team rename trademark-filer trademark-specialist
```

This renames the file, updates the `name:` field in the frontmatter, and updates any references in `.possiblaw/template-overrides.yaml` and `.possiblaw/overrides.yaml`.

---

## 4. Frontmatter Cheat-Sheet

Every agent `.md` file starts with a YAML frontmatter block between `---` markers. Here is what each field does.

**`name`** — The unique identifier for this agent. Must match the filename (without `.md`). This is what you pass to `team remove`, `team set-model`, etc. Example: `name: nda-drafter`.

**`role`** — One of `router`, `lead`, or `specialist`. The role determines where in the routing chain this agent sits and what format its output must follow. Routers and leads must output a `ROUTE_TO:` directive. Specialists produce the final deliverable.

**`domain`** — One of `legal`, `marketing`, `finance`, `admin`, `ops`. Used for display color-coding in `team list` and for validation when you add a specialist.

**`reports_to`** — The name of the agent directly above this one in the hierarchy. For a specialist, this is usually a lead. For a lead, this is usually a router. Set to `null` for top-level routers. Example: `reports_to: commercial-lead`.

**`manages`** — A list of agent names this agent can route to. For a router, this would be leads. For a lead, this would be specialists. Example: `manages: [nda-drafter, trademark-filer]`. Note: the offline routing fixture does not read `manages` — it uses prompt-content heuristics. You need to update the system prompt to match.

**`model`** — The AI model to use for this agent. Format: `anthropic/<model-id>`, `ollama/<model-name>`. You can override this per-agent using `possiblaw team set-model` without editing the file. Example: `model: anthropic/claude-sonnet-4-6`.

**`fallback_model`** — The model to use if the primary model is unavailable or over capacity. Same format as `model`. Typically set to a cheaper or locally-available model. Example: `fallback_model: anthropic/claude-haiku-4-5`.

**`tests`** — A list of test suite names to run after this agent produces output (currently only applies to specialists). Tests are defined in `layer/tests/`. Example: `tests: [groundedness]`.

**`guardrails`** — A list of guardrail suite names to check the specialist's output against. Guardrails that trigger send the matter to human review. Example: `guardrails: [signed-document]`.

**`skills`** — A list of skill names injected into this agent's system prompt at runtime. Skills are reusable instruction snippets defined in `layer/skills/`. Example: `skills: [matter-intake, nda-playbook]`.

**`connectors`** — A list of connector IDs this agent is authorized to use (e.g., `stripe`, `local-fs-doc-store`). Declaration only in Sprint 6; runtime dispatch comes later. Example: `connectors: [local-fs-doc-store]`.

**`description`** — A one-line summary shown in `possiblaw team list`. Keep it under 100 characters. Example: `description: Drafts mutual NDAs for commercial counterparties.`

---

## 5. When You've Broken It

Nothing in `.possiblaw/` is sacred. If something goes wrong:

**Agent no longer found:** Check that the `name:` in the frontmatter matches the filename. If you edited the file by hand and changed `name:`, either rename the file to match or change the name back.

**Template looks wrong after edit:** Delete the `.possiblaw/template-overrides.yaml` file and start over with `team add`. The file is regenerated from scratch on the next `team add` or `team remove`.

**Model override behaving strangely:** Open `.possiblaw/overrides.yaml` and inspect the `overrides:` block. Each entry is `agent-name: { model: '...' }`. Delete the entry you regret and run `possiblaw team show-model <agent>` to confirm the reversion.

**Custom agent file corrupted:** Delete `.possiblaw/custom-agents/<name>.md` and re-run `possiblaw team add specialist` to regenerate the scaffold. Then paste your system prompt back in.

**General recovery command:**

```bash
# Remove all operator customizations and start fresh
rm -rf .possiblaw/template-overrides.yaml .possiblaw/custom-agents/
# (This does NOT remove .possiblaw/overrides.yaml — model overrides survive)
```

---

## 6. What You Can't Do (Yet)

These features are on the roadmap but not available in v1:

- **Visual UI** — a web interface for editing agents and templates without using the CLI. Planned for post-v1 (see plan §7.5).
- **Per-template model overrides** — currently model overrides apply globally to an agent across all templates. Per-template overrides are not yet supported.
- **Live agent editing** — changes to an agent's system prompt take effect on the next `possiblaw run`, but there is no hot-reload or diff preview mode yet.
- **Sharing overrides between deployments** — `.possiblaw/` is gitignored by design. To share customizations, use `possiblaw team export` to snapshot your roster and commit that file to a separate configuration repo.
- **Deleting or modifying built-in layer agents** — the files in `layer/agents/` belong to the PossibLaw layer and should not be edited directly. Instead, create a custom agent in `.possiblaw/custom-agents/` with the same name — it will shadow the layer agent.
