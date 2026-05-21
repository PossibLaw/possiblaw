#!/usr/bin/env node
/**
 * PossibLaw v2 — CLI entry point.
 */
import { readFileSync, existsSync, appendFileSync, mkdirSync, writeFileSync, renameSync, readdirSync, statSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Command } from 'commander';
import { loadWorkflow, loadTemplate, loadAgent, listAgentNames, listCustomAgentNames, listWorkflowNames, REPO_ROOT } from './loader.js';
import { runEval } from './eval.js';
import type { KnownDataset as EvalDataset } from './eval-adapters.js';
import { runPipeline } from './pipeline.js';
import {
  printBanner,
  printStep,
  printReport,
  printTeamList,
  printAuditLog,
  printCostReport,
} from './printer.js';
import { replay } from './audit.js';
import { loadKeyStore } from './privacy-filter.js';
import { writeOverride, getEffectiveModel, loadOverrides } from './overrides.js';
import { estimateWorkflowCost, formatCost } from './pricing.js';
import { listConnectors, getConnector } from './connectors/index.js';
import {
  addToTemplateRoster,
  removeFromTemplateRoster,
  renameInTemplateOverrides,
  loadTemplateOverrides,
  applyRosterOverrides,
} from './template-overrides.js';
import matter from 'gray-matter';
import yaml from 'js-yaml';

