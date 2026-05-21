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

const OFFLINE_FIXTURES: Record<string, string> = {
  'chief-counsel':
    'ROUTE_TO: commercial-lead\nRationale: Operator requests an NDA, which is a commercial matter.',
  'commercial-lead':
    'ROUTE_TO: nda-drafter\nRationale: NDA draft is the nda-drafter\'s core competency.',
};

function offlineFixture(agentName: string): string {
  if (agentName in OFFLINE_FIXTURES) {
    return OFFLINE_FIXTURES[agentName];
  }
  if (agentName === 'nda-drafter') {
    const fixturePath = join(__dirname, 'fixtures', 'nda-fixture.md');
    return readFileSync(fixturePath, 'utf8');
  }
  return `[OFFLINE STUB for ${agentName}]`;
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
    const output = offlineFixture(agent.name);
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
