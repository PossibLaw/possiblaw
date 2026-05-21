#!/usr/bin/env node
/**
 * PossibLaw v2 — CLI entry point.
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Command } from 'commander';
import { loadWorkflow, loadTemplate, loadAgent, REPO_ROOT } from './loader.js';
import { runPipeline } from './pipeline.js';
import {
  printBanner,
  printStep,
  printReport,
  printTeamList,
  printAuditLog,
} from './printer.js';
import { replay } from './audit.js';
import { loadKeyStore } from './privacy-filter.js';

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
  .action(async (workflowName: string, prompt: string, opts: {
    template: string;
    verbose: boolean;
    color: boolean;
    privacyProfile: string;
    matterTag: string;
  }) => {
    const printerOpts = { color: opts.color, verbose: opts.verbose };
    printBanner(printerOpts);

    const offline = !process.env['ANTHROPIC_API_KEY'];
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
// possiblaw team list
// ---------------------------------------------------------------------------
const teamCmd = program.command('team').description('Team management commands');

teamCmd
  .command('list')
  .description('List agents in the active template')
  .option('-t, --template <name>', 'Template to inspect', 'solo-lawyer')
  .option('--no-color', 'Disable ANSI colour output')
  .action((opts: { template: string; color: boolean }) => {
    const printerOpts = { color: opts.color };
    printBanner(printerOpts);

    try {
      const template = loadTemplate(opts.template);
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
// possiblaw eval  (placeholder)
// ---------------------------------------------------------------------------
program
  .command('eval')
  .description('Run evals (placeholder)')
  .action(() => {
    printBanner({ color: true });
    console.log('Coming in Sprint 9 — see plan §9');
  });

// ---------------------------------------------------------------------------
// Execute
// ---------------------------------------------------------------------------
program.parseAsync(process.argv).catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`Fatal: ${message}`);
  process.exit(1);
});