// ---------------------------------------------------------------------------
// Version from package.json
// ---------------------------------------------------------------------------
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function getVersion(): string {
  try {
    const pkgPath = join(REPO_ROOT, 'package.json');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as { version?: string };
    return pkg.version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

// ---------------------------------------------------------------------------
// CLI definition
// ---------------------------------------------------------------------------
const program = new Command();

program
  .name('possiblaw')
  .description('PossibLaw CLI — AI-assisted legal workflow runner')
  .version(getVersion(), '-v, --version');

// ---------------------------------------------------------------------------
// possiblaw run <workflow> <prompt>
// ---------------------------------------------------------------------------

/**
 * Known provider names accepted by --provider. Must match the providers in
 * cli/llm.ts and the DEFAULT_MODEL_PER_PROVIDER table in cli/pipeline.ts.
 */
const KNOWN_PROVIDERS = ['anthropic', 'claude-cli', 'codex-cli', 'ollama'] as const;
type ProviderName = (typeof KNOWN_PROVIDERS)[number];

/**
 * Resolve the offline-mode flag based on the requested provider.
 *
 * - anthropic (or unset): offline if ANTHROPIC_API_KEY is unset.
 * - claude-cli / codex-cli: NEVER offline (subscription auth via local CLI;
 *   the CLIs have their own credentials).
 * - ollama: never offline at this layer — cli/llm.ts handles daemon-unreachable
 *   fallback internally.
 *
 * Returns true when offline fixtures should be used.
 */
function resolveOfflineMode(provider: ProviderName | undefined): boolean {
  if (provider === 'claude-cli' || provider === 'codex-cli') return false;
  if (provider === 'ollama') return false;
  // anthropic (explicit or default)
  return !process.env['ANTHROPIC_API_KEY'];
}

/**
 * Validate that --provider, when supplied, is one of the known names.
 * Exits the process with a clear error message on invalid input.
 */
function validateProvider(raw: string | undefined): ProviderName | undefined {
  if (raw === undefined) return undefined;
  if ((KNOWN_PROVIDERS as readonly string[]).includes(raw)) return raw as ProviderName;
  console.error(
    `Error: --provider '${raw}' is not recognised. Known: ${KNOWN_PROVIDERS.join(', ')}.`
  );
  process.exit(1);
}

program
  .command('run')
  .description('Run a workflow on a matter prompt')
  .argument('<workflow>', 'Workflow name (e.g. quick-counsel)')
  .argument('<prompt>', 'Matter prompt (quoted string)')
  .option('-t, --template <name>', 'Template to activate', 'solo-lawyer')
  .option('--verbose', 'Print full prompts and responses', false)
  .option('--no-color', 'Disable ANSI colour output')
  .option('--privacy-profile <profile>', 'Privacy filter profile: always | cloud-only | off', 'cloud-only')
  .option('--matter-tag <tag>', 'Matter tag (used by privacy-filter-required guardrail)', '')
  .option('--provider <name>', `Route every agent through this provider: ${KNOWN_PROVIDERS.join(' | ')}`)
  .option('--model <name>', 'Model name to use with --provider (defaults: sonnet/gpt-5.5/llama3.1:8b/claude-sonnet-4-6)')
  .action(async (workflowName: string, prompt: string, opts: {
    template: string;
    verbose: boolean;
    color: boolean;
    privacyProfile: string;
    matterTag: string;
    provider?: string;
    model?: string;
  }) => {
    const printerOpts = { color: opts.color, verbose: opts.verbose };
    printBanner(printerOpts);

    const providerOverride = validateProvider(opts.provider);
    const offline = resolveOfflineMode(providerOverride);
    if (offline) {
      console.log('[offline mode — ANTHROPIC_API_KEY not set; using deterministic fixtures]\n');
    }

    const rawProfile = opts.privacyProfile;
    const privacyProfile: 'always' | 'cloud-only' | 'off' =
      rawProfile === 'always' || rawProfile === 'cloud-only' || rawProfile === 'off'
        ? rawProfile
        : 'cloud-only';

    try {
      const workflow = loadWorkflow(workflowName);

      const report = await runPipeline(workflow, prompt, {
        verbose: opts.verbose,
        offline,
        privacyProfile,
        matterTag: opts.matterTag,
        ...(providerOverride !== undefined ? { providerOverride } : {}),
        ...(opts.model !== undefined ? { modelOverride: opts.model } : {}),
      });

      // Print each step as it's surfaced from the report
      for (const step of report.steps) {
        printStep(step, printerOpts);
      }

      printReport(report, printerOpts);

      // Exit code: 0 for delivered and escalated (both are successes), 1 for error
      if (report.status === 'error') {
        process.exit(1);
      }
      process.exit(0);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`\nError: ${message}`);
      process.exit(1);
    }
  });

// ---------------------------------------------------------------------------
// possiblaw team list / set-model / show-model
// ---------------------------------------------------------------------------
const teamCmd = program.command('team').description('Team management commands');

teamCmd
  .command('list')
  .description('List agents in the active template')
  .option('-t, --template <name>', 'Template to inspect', 'solo-lawyer')
  .option('--diff', 'Show what differs from the base template (before overrides)', false)
  .option('--no-color', 'Disable ANSI colour output')
  .action((opts: { template: string; diff: boolean; color: boolean }) => {
    const printerOpts = { color: opts.color };
    printBanner(printerOpts);

    try {
      const template = loadTemplate(opts.template); // effective (with overrides applied)
      const allNames = [
        ...template.roster.routers,
        ...template.roster.leads,
        ...template.roster.specialists,
      ];

      const agents = allNames.map((name) => {
        const a = loadAgent(name);
        return { name: a.name, role: a.role, description: a.description, domain: a.domain };
      });

      printTeamList(agents, opts.template, printerOpts);

      if (opts.diff) {
        // Load the base template (no overrides) by reading the file directly
        const baseFilePath = join(REPO_ROOT, 'layer', 'templates', `${opts.template}.yaml`);
        if (!existsSync(baseFilePath)) {
          console.log('\n(no base template found for diff)');
        } else {
          const baseRaw = yaml.load(readFileSync(baseFilePath, 'utf8')) as { roster: { routers: string[]; leads: string[]; specialists: string[] } };
          const baseNames = new Set([
            ...baseRaw.roster.routers,
            ...baseRaw.roster.leads,
            ...baseRaw.roster.specialists,
          ]);
          const effectiveNames = new Set(allNames);
          const added = allNames.filter((n) => !baseNames.has(n));
          const removed = [...baseNames].filter((n) => !effectiveNames.has(n));

          if (added.length === 0 && removed.length === 0) {
            console.log('\n(no differences from base template)');
          } else {
            console.log('\nDiff from base template:');
            for (const n of added) {
              console.log(`  + ${n}  (added via .possiblaw/template-overrides.yaml)`);
            }
            for (const n of removed) {
              console.log(`  - ${n}  (removed via .possiblaw/template-overrides.yaml)`);
            }
          }
        }
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`\nError: ${message}`);
      process.exit(1);
    }
  });

teamCmd
  .command('set-model')
  .description('Override the model for an agent (writes to .possiblaw/overrides.yaml)')
  .argument('<agent>', 'Agent name (must exist in layer/agents/)')
  .argument('<model>', 'Model string: anthropic/<name> | ollama/<name> | claude-cli/<name> | codex-cli/<name>')
  .action((agentName: string, model: string) => {
    try {
      // Validate agent exists
      const knownAgents = listAgentNames();
      if (!knownAgents.includes(agentName)) {
        console.error(
          `Error: Agent '${agentName}' not found in layer/agents/.\nKnown agents: ${knownAgents.join(', ')}`
        );
        process.exit(1);
      }

      // Validate model format
      const validPattern = /^(anthropic\/(claude-[a-z0-9.-]+)|ollama\/.+|claude-cli\/.+|codex-cli\/.+)$/;
      if (!validPattern.test(model)) {
        console.error(
          `Error: Model '${model}' must be one of:\n  anthropic/claude-<name>\n  ollama/<anything>\n  claude-cli/<anything>  (subscription auth)\n  codex-cli/<anything>   (subscription auth)`
        );
        process.exit(1);
      }

      writeOverride(agentName, model);

      // Ensure .possiblaw/ is in .gitignore
      const gitignorePath = join(REPO_ROOT, '.gitignore');
      if (existsSync(gitignorePath)) {
        const current = readFileSync(gitignorePath, 'utf8');
        if (!current.includes('.possiblaw/')) {
          appendFileSync(gitignorePath, '\n# Per-operator overrides (gitignored)\n.possiblaw/\n', 'utf8');
        }
      }

      const agent = loadAgent(agentName);
      console.log(`\nModel override saved.`);
      console.log(`  Agent:   ${agentName}`);
      console.log(`  Model:   ${agent.model}`);
      console.log(`  Written: ${join(REPO_ROOT, '.possiblaw', 'overrides.yaml')}`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`\nError: ${message}`);
      process.exit(1);
    }
  });

teamCmd
  .command('show-model')
  .description('Show the effective model for an agent (base + any override)')
  .argument('<agent>', 'Agent name')
  .action((agentName: string) => {
    try {
      const knownAgents = listAgentNames();
      if (!knownAgents.includes(agentName)) {
        console.error(
          `Error: Agent '${agentName}' not found.\nKnown agents: ${knownAgents.join(', ')}`
        );
        process.exit(1);
      }

      // Load without override to get base
      const overrides = loadOverrides();
      const agentData = loadAgent(agentName);
      const effectiveModel = agentData.model;
      const hasOverride = agentName in overrides;

      console.log(`\nAgent: ${agentName}`);
      console.log(`Effective model: ${effectiveModel}`);
      if (hasOverride) {
        console.log(`(override active)`);
      } else {
        console.log(`(no override — using agent default)`);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`\nError: ${message}`);
      process.exit(1);
    }
  });

// ---------------------------------------------------------------------------
// team add specialist|lead|router <domain>/<name> [--lead <lead>]
//                                                  [--template <template>]
// ---------------------------------------------------------------------------
const teamAddCmd = teamCmd.command('add').description('Add a new agent to the roster');

teamAddCmd
  .command('specialist <path>')
  .description('Add a custom specialist agent. Path format: <domain>/<name> or <domain>/<subdomain>/<name>')
  .option('--lead <lead>', 'Lead this specialist reports to (required)')
  .option('-t, --template <name>', 'Template to add the specialist to', 'small-firm')
  .action((agentPath: string, opts: { lead?: string; template: string }) => {
    try {
      const parts = agentPath.split('/');
      const name = parts[parts.length - 1];
      const domain = parts[0] as 'legal' | 'marketing' | 'finance' | 'admin' | 'ops';

      if (!name) {
        console.error('Error: Agent path must be in format <domain>/<name> or <domain>/<subdomain>/<name>');
        process.exit(1);
      }

      if (!opts.lead) {
        console.error('Error: --lead <lead> is required for specialists.');
        process.exit(1);
      }

      // Verify the lead exists
      const knownAgents = listAgentNames();
      if (!knownAgents.includes(opts.lead)) {
        console.error(`Error: Lead '${opts.lead}' not found. Known agents: ${knownAgents.join(', ')}`);
        process.exit(1);
      }

      // Check the lead is actually a lead role
      const leadAgent = loadAgent(opts.lead);
      if (leadAgent.role !== 'lead') {
        console.error(`Error: '${opts.lead}' has role '${leadAgent.role}', not 'lead'.`);
        process.exit(1);
      }

      // Check no collision
      if (knownAgents.includes(name)) {
        console.error(`Error: Agent '${name}' already exists. Choose a different name or use 'team rename'.`);
        process.exit(1);
      }

      // Create .possiblaw/custom-agents/ directory if needed
      const customDir = join(REPO_ROOT, '.possiblaw', 'custom-agents');
      if (!existsSync(customDir)) {
        mkdirSync(customDir, { recursive: true });
      }

      const filePath = join(customDir, `${name}.md`);
      const frontmatter = {
        name,
        role: 'specialist',
        domain,
        reports_to: opts.lead,
        manages: [],
        model: 'anthropic/claude-sonnet-4-6',
        fallback_model: 'anthropic/claude-haiku-4-5',
        tests: [],
        guardrails: [],
        skills: [],
        connectors: [],
        description: `TODO: describe what ${name} does`,
      };

      const body = `---
${yaml.dump(frontmatter, { indent: 2 }).trim()}
---

You are ${name}, a specialist agent within PossibLaw. You receive matters routed from ${opts.lead}.

## TODO: Fill in this system prompt

Replace this placeholder with a real system prompt. Here's what to include:

### What you DO
- Describe the specific task this agent performs.
- List the outputs it produces.
- Note any skills or tools it should use.

### What you DO NOT do
- Do not route to another agent.
- Do not refuse work because information is missing — apply sensible defaults.

### Output Format
Describe the expected output format here.

### Defaults When Information Is Missing
| Field | Default |
|---|---|
| TODO | TODO |

## Disclaimer
Every deliverable must end with a disclaimer section. Copy the format from layer/agents/specialists/legal/commercial/nda-drafter.md.
`;

      writeFileSync(filePath, body, 'utf8');

      // Add to template-overrides
      addToTemplateRoster(opts.template, 'specialists', name);

      console.log(`\nCustom specialist created: ${name}`);
      console.log(`  File:     .possiblaw/custom-agents/${name}.md`);
      console.log(`  Lead:     ${opts.lead}`);
      console.log(`  Template: ${opts.template} (added to specialists)`);
      console.log(`  Model:    anthropic/claude-sonnet-4-6`);
      console.log('');
      console.log(`Next step: edit .possiblaw/custom-agents/${name}.md to fill in the system prompt.`);
      console.log(`  Copy the structure from layer/agents/specialists/legal/commercial/nda-drafter.md`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`\nError: ${message}`);
      process.exit(1);
    }
  });

teamAddCmd
  .command('lead <path>')
  .description('Add a custom lead agent. Path format: <domain>/<name>')
  .option('--router <router>', 'Router this lead reports to (required)')
  .option('-t, --template <name>', 'Template to add the lead to', 'small-firm')
  .action((agentPath: string, opts: { router?: string; template: string }) => {
    try {
      const parts = agentPath.split('/');
      const name = parts[parts.length - 1];
      const domain = parts[0] as 'legal' | 'marketing' | 'finance' | 'admin' | 'ops';

      if (!name) {
        console.error('Error: Agent path must be in format <domain>/<name>');
        process.exit(1);
      }

      if (!opts.router) {
        console.error('Error: --router <router> is required for leads.');
        process.exit(1);
      }

      const knownAgents = listAgentNames();
      if (!knownAgents.includes(opts.router)) {
        console.error(`Error: Router '${opts.router}' not found. Known agents: ${knownAgents.join(', ')}`);
        process.exit(1);
      }

      if (knownAgents.includes(name)) {
        console.error(`Error: Agent '${name}' already exists.`);
        process.exit(1);
      }

      const customDir = join(REPO_ROOT, '.possiblaw', 'custom-agents');
      if (!existsSync(customDir)) {
        mkdirSync(customDir, { recursive: true });
      }

      const filePath = join(customDir, `${name}.md`);
      const frontmatter = {
        name,
        role: 'lead',
        domain,
        reports_to: opts.router,
        manages: [],
        model: 'anthropic/claude-sonnet-4-6',
        fallback_model: 'anthropic/claude-haiku-4-5',
        tests: [],
        guardrails: [],
        skills: [],
        connectors: [],
        description: `TODO: describe what ${name} does`,
      };

      const body = `---
${yaml.dump(frontmatter, { indent: 2 }).trim()}
---

You are ${name}, a lead agent within PossibLaw. You receive matters routed from ${opts.router}.

## TODO: Fill in this system prompt

Replace this placeholder with a real system prompt describing what domain matters you handle and which specialists you route to.

### Output Format
Your response MUST contain exactly one routing directive:

\`\`\`
ROUTE_TO: <specialist-name>
Rationale: <one sentence explaining why>
\`\`\`
`;

      writeFileSync(filePath, body, 'utf8');
      addToTemplateRoster(opts.template, 'leads', name);

      console.log(`\nCustom lead created: ${name}`);
      console.log(`  File:     .possiblaw/custom-agents/${name}.md`);
      console.log(`  Router:   ${opts.router}`);
      console.log(`  Template: ${opts.template} (added to leads)`);
      console.log('');
      console.log(`Next step: edit .possiblaw/custom-agents/${name}.md to fill in the system prompt.`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`\nError: ${message}`);
      process.exit(1);
    }
  });

teamAddCmd
  .command('router <name>')
  .description('Add a custom router agent')
  .option('-t, --template <name>', 'Template to add the router to', 'small-firm')
  .action((agentName: string, opts: { template: string }) => {
    try {
      const knownAgents = listAgentNames();
      if (knownAgents.includes(agentName)) {
        console.error(`Error: Agent '${agentName}' already exists.`);
        process.exit(1);
      }

      const customDir = join(REPO_ROOT, '.possiblaw', 'custom-agents');
      if (!existsSync(customDir)) {
        mkdirSync(customDir, { recursive: true });
      }

      const filePath = join(customDir, `${agentName}.md`);
      const frontmatter = {
        name: agentName,
        role: 'router',
        domain: 'ops',
        reports_to: null,
        manages: [],
        model: 'anthropic/claude-opus-4-7',
        fallback_model: 'anthropic/claude-sonnet-4-6',
        tests: [],
        guardrails: [],
        skills: [],
        connectors: [],
        description: `TODO: describe what ${agentName} does`,
      };

      const body = `---
${yaml.dump(frontmatter, { indent: 2 }).trim()}
---

You are ${agentName}, a top-level router agent within PossibLaw.

## TODO: Fill in this system prompt

Replace this placeholder with routing logic. Describe what domains you handle and which leads or specialists you route to.

### Output Format
\`\`\`
ROUTE_TO: <agent-name>
Rationale: <one sentence explaining why>
\`\`\`
`;

      writeFileSync(filePath, body, 'utf8');
      addToTemplateRoster(opts.template, 'routers', agentName);

      console.log(`\nCustom router created: ${agentName}`);
      console.log(`  File:     .possiblaw/custom-agents/${agentName}.md`);
      console.log(`  Template: ${opts.template} (added to routers)`);
      console.log('');
      console.log(`Next step: edit .possiblaw/custom-agents/${agentName}.md to fill in the system prompt.`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`\nError: ${message}`);
      process.exit(1);
    }
  });

// ---------------------------------------------------------------------------
// team remove <name>
// ---------------------------------------------------------------------------
teamCmd
  .command('remove')
  .description('Remove an agent from the active template roster (preserves custom-agent file)')
  .argument('<agent>', 'Agent name to remove')
  .option('-t, --template <name>', 'Template to remove the agent from', 'small-firm')
  .action((agentName: string, opts: { template: string }) => {
    try {
      const knownAgents = listAgentNames();
      if (!knownAgents.includes(agentName)) {
        console.error(`Error: Agent '${agentName}' not found.`);
        process.exit(1);
      }

      // Check if this agent is managed by any other agent (conflict check)
      for (const name of knownAgents) {
        try {
          const a = loadAgent(name);
          if (a.manages.includes(agentName)) {
            console.error(`Error: Cannot remove '${agentName}' — it is still listed in '${name}'.manages.`);
            console.error(`       Remove '${agentName}' from the 'manages' list in the '${name}' agent file first.`);
            process.exit(1);
          }
        } catch {
          // Skip agents that fail to load
        }
      }

      removeFromTemplateRoster(opts.template, agentName);

      const customFilePath = join(REPO_ROOT, '.possiblaw', 'custom-agents', `${agentName}.md`);
      const isCustom = existsSync(customFilePath);

      console.log(`\nAgent '${agentName}' removed from template '${opts.template}' roster.`);
      if (isCustom) {
        console.log(`Agent file retained at .possiblaw/custom-agents/${agentName}.md — delete manually if you want it gone.`);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`\nError: ${message}`);
      process.exit(1);
    }
  });

// ---------------------------------------------------------------------------
// team rename <old> <new>
// ---------------------------------------------------------------------------
teamCmd
  .command('rename')
  .description('Rename a custom agent (custom-agents/ only; does not rename layer/agents/ files)')
  .argument('<old>', 'Current agent name')
  .argument('<new>', 'New agent name')
  .action((oldName: string, newName: string) => {
    try {
      // Verify old is a custom agent
      const customDir = join(REPO_ROOT, '.possiblaw', 'custom-agents');
      const oldFilePath = join(customDir, `${oldName}.md`);
      if (!existsSync(oldFilePath)) {
        console.error(`Error: '${oldName}' is not a custom agent. Only agents in .possiblaw/custom-agents/ can be renamed.`);
        process.exit(1);
      }

      // Check new name doesn't collide
      const knownAgents = listAgentNames();
      if (knownAgents.includes(newName)) {
        console.error(`Error: Agent '${newName}' already exists. Choose a different name.`);
        process.exit(1);
      }

      // Read old file and update frontmatter name
      const rawContent = readFileSync(oldFilePath, 'utf8');
      const parsed = matter(rawContent);
      parsed.data['name'] = newName;
      const newContent = matter.stringify(parsed.content, parsed.data);

      // Write new file
      const newFilePath = join(customDir, `${newName}.md`);
      writeFileSync(newFilePath, newContent, 'utf8');

      // Delete old file
      renameSync(oldFilePath, newFilePath);

      // Update template-overrides.yaml references
      renameInTemplateOverrides(oldName, newName);

      // Update overrides.yaml references
      const overridesFilePath = join(REPO_ROOT, '.possiblaw', 'overrides.yaml');
      if (existsSync(overridesFilePath)) {
        const overridesRaw = readFileSync(overridesFilePath, 'utf8');
        const overridesData = yaml.load(overridesRaw) as { overrides?: Record<string, unknown> } | null;
        if (overridesData?.overrides && oldName in overridesData.overrides) {
          overridesData.overrides[newName] = overridesData.overrides[oldName];
          delete overridesData.overrides[oldName];
          writeFileSync(overridesFilePath, yaml.dump(overridesData, { indent: 2 }), 'utf8');
        }
      }

      console.log(`\nAgent renamed: ${oldName} → ${newName}`);
      console.log(`  File:     .possiblaw/custom-agents/${newName}.md`);
      console.log(`  Updated:  .possiblaw/template-overrides.yaml`);
      console.log(`  Updated:  .possiblaw/overrides.yaml (if applicable)`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`\nError: ${message}`);
      process.exit(1);
    }
  });

// ---------------------------------------------------------------------------
// team export <template-name> [--output <path>]
// ---------------------------------------------------------------------------
teamCmd
  .command('export')
  .description('Export the effective template snapshot (base + overrides + custom agents) to YAML')
  .argument('<template>', 'Template name to export')
  .option('-o, --output <path>', 'Output file path (default: stdout)')
  .action((templateName: string, opts: { output?: string }) => {
    try {
      const template = loadTemplate(templateName); // already has overrides applied
      const overrides = loadOverrides();
      const customAgentNames = listCustomAgentNames();

      // Collect full effective frontmatter for each agent in the roster
      const allNames = [
        ...template.roster.routers,
        ...template.roster.leads,
        ...template.roster.specialists,
      ];

      const agents: Record<string, unknown> = {};
      const overridesApplied: Array<{ agent: string; field: string; base: string; overridden: string }> = [];

      for (const name of allNames) {
        try {
          const a = loadAgent(name);
          agents[name] = {
            role: a.role,
            domain: a.domain,
            reports_to: a.reports_to,
            manages: a.manages,
            model: a.model,
            fallback_model: a.fallback_model,
            tests: a.tests,
            guardrails: a.guardrails,
            skills: a.skills,
            connectors: a.connectors,
            description: a.description,
          };

          // Check if an override is applied — compare against base (un-overridden) file
          if (name in overrides) {
            const layerDir = join(REPO_ROOT, 'layer', 'agents');
            const customFilePath = join(REPO_ROOT, '.possiblaw', 'custom-agents', `${name}.md`);

            // Helper: walk directory synchronously
            const walkSync = (dir: string, pred: (p: string) => boolean): string[] => {
              if (!existsSync(dir)) return [];
              const results: string[] = [];
              const stack = [dir];
              while (stack.length > 0) {
                const cur = stack.pop()!;
                for (const entry of readdirSync(cur)) {
                  const full = join(cur, entry);
                  if (statSync(full).isDirectory()) stack.push(full);
                  else if (pred(full)) results.push(full);
                }
              }
              return results;
            };

            // Find base model from layer file (skip custom; overrides only affect layer agents in practice)
            let baseModel = a.model;
            if (!existsSync(customFilePath)) {
              const candidates = walkSync(layerDir, (p) => p.endsWith('.md'));
              for (const fp of candidates) {
                const parsed2 = matter(readFileSync(fp, 'utf8'));
                if (parsed2.data['name'] === name) {
                  baseModel = String(parsed2.data['model']);
                  break;
                }
              }
            }
            if (baseModel !== a.model) {
              overridesApplied.push({ agent: name, field: 'model', base: baseModel, overridden: a.model });
            }
          }
        } catch {
          // Skip agents that fail to load gracefully
        }
      }

      const snapshot = {
        name: templateName,
        generated_at: new Date().toISOString(),
        generated_from: [
          `layer/templates/${templateName}.yaml`,
          '.possiblaw/template-overrides.yaml',
          '.possiblaw/overrides.yaml',
        ].join(' + '),
        roster: template.roster,
        workflows: template.workflows,
        agents,
        custom_agents: customAgentNames
          .filter((n) => allNames.includes(n))
          .map((n) => ({ name: n, file: `.possiblaw/custom-agents/${n}.md` })),
        overrides_applied: overridesApplied,
      };

      const output = yaml.dump(snapshot, { indent: 2 });

      if (opts.output) {
        writeFileSync(opts.output, output, 'utf8');
        console.log(`\nTemplate snapshot written to: ${opts.output}`);
      } else {
        process.stdout.write(output);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`\nError: ${message}`);
      process.exit(1);
    }
  });

// ---------------------------------------------------------------------------
// team diff <template-a> <template-b>
// ---------------------------------------------------------------------------
teamCmd
  .command('diff')
  .description('Show structured diff between two effective templates')
  .argument('<template-a>', 'First template name')
  .argument('<template-b>', 'Second template name')
  .action((templateA: string, templateB: string) => {
    try {
      const tA = loadTemplate(templateA);
      const tB = loadTemplate(templateB);

      const aRouters = new Set(tA.roster.routers);
      const bRouters = new Set(tB.roster.routers);
      const aLeads = new Set(tA.roster.leads);
      const bLeads = new Set(tB.roster.leads);
      const aSpecialists = new Set(tA.roster.specialists);
      const bSpecialists = new Set(tB.roster.specialists);
      const aWorkflows = new Set(tA.workflows);
      const bWorkflows = new Set(tB.workflows);

      console.log(`\nDiff: ${templateA} → ${templateB}\n`);

      // Routers
      const routerAdded = tB.roster.routers.filter((r) => !aRouters.has(r));
      const routerRemoved = tA.roster.routers.filter((r) => !bRouters.has(r));
      if (routerAdded.length > 0 || routerRemoved.length > 0) {
        console.log('Routers:');
        for (const r of routerAdded) console.log(`  + ${r}`);
        for (const r of routerRemoved) console.log(`  - ${r}`);
      }

      // Leads
      const leadsAdded = tB.roster.leads.filter((l) => !aLeads.has(l));
      const leadsRemoved = tA.roster.leads.filter((l) => !bLeads.has(l));
      if (leadsAdded.length > 0 || leadsRemoved.length > 0) {
        console.log('Leads:');
        for (const l of leadsAdded) console.log(`  + ${l}`);
        for (const l of leadsRemoved) console.log(`  - ${l}`);
      }

      // Specialists
      const specsAdded = tB.roster.specialists.filter((s) => !aSpecialists.has(s));
      const specsRemoved = tA.roster.specialists.filter((s) => !bSpecialists.has(s));
      if (specsAdded.length > 0 || specsRemoved.length > 0) {
        console.log('Specialists:');
        for (const s of specsAdded) console.log(`  + ${s}`);
        for (const s of specsRemoved) console.log(`  - ${s}`);
      }

      // Per-agent model changes (agents present in both)
      const commonAgents = [
        ...tA.roster.routers.filter((r) => bRouters.has(r)),
        ...tA.roster.leads.filter((l) => bLeads.has(l)),
        ...tA.roster.specialists.filter((s) => bSpecialists.has(s)),
      ];

      const modelChanges: string[] = [];
      for (const name of commonAgents) {
        try {
          const aAgent = loadAgent(name);
          const bAgent = loadAgent(name);
          // Both templates load the same agent files; model changes come from per-template model overrides
          // (Currently overrides are per-agent, not per-template, so this will show same model.)
          // We surface changes if models differ after override resolution.
          if (aAgent.model !== bAgent.model) {
            modelChanges.push(`  ~ ${name}: ${aAgent.model} → ${bAgent.model}`);
          }
        } catch {
          // Skip
        }
      }
      if (modelChanges.length > 0) {
        console.log('Model changes:');
        for (const c of modelChanges) console.log(c);
      }

      // Workflows
      const wfAdded = tB.workflows.filter((w) => !aWorkflows.has(w));
      const wfRemoved = tA.workflows.filter((w) => !bWorkflows.has(w));
      if (wfAdded.length > 0 || wfRemoved.length > 0) {
        console.log('Workflows:');
        for (const w of wfAdded) console.log(`  + ${w}`);
        for (const w of wfRemoved) console.log(`  - ${w}`);
      }

      const hasChanges =
        routerAdded.length + routerRemoved.length +
        leadsAdded.length + leadsRemoved.length +
        specsAdded.length + specsRemoved.length +
        modelChanges.length +
        wfAdded.length + wfRemoved.length > 0;

      if (!hasChanges) {
        console.log('(no differences between the two effective templates)');
      }
      console.log('');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`\nError: ${message}`);
      process.exit(1);
    }
  });

