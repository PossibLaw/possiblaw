/**
 * PossibLaw — Standalone smoke tests for the multi-provider LLM router.
 *
 * Run:
 *   tsx cli/__tests__/llm-providers.test.ts
 *
 * Optional live shell-out test (gated; off by default):
 *   POSSIBLAW_LIVE_TEST=1 tsx cli/__tests__/llm-providers.test.ts
 *
 * No test runner needed. Exits 0 on success, 1 on first failure.
 */
import { parseProvider, runAgent } from '../llm.js';
import { costForCall, formatCallCost, isSubscriptionProvider } from '../pricing.js';
import type { Agent } from '../types.js';

// ---------------------------------------------------------------------------
// tiny assertion helpers
// ---------------------------------------------------------------------------

let failures = 0;
let passed = 0;

function expect(actual: unknown, expected: unknown, label: string): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    passed++;
    console.log(`  ok   ${label}`);
  } else {
    failures++;
    console.error(`  FAIL ${label}\n         expected: ${e}\n         actual:   ${a}`);
  }
}

function expectTrue(actual: unknown, label: string): void {
  if (actual === true) {
    passed++;
    console.log(`  ok   ${label}`);
  } else {
    failures++;
    console.error(`  FAIL ${label}\n         expected truthy, got: ${JSON.stringify(actual)}`);
  }
}

function expectMatches(actual: string, pattern: RegExp, label: string): void {
  if (typeof actual === 'string' && pattern.test(actual)) {
    passed++;
    console.log(`  ok   ${label}`);
  } else {
    failures++;
    console.error(`  FAIL ${label}\n         pattern: ${pattern}\n         actual:  ${JSON.stringify(actual).slice(0, 200)}`);
  }
}

// ---------------------------------------------------------------------------
// Test 1: parseProvider dispatches correctly for all 4 providers
// ---------------------------------------------------------------------------
console.log('\n[1] parseProvider dispatch');

expect(parseProvider('anthropic/claude-opus-4-7'),
  { provider: 'anthropic', modelId: 'claude-opus-4-7' },
  'anthropic/ prefix');

expect(parseProvider('claude-opus-4-7'),
  { provider: 'anthropic', modelId: 'claude-opus-4-7' },
  'bare claude-* (back-compat)');

expect(parseProvider('ollama/llama3.1:8b'),
  { provider: 'ollama', modelId: 'llama3.1:8b' },
  'ollama/ prefix');

expect(parseProvider('claude-cli/sonnet'),
  { provider: 'claude-cli', modelId: 'sonnet' },
  'claude-cli/ prefix');

expect(parseProvider('claude-cli/claude-sonnet-4-6'),
  { provider: 'claude-cli', modelId: 'claude-sonnet-4-6' },
  'claude-cli/ with full model id');

expect(parseProvider('codex-cli/gpt-5.5'),
  { provider: 'codex-cli', modelId: 'gpt-5.5' },
  'codex-cli/ prefix');

// ---------------------------------------------------------------------------
// Test 2: pricing — subscription providers
// ---------------------------------------------------------------------------
console.log('\n[2] pricing — subscription providers');

expectTrue(isSubscriptionProvider('claude-cli/sonnet'), 'isSubscriptionProvider(claude-cli/sonnet)');
expectTrue(isSubscriptionProvider('codex-cli/gpt-5.5'), 'isSubscriptionProvider(codex-cli/gpt-5.5)');
expectTrue(!isSubscriptionProvider('anthropic/claude-opus-4-7'), 'anthropic/* is not subscription');
expectTrue(!isSubscriptionProvider('ollama/llama3.1:8b'), 'ollama/* is not subscription');

expect(costForCall('claude-cli/sonnet', 1000, 1000), 0,
  'costForCall(claude-cli/sonnet) returns 0');
expect(costForCall('codex-cli/gpt-5.5', 1000, 1000), 0,
  'costForCall(codex-cli/gpt-5.5) returns 0');
