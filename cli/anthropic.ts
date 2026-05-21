/**
 * PossibLaw v2 — Thin Anthropic SDK wrapper.
 * Falls back to deterministic offline fixtures when ANTHROPIC_API_KEY is unset.
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Agent, Skill } from './types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ---------------------------------------------------------------------------
// Model ID mapping
// ---------------------------------------------------------------------------

function resolveModelId(raw: string): string {
  // Strip leading "anthropic/" prefix if present
  return raw.replace(/^anthropic\//, '');
}

// ---------------------------------------------------------------------------
// Offline fixtures
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Routing fixtures — keyed by workflow context derived from userPrompt
// ---------------------------------------------------------------------------

/** Returns the appropriate chief-of-staff routing decision based on the prompt domain. */
function chiefOfStaffRoute(userPrompt: string): string {
  const lower = userPrompt.toLowerCase();
  if (lower.includes('invoice') || lower.includes('billing') || lower.includes('expense')) {
    return 'ROUTE_TO: finance-lead\nRationale: Finance matter — routing to Finance Lead.';
  }
  if (lower.includes('intake') || lower.includes('prospect') || lower.includes('pitch') || lower.includes('marketing')) {
    return 'ROUTE_TO: marketing-lead\nRationale: Marketing matter — routing to Marketing Lead.';
  }
  if (lower.includes('schedul') || lower.includes('calendar') || lower.includes('meeting')) {
    return 'ROUTE_TO: admin-lead\nRationale: Administrative scheduling matter — routing to Admin Lead.';
  }
  // Default: legal matter
  return 'ROUTE_TO: chief-counsel\nRationale: Legal matter — routing to Chief Counsel.';
}

const OFFLINE_FIXTURES: Record<string, string> = {
  'chief-counsel':
    'ROUTE_TO: commercial-lead\nRationale: Operator requests an NDA, which is a commercial matter.',
  'commercial-lead':
    'ROUTE_TO: nda-drafter\nRationale: NDA draft is the nda-drafter\'s core competency.',
  'marketing-lead':
    'ROUTE_TO: intake-form-drafter\nRationale: Operator needs a new client intake questionnaire; routing to intake-form-drafter.',
  'finance-lead':
    'ROUTE_TO: billing-prep\nRationale: Operator needs a draft invoice for a client matter; routing to billing-prep.',
  'admin-lead':
    'ROUTE_TO: calendar-coordinator\nRationale: Scheduling request — routing to calendar-coordinator.',
};

function loadFixtureFile(name: string): string {
  const fixturePath = join(__dirname, 'fixtures', name);
  return readFileSync(fixturePath, 'utf8');
}

function offlineFixture(agentName: string, userPrompt: string): string {
  // BAD_INPUT_DEMO: return a deliberately invalid draft for any specialist
  if (userPrompt.includes('BAD_INPUT_DEMO') && agentName === 'nda-drafter') {
    return '[INVALID DRAFT] xjq8wz lorem ipsum xjq8wz — this draft is intentionally incoherent for demo purposes.';
  }
  // Chief of Staff: route based on prompt content
  if (agentName === 'chief-of-staff') {
    return chiefOfStaffRoute(userPrompt);
  }
  if (agentName in OFFLINE_FIXTURES) {
    return OFFLINE_FIXTURES[agentName];
  }
  // Specialist fixture files
  switch (agentName) {
    case 'nda-drafter':
      return loadFixtureFile('nda-fixture.md');
    case 'intake-form-drafter':
      return loadFixtureFile('intake-form-fixture.md');
    case 'pitch-polisher':
      return loadFixtureFile('pitch-polish-fixture.md');
    case 'billing-prep':
      return loadFixtureFile('billing-prep-fixture.md');
    case 'expense-categorizer':
      return loadFixtureFile('expense-categorizer-fixture.json');
    case 'calendar-coordinator':
      return loadFixtureFile('calendar-coordinator-fixture.md');
    default:
      return `[OFFLINE STUB for ${agentName}]`;
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface AgentRunResult {
  output: string;
  model: string;
  tokens: { in: number; out: number } | null;
}

export interface RunAgentOpts {
  skills?: Skill[];
  verbose?: boolean;
}

export async function runAgent(
  agent: Agent,
  userPrompt: string,
  opts: RunAgentOpts = {}
): Promise<AgentRunResult> {
  const model = resolveModelId(agent.model);

  // Build system prompt
  let systemPrompt = agent.body.trim();
  if (opts.skills && opts.skills.length > 0) {
    const skillsSection = opts.skills
      .map((s) => `### ${s.name}\n\n${s.body.trim()}`)
      .join('\n\n');
    systemPrompt += `\n\n## Available Skills\n\n${skillsSection}`;
  }

  if (opts.verbose) {
    console.error(`[verbose] system prompt for ${agent.name}:\n${systemPrompt}\n`);
    console.error(`[verbose] user prompt: ${userPrompt}\n`);
  }

  // Offline mode: no API key present
  if (!process.env['ANTHROPIC_API_KEY']) {
    const output = offlineFixture(agent.name, userPrompt);
    if (opts.verbose) {
      console.error(`[verbose] OFFLINE response for ${agent.name}:\n${output}\n`);
    }
    return { output, model: `${model} (offline)`, tokens: null };
  }

  // Live mode
  try {
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    const client = new Anthropic();
    const res = await client.messages.create({
      model,
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    });

    const output = res.content
      .filter((block): block is { type: 'text'; text: string } => block.type === 'text')
      .map((block) => block.text)
      .join('');

    if (opts.verbose) {
      console.error(`[verbose] live response for ${agent.name}:\n${output}\n`);
    }

    return {
      output,
      model,
      tokens: { in: res.usage.input_tokens, out: res.usage.output_tokens },
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Anthropic API call for agent ${agent.name} failed: ${message}`);
  }
}