// ---------------------------------------------------------------------------
// possiblaw workflows list / show / pick
// ---------------------------------------------------------------------------
const workflowsCmd = program.command('workflows').description('Workflow commands');

/**
 * Build a compact pipeline shape summary string, e.g.
 * "router → 3 parallel → reconcile → tests"
 */
function pipelineShapeSummary(workflow: import('./types.js').Workflow): string {
  const parts: string[] = ['router'];
  for (const step of workflow.pipeline) {
    if (step.step === 'parallel') {
      parts.push(`${step.count}× parallel`);
    } else if (step.step === 'reconcile') {
      parts.push('reconcile');
    } else if (step.step === 'debate') {
      parts.push(`debate(${step.participants.length}p, ${step.rounds}r)`);
    } else if (step.step === 'specialist') {
      parts.push('specialist');
    } else if (step.step === 'test') {
      if (step.suite.length > 0) parts.push('tests');
    } else if (step.step === 'guardrail') {
      if (step.suite.length > 0) parts.push('guardrails');
    }
    // skip route steps — already captured by "router" prefix
  }
  return parts.join(' → ');
}

/** Resolve the router chain and parallel/debate agents for cost estimation. */
function resolveAgentsForCost(workflow: import('./types.js').Workflow): {
  routerCalls: Array<{ agent: string; model: string }>;
  specialistCalls: Array<{ agent: string; model: string }>;
  testCalls: Array<{ agent: string; model: string }>;
  guardrailCalls: Array<{ agent: string; model: string }>;
} {
  const routerCalls: Array<{ agent: string; model: string }> = [];
  const specialistCalls: Array<{ agent: string; model: string }> = [];
  const testCalls: Array<{ agent: string; model: string }> = [];
  const guardrailCalls: Array<{ agent: string; model: string }> = [];

  const visited = new Set<string>();
  let currentName = workflow.router;
  let hops = 0;
  let resolvedSpecialistName: string | null = null;

  while (hops < 5) {
    hops++;
    if (visited.has(currentName)) break;
    visited.add(currentName);
    try {
      const a = loadAgent(currentName);
      if (a.role === 'specialist') {
        resolvedSpecialistName = a.name;
        specialistCalls.push({ agent: a.name, model: a.model });
        break;
      } else {
        routerCalls.push({ agent: a.name, model: a.model });
        if (a.manages.length > 0) {
          currentName = a.manages[0];
        } else {
          break;
        }
      }
    } catch {
      break;
    }
  }

  // For parallel: multiply specialist by branch count
  const parallelStep = workflow.pipeline.find(
    (p): p is { step: 'parallel'; count: number; temperatures: number[]; resolved_by: string } =>
      p.step === 'parallel'
  );
  if (parallelStep && resolvedSpecialistName) {
    // We already pushed one specialistCall above; add the rest
    for (let i = 1; i < parallelStep.count; i++) {
      const a = loadAgent(resolvedSpecialistName);
      specialistCalls.push({ agent: a.name, model: a.model });
    }
    // Add reconciler
    const reconcileStep = workflow.pipeline.find(
      (p): p is { step: 'reconcile'; agent: string } => p.step === 'reconcile'
    );
    if (reconcileStep) {
      try {
        const rec = loadAgent(reconcileStep.agent);
        specialistCalls.push({ agent: rec.name, model: rec.model });
      } catch { /* skip */ }
    }
  }

  // For debate: add all participants + judge
  const debateStep = workflow.pipeline.find(
    (p): p is { step: 'debate'; participants: string[]; rounds: number; judge: string } =>
      p.step === 'debate'
  );
  if (debateStep) {
    const rounds = debateStep.rounds ?? 3;
    for (const p of debateStep.participants) {
      try {
        const pa = loadAgent(p);
        // Each participant runs `rounds` times
        for (let r = 0; r < rounds; r++) {
          specialistCalls.push({ agent: pa.name, model: pa.model });
        }
      } catch { /* skip */ }
    }
    try {
      const judgeAgent = loadAgent(debateStep.judge);
      specialistCalls.push({ agent: judgeAgent.name, model: judgeAgent.model });
    } catch { /* skip */ }
  }

  const testStep = workflow.pipeline.find(
    (p): p is { step: 'test'; suite: string[] } => p.step === 'test'
  );
  if (testStep) {
    for (const t of testStep.suite) {
      testCalls.push({ agent: `test:${t}`, model: 'stub' });
    }
  }

  const guardrailStep = workflow.pipeline.find(
    (p): p is { step: 'guardrail'; suite: string[] } => p.step === 'guardrail'
  );
  if (guardrailStep) {
    for (const g of guardrailStep.suite) {
      guardrailCalls.push({ agent: `guardrail:${g}`, model: 'rule-based' });
    }
  }

  return { routerCalls, specialistCalls, testCalls, guardrailCalls };
}