expect(formatCallCost('claude-cli/sonnet', 0), 'subscription',
  'formatCallCost(claude-cli/*) returns "subscription"');
expect(formatCallCost('anthropic/claude-opus-4-7', 0.0042), '$0.0042',
  'formatCallCost(anthropic/*) returns dollar string');

// ---------------------------------------------------------------------------
// Test 3: offline path still returns fixtures when ANTHROPIC_API_KEY is unset
// ---------------------------------------------------------------------------
console.log('\n[3] offline path (ANTHROPIC_API_KEY unset)');

async function offlineTest(): Promise<void> {
  // Temporarily clear API key for this test
  const saved = process.env['ANTHROPIC_API_KEY'];
  delete process.env['ANTHROPIC_API_KEY'];

  try {
    const agent: Agent = {
      name: 'chief-counsel',
      role: 'router',
      domain: 'legal',
      reports_to: 'chief-of-staff',
      manages: [],
      model: 'anthropic/claude-opus-4-7',
      fallback_model: 'anthropic/claude-sonnet-4-6',
      tests: [],
      guardrails: [],
      skills: [],
      connectors: [],
      description: 'Test chief counsel',
      body: 'You are chief-counsel.',
    };
    const result = await runAgent(agent, 'draft an NDA');
    expectMatches(result.output, /ROUTE_TO:\s*commercial-lead/i,
      'offline chief-counsel returns ROUTE_TO directive');
    expectMatches(result.model, /\(offline\)$/,
      'offline result model carries (offline) suffix');
    expect(result.tokens, null, 'offline tokens are null');
  } finally {
    if (saved !== undefined) process.env['ANTHROPIC_API_KEY'] = saved;
  }
}

await offlineTest();

// ---------------------------------------------------------------------------
// Test 4 (optional, gated): live claude-cli + codex-cli shell-out
// ---------------------------------------------------------------------------
if (process.env['POSSIBLAW_LIVE_TEST'] === '1') {
  console.log('\n[4] LIVE shell-out (POSSIBLAW_LIVE_TEST=1)');

  // claude-cli live smoke
  {
    const agent: Agent = {
      name: 'live-claude',
      role: 'specialist',
      domain: 'legal',
      reports_to: null,
      manages: [],
      model: 'claude-cli/sonnet',
      fallback_model: 'claude-cli/sonnet',
      tests: [],
      guardrails: [],
      skills: [],
      connectors: [],
      description: 'Live claude-cli smoke',
      body: 'You are a test agent. Reply with the single token: PONG',
    };
    try {
      const result = await runAgent(agent, 'ping');
      console.log(`  claude-cli output: ${JSON.stringify(result.output.slice(0, 200))}`);
      expectTrue(result.output.length > 0, 'claude-cli returned non-empty output');
      expect(result.model, 'claude-cli/sonnet', 'claude-cli model echoed');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      failures++;
      console.error(`  FAIL claude-cli live: ${msg}`);
    }
  }

  // codex-cli live smoke
  {
    const agent: Agent = {
      name: 'live-codex',
      role: 'specialist',
      domain: 'legal',
      reports_to: null,
      manages: [],
      model: 'codex-cli/gpt-5.5',
      fallback_model: 'codex-cli/gpt-5.5',
      tests: [],
      guardrails: [],
      skills: [],
      connectors: [],
      description: 'Live codex-cli smoke',
      body: 'You are a test agent. Reply with the single token: PONG',
    };
    try {
      const result = await runAgent(agent, 'ping');
      console.log(`  codex-cli output: ${JSON.stringify(result.output.slice(0, 200))}`);
      expectTrue(result.output.length > 0, 'codex-cli returned non-empty output');
      expect(result.model, 'codex-cli/gpt-5.5', 'codex-cli model echoed');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      failures++;
      console.error(`  FAIL codex-cli live: ${msg}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log(`\n${failures === 0 ? 'PASS' : 'FAIL'}  ${passed} passed, ${failures} failed`);
process.exit(failures === 0 ? 0 : 1);