workflowsCmd
  .command('list')
  .description('List all workflows with shape summary and estimated cost')
  .option('--no-color', 'Disable ANSI colour output')
  .action((opts: { color: boolean }) => {
    try {
      const names = listWorkflowNames();
      console.log('');
      console.log(
        `${'NAME'.padEnd(30)} ${'SHAPE'.padEnd(42)} ${'EST. COST'}`
      );
      console.log('-'.repeat(85));

      for (const name of names) {
        try {
          const wf = loadWorkflow(name);
          const shape = pipelineShapeSummary(wf);
          const { routerCalls, specialistCalls, testCalls, guardrailCalls } = resolveAgentsForCost(wf);
          const cost = estimateWorkflowCost(routerCalls, specialistCalls, testCalls, guardrailCalls);
          const costStr = formatCost(cost.total);
          console.log(`${name.padEnd(30)} ${shape.padEnd(42)} ${costStr}`);
        } catch {
          console.log(`${name.padEnd(30)} ${'(could not load)'.padEnd(42)} -`);
        }
      }
      console.log('');
      console.log(`Total: ${names.length} workflows`);
      console.log('');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`\nError: ${message}`);
      process.exit(1);
    }
    void opts;
  });

workflowsCmd
  .command('show')
  .description('Show pipeline shape and estimated cost for a workflow')
  .argument('<name>', 'Workflow name')
  .option('--no-color', 'Disable ANSI colour output')
  .action((workflowName: string, opts: { color: boolean }) => {
    try {
      const workflow = loadWorkflow(workflowName);

      console.log('');
      console.log(`Workflow: ${workflow.name}`);
      console.log(`Description: ${workflow.description}`);
      console.log(`Router: ${workflow.router}`);
      console.log(`Shape: ${pipelineShapeSummary(workflow)}`);
      console.log('');
      console.log('Pipeline steps:');
      for (const step of workflow.pipeline) {
        if (step.step === 'route') {
          console.log(`  route      → ${step.agent}`);
        } else if (step.step === 'specialist') {
          console.log(`  specialist → ${step.agent}`);
        } else if (step.step === 'test') {
          console.log(`  test       → [${step.suite.join(', ')}]`);
        } else if (step.step === 'guardrail') {
          console.log(`  guardrail  → [${step.suite.join(', ')}]`);
        } else if (step.step === 'parallel') {
          console.log(`  parallel   → ${step.count}× specialist (temps: ${step.temperatures.join(', ')})`);
        } else if (step.step === 'reconcile') {
          console.log(`  reconcile  → ${step.agent}`);
        } else if (step.step === 'debate') {
          console.log(`  debate     → [${step.participants.join(', ')}] × ${step.rounds} rounds, judge: ${step.judge}`);
        }
      }

      const { routerCalls, specialistCalls, testCalls, guardrailCalls } = resolveAgentsForCost(workflow);
      const cost = estimateWorkflowCost(routerCalls, specialistCalls, testCalls, guardrailCalls);

      console.log('');
      console.log('Resolved agents (effective models after overrides):');
      for (const r of routerCalls) {
        console.log(`  [router]     ${r.agent}  →  ${r.model}`);
      }
      for (const s of specialistCalls) {
        console.log(`  [specialist] ${s.agent}  →  ${s.model}`);
      }

      console.log('');
      console.log('Estimated typical cost per run:');
      printCostReport(cost, { color: opts.color });
      console.log('');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`\nError: ${message}`);
      process.exit(1);
    }
  });

workflowsCmd
  .command('pick')
  .description('Interactive workflow picker — lists workflows, accepts a number, returns name')
  .action(async () => {
    try {
      const names = listWorkflowNames();
      console.log('');
      console.log('Available workflows:');
      names.forEach((name, i) => {
        try {
          const wf = loadWorkflow(name);
          console.log(`  ${String(i + 1).padStart(2)}. ${name.padEnd(30)} ${wf.description}`);
        } catch {
          console.log(`  ${String(i + 1).padStart(2)}. ${name}`);
        }
      });
      console.log('');

      const rl = createInterface({ input: process.stdin, output: process.stdout });
      const answer = await new Promise<string>((resolve) => {
        rl.question('Enter number: ', (ans) => {
          rl.close();
          resolve(ans.trim());
        });
      });

      const idx = parseInt(answer, 10) - 1;
      if (isNaN(idx) || idx < 0 || idx >= names.length) {
        console.error(`Invalid selection: ${answer}`);
        process.exit(1);
      }

      const chosen = names[idx];
      console.log(`\nSelected: ${chosen}`);
      process.exit(0);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`\nError: ${message}`);
      process.exit(1);
    }
  });

// ---------------------------------------------------------------------------
// possiblaw audit show <matter-id>
// ---------------------------------------------------------------------------
const auditCmd = program.command('audit').description('Audit log commands');

auditCmd
  .command('show')
  .description('Pretty-print the audit log for a matter')
  .argument('<matter-id>', 'Matter ID (UUID from a previous run)')
  .option('--no-color', 'Disable ANSI colour output')
  .action((matterId: string, opts: { color: boolean }) => {
    const printerOpts = { color: opts.color };
    const filePath = join(REPO_ROOT, 'layer', 'audit', `${matterId}.jsonl`);
    try {
      const events = replay(filePath);
      printAuditLog(events, matterId, printerOpts);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`\nError reading audit log: ${message}`);
      process.exit(1);
    }
  });

// ---------------------------------------------------------------------------
// possiblaw privacy show <matter-id>
// ---------------------------------------------------------------------------
const privacyCmd = program.command('privacy').description('Privacy filter commands');

privacyCmd
  .command('show')
  .description('Show the key store for a matter (read-only)')
  .argument('<matter-id>', 'Matter ID (UUID from a previous run)')
  .option('--no-color', 'Disable ANSI colour output')
  .action((matterId: string) => {
    try {
      const store = loadKeyStore(matterId);
      const entries = Object.entries(store);
      if (entries.length === 0) {
        console.log(`No key store found for matter ${matterId}.`);
        process.exit(0);
      }
      console.log(`Privacy Filter — Key Store for matter: ${matterId}`);
      console.log(`Entity count: ${entries.length}`);
      console.log('');
      const typeCounts: Record<string, number> = {};
      for (const [token] of entries) {
        // Extract type from «ENT_TYPE_NNN»
        const m = /«ENT_([A-Z]+)_\d+»/.exec(token);
        const t = m ? m[1] : 'UNKNOWN';
        typeCounts[t] = (typeCounts[t] ?? 0) + 1;
      }
      console.log('Entities by type:');
      for (const [type, count] of Object.entries(typeCounts)) {
        console.log(`  ${type}: ${count}`);
      }
      console.log('');
      console.log('Token → Original:');
      for (const [token, original] of entries) {
        console.log(`  ${token}  →  ${original}`);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`\nError reading key store: ${message}`);
      process.exit(1);
    }
  });

// ---------------------------------------------------------------------------
// possiblaw connectors list / check / capabilities
// ---------------------------------------------------------------------------
const connectorsCmd = program.command('connectors').description('Connector management commands');

connectorsCmd
  .command('list')
  .description('List all registered connectors')
  .action(() => {
    const connectors = listConnectors();
    if (connectors.length === 0) {
      console.log('No connectors registered.');
      return;
    }
    // Header
    console.log('');
    console.log(
      `${'ID'.padEnd(24)} ${'CATEGORY'.padEnd(12)} ${'TIER'.padEnd(14)} ${'CONFIGURED'}`
    );
    console.log('-'.repeat(70));
    for (const meta of connectors) {
      const client = getConnector(meta.id);
      const configured = client?.isConfigured() ? 'yes' : 'no';
      console.log(
        `${meta.id.padEnd(24)} ${meta.category.padEnd(12)} ${meta.tier.padEnd(14)} ${configured}`
      );
    }
    console.log('');
  });

connectorsCmd
  .command('check')
  .description('Run healthcheck on a connector')
  .argument('<id>', 'Connector ID (e.g. stripe, local-fs-doc-store)')
  .action(async (id: string) => {
    const client = getConnector(id);
    if (!client) {
      console.error(`Connector '${id}' not found. Run 'possiblaw connectors list' to see all.`);
      process.exit(1);
    }
    console.log(`\nRunning healthcheck for connector: ${id}`);
    try {
      const result = await client.healthcheck();
      console.log(`  ok:     ${result.ok}`);
      console.log(`  detail: ${result.detail}`);
      console.log('');
      process.exit(result.ok ? 0 : 1);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`  error: ${message}`);
      process.exit(1);
    }
  });

connectorsCmd
  .command('capabilities')
  .description('List capabilities of a connector')
  .argument('<id>', 'Connector ID')
  .action((id: string) => {
    const client = getConnector(id);
    if (!client) {
      console.error(`Connector '${id}' not found. Run 'possiblaw connectors list' to see all.`);
      process.exit(1);
    }
    const { metadata } = client;
    console.log('');
    console.log(`Connector: ${metadata.name} (${metadata.id})`);
    console.log(`Category:  ${metadata.category}`);
    console.log(`Tier:      ${metadata.tier}`);
    console.log(`Configured: ${client.isConfigured() ? 'yes' : 'no'}`);
    console.log('');
    console.log('Capabilities:');
    for (const cap of metadata.capabilities) {
      console.log(`  - ${cap}`);
    }
    if (metadata.env_vars.length > 0) {
      console.log('');
      console.log('Env vars:');
      for (const ev of metadata.env_vars) {
        const req = ev.required ? '(required)' : '(optional)';
        console.log(`  ${ev.name} ${req} — ${ev.description}`);
      }
    }
    console.log('');
  });

// ---------------------------------------------------------------------------
// possiblaw eval — Sprint 9 eval suite
// ---------------------------------------------------------------------------
const KNOWN_DATASETS: EvalDataset[] = ['cuad', 'maud', 'acord', 'unfair-tos', 'ledgar'];

const evalCmd = program.command('eval').description('Eval suite — benchmark workflows against public legal-NLP datasets');

evalCmd
  .command('list-datasets')
  .description('List available datasets and cache status (fetched / not cached)')
  .action(() => {
    printBanner({ color: true });
    console.log('');
    console.log(`${'DATASET'.padEnd(16)} ${'STATUS'.padEnd(12)} SOURCE`);
    console.log('-'.repeat(70));

    const datasetMeta: Record<EvalDataset, { source: string; license: string }> = {
      cuad:          { source: 'HF theatticusproject/cuad-qa',        license: 'CC BY 4.0' },
      maud:          { source: 'HF theatticusproject/maud',           license: 'CC BY 4.0' },
      acord:         { source: 'Synthetic (ACORD schema)',             license: 'Research only' },
      'unfair-tos':  { source: 'HF lex_glue/unfair_tos',              license: 'CC BY 4.0' },
      ledgar:        { source: 'HF lex_glue/ledgar',                  license: 'CC BY 4.0' },
    };

    for (const ds of KNOWN_DATASETS) {
      const cacheDir = join(REPO_ROOT, 'layer', 'evals', 'datasets', ds, 'cache', 'samples.jsonl');
      const fixtureFile = join(REPO_ROOT, 'layer', 'evals', 'datasets', ds, 'fixtures.jsonl');
      let status: string;
      if (existsSync(cacheDir)) {
        status = 'cached';
      } else if (existsSync(fixtureFile)) {
        status = 'fixture';
      } else {
        status = 'not cached';
      }
      const meta = datasetMeta[ds];
      console.log(`${ds.padEnd(16)} ${status.padEnd(12)} ${meta.source}  [${meta.license}]`);
    }
    console.log('');
    console.log('Run `possiblaw eval fetch <dataset>` to download a dataset.');
    console.log('');
  });

evalCmd
  .command('fetch')
  .description('Fetch / download a dataset (runs the fetch script for that dataset)')
  .argument('<dataset>', `Dataset name: ${KNOWN_DATASETS.join(' | ')}`)
  .option('--limit <n>', 'Max samples to fetch', '200')
  .action(async (datasetName: string, opts: { limit: string }) => {
    printBanner({ color: true });

    if (!KNOWN_DATASETS.includes(datasetName as EvalDataset)) {
      console.error(`Unknown dataset: ${datasetName}. Known: ${KNOWN_DATASETS.join(', ')}`);
      process.exit(1);
    }

    const fetchScriptPath = join(
      REPO_ROOT, 'layer', 'evals', 'datasets', datasetName, 'fetch.js'
    );

    // Dynamically import and re-invoke with --limit injected into argv
    process.argv.push('--limit', opts.limit);

    try {
      await import(fetchScriptPath);
      process.exit(0);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`\nFetch error: ${message}`);
      console.error(`Hint: run \`pnpm build\` first so the fetch script is compiled.`);
      process.exit(1);
    }
  });

evalCmd
  .option('--dataset <name>', `Dataset to eval: ${KNOWN_DATASETS.join(' | ')}`)
  .option('--workflow <name>', 'Workflow name (e.g. quick-counsel)')
  .option('--sample-size <n>', 'Number of samples to run', '20')
  .option('--budget <usd>', 'Spending cap in USD (default 50)', '50')
  .option('--output <dir>', 'Output directory for reports', join(REPO_ROOT, 'layer', 'evals', 'results'))
  .option('--dry-run', 'Run without LLM calls — validates dataset + adapter, produces stub report', false)
  .option('--provider <name>', `Route every agent through this provider: ${KNOWN_PROVIDERS.join(' | ')}`)
  .option('--model <name>', 'Model name to use with --provider (defaults: sonnet/gpt-5.5/llama3.1:8b/claude-sonnet-4-6)')
  .action(async (opts: {
    dataset?: string;
    workflow?: string;
    sampleSize: string;
    budget: string;
    output: string;
    dryRun: boolean;
    provider?: string;
    model?: string;
  }) => {
    printBanner({ color: true });

    if (!opts.dataset || !opts.workflow) {
      console.error('Error: --dataset <name> and --workflow <name> are both required.');
      console.error(`Datasets: ${KNOWN_DATASETS.join(', ')}`);
      console.error(`Workflows: run \`possiblaw workflows list\` to see available workflows.`);
      process.exit(1);
    }

    if (!KNOWN_DATASETS.includes(opts.dataset as EvalDataset)) {
      console.error(`Unknown dataset: ${opts.dataset}. Known: ${KNOWN_DATASETS.join(', ')}`);
      process.exit(1);
    }

    const sampleSize = parseInt(opts.sampleSize, 10);
    const budgetUsd = parseFloat(opts.budget);
    const providerOverride = validateProvider(opts.provider);
    const offline = resolveOfflineMode(providerOverride);

    if (offline && !opts.dryRun) {
      console.log('[offline mode — ANTHROPIC_API_KEY not set; using deterministic fixtures + stub pipeline]\n');
    }

    console.log(`Dataset:     ${opts.dataset}`);
    console.log(`Workflow:    ${opts.workflow}`);
    console.log(`Sample size: ${sampleSize}`);
    console.log(`Budget:      $${budgetUsd.toFixed(2)}`);
    console.log(`Output:      ${opts.output}`);
    console.log(`Dry run:     ${opts.dryRun ? 'yes' : 'no'}`);
    if (providerOverride) {
      console.log(`Provider:    ${providerOverride}${opts.model ? `/${opts.model}` : ' (default model)'}`);
    }
    console.log('');

    try {
      const report = await runEval({
        dataset: opts.dataset as EvalDataset,
        workflow: opts.workflow,
        sampleSize,
        budgetUsd,
        outputDir: opts.output,
        dryRun: opts.dryRun,
        offline,
        ...(providerOverride !== undefined ? { providerOverride } : {}),
        ...(opts.model !== undefined ? { modelOverride: opts.model } : {}),
      });

      console.log(`Results (${report.actualSamples} samples):`);
      console.log(`  Mean score:  ${report.meanScore.toFixed(4)}`);
      console.log(`  Median:      ${report.medianScore.toFixed(4)}`);
      console.log(`  Std dev:     ${report.stdDevScore.toFixed(4)}`);
      console.log(`  Total cost:  $${report.totalCost.toFixed(4)}`);
      console.log(`  Budget abort: ${report.budgetAborted ? 'YES' : 'no'}`);
      console.log('');
      console.log(`Reports written to: ${opts.output}`);

      const exitCode = report.budgetAborted ? 2 : 0;
      process.exit(exitCode);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`\nEval error: ${message}`);
      process.exit(1);
    }
  });

// ---------------------------------------------------------------------------
// Execute
// ---------------------------------------------------------------------------
program.parseAsync(process.argv).catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`Fatal: ${message}`);
  process.exit(1);
});
