/**
 * PossibLaw v2 — Test runner.
 * Dispatches on TestConfig.type: stub | llm-judge | rule.
 */
import { runAgent } from './llm.js';
import type {
  Agent,
  TestConfig,
  TestResult,
  TestFailureAction,
  RunContext,
} from './types.js';

// ---------------------------------------------------------------------------
// Per-provider defaults for LLM-judge model and test-failure retry model.
// Kept in sync with cli/pipeline.ts:DEFAULT_MODEL_PER_PROVIDER and
// cli/llm.ts:parseProvider. If a provider is added there, mirror it here.
// ---------------------------------------------------------------------------

/**
 * Default judge model per provider when `--provider` is set but `--model` is
 * not. Picks a cheap/fast model for judging:
 *   anthropic   → claude-haiku-4-5 (cheap Anthropic model)
 *   claude-cli  → haiku            (subscription, cheap Anthropic via CLI)
 *   codex-cli   → gpt-5.5          (OpenAI subscription; no cheaper tier exposed)
 *   ollama      → llama3.1:8b      (local)
 */
const DEFAULT_JUDGE_MODEL_PER_PROVIDER: Record<string, string> = {
  'anthropic': 'claude-haiku-4-5',
  'claude-cli': 'haiku',
  'codex-cli': 'gpt-5.5',
  'ollama': 'llama3.1:8b',
};

/**
 * Default retry model per provider — picked for stronger reasoning than the
 * judge tier when the same provider is in use.
 *   anthropic   → claude-opus-4-7 (existing Sprint 2 behavior preserved)
 *   claude-cli  → opus            (subscription, stronger Anthropic via CLI)
 *   codex-cli   → gpt-5.5         (no smarter tier exposed; same as judge)
 *   ollama      → llama3.1:8b     (no smarter tier exposed locally; same as judge)
 */
const DEFAULT_RETRY_MODEL_PER_PROVIDER: Record<string, string> = {
  'anthropic': 'claude-opus-4-7',
  'claude-cli': 'opus',
  'codex-cli': 'gpt-5.5',
  'ollama': 'llama3.1:8b',
};

// ---------------------------------------------------------------------------
// Input type
// ---------------------------------------------------------------------------

export interface TestRunnerInput {
  context: RunContext;
  draft: string;
  config: TestConfig;
}

// ---------------------------------------------------------------------------
// Retry tracker (per matter_id + test name)
// ---------------------------------------------------------------------------

const retryCount = new Map<string, number>();

function retryKey(matterId: string, testName: string): string {
  return `${matterId}::${testName}`;
}

export function resetRetryCount(matterId: string, testName: string): void {
  retryCount.delete(retryKey(matterId, testName));
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function runTest(input: TestRunnerInput): Promise<TestResult> {
  const { config, draft, context } = input;

  // BAD_INPUT_DEMO offline fixture: return a deliberate fail for groundedness
  if (context.offline && context.userPrompt.includes('BAD_INPUT_DEMO')) {
    if (config.name === 'groundedness') {
      return { pass: false, score: 0.2, rationale: 'Draft is incoherent.' };
    }
  }

  if (config.type === 'stub') {
    return {
      pass: config.stub_result.pass,
      score: config.stub_result.score,
      rationale: config.stub_result.rationale,
    };
  }

  if (config.type === 'llm-judge') {
    return runLlmJudgeTest(input);
  }

  if (config.type === 'rule') {
    return runRuleTest(input);
  }

  // Unknown type: fall back to stub_result if present, else pass
  return {
    pass: config.stub_result?.pass ?? true,
    score: config.stub_result?.score,
    rationale: config.stub_result?.rationale ?? `Unknown test type '${config.type}' — defaulting to pass.`,
  };
}

// ---------------------------------------------------------------------------
// LLM-judge runner
// ---------------------------------------------------------------------------

async function runLlmJudgeTest(input: TestRunnerInput): Promise<TestResult> {
  const { config, draft, context } = input;

  const judgeModel = resolveJudgeModel(config, context);
  const rawPrompt = config.judge_prompt ?? defaultGroundednessPrompt();

  const userMessage = buildJudgeUserMessage(context.userPrompt, draft);

  // Offline: return stub_result
  if (context.offline) {
    return {
      pass: config.stub_result.pass,
      score: config.stub_result.score,
      rationale: config.stub_result.rationale,
    };
  }

  // Live: route through the provider system via `runAgent`. We construct a
  // synthetic specialist Agent whose `body` is the judge system prompt and
  // whose `model` carries the resolved `<provider>/<model>` id. This way the
  // judge respects the `--provider` flag end-to-end instead of bypassing the
  // provider registry with a direct Anthropic SDK call.
  const syntheticJudge: Agent = {
    name: `llm-judge:${config.name}`,
    role: 'specialist',
    domain: 'legal',
    reports_to: null,
    manages: [],
    model: judgeModel,
    fallback_model: judgeModel,
    tests: [],
    guardrails: [],
    skills: [],
    connectors: [],
    description: `Synthetic LLM-judge agent for test '${config.name}'.`,
    body: rawPrompt,
  };

  try {
    const result = await runAgent(syntheticJudge, userMessage, {
      verbose: context.verbose,
      ...(context.maxBudgetUsd !== undefined ? { maxBudgetUsd: context.maxBudgetUsd } : {}),
    });
    return parseJudgeResponse(result.output, config);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    // Fail safe: if judge errors, return fail with reason
    return { pass: false, rationale: `Judge call failed: ${message}` };
  }
}

/**
 * Resolve the `<provider>/<model>` id for the LLM-judge call.
 *
 * Precedence:
 *   1. `providerOverride` set, `modelOverride` set → `<provider>/<modelOverride>`.
 *   2. `providerOverride` set, no `modelOverride` → `<provider>/<provider-default-judge>`.
 *   3. No override → use `config.judge_model` (legacy field; bare names are
 *      treated as `anthropic/<name>` by parseProvider).
 *   4. Nothing configured → `anthropic/claude-haiku-4-5` (legacy default).
 */
function resolveJudgeModel(config: TestConfig, context: RunContext): string {
  const providerOverride = context.providerOverride;
  if (providerOverride) {
    const modelName =
      context.modelOverride ?? DEFAULT_JUDGE_MODEL_PER_PROVIDER[providerOverride];
    if (!modelName) {
      // Unknown provider — fall through to legacy behavior rather than throw,
      // so misconfiguration surfaces as a judge failure not a crash.
      return config.judge_model ?? 'claude-haiku-4-5';
    }
    return `${providerOverride}/${modelName}`;
  }
  // No override: preserve historical behavior. Legacy `judge_model` values are
  // bare Anthropic model names (e.g. 'claude-haiku-4-5') that parseProvider
  // treats as `anthropic/<name>`.
  return config.judge_model ?? 'claude-haiku-4-5';
}

function buildJudgeUserMessage(userPrompt: string, draft: string): string {
  return `USER REQUEST:\n${userPrompt}\n\nDRAFT:\n${draft}`;
}

function parseJudgeResponse(raw: string, config: TestConfig): TestResult {
  // Attempt to extract JSON block
  const jsonMatch = /\{[\s\S]*\}/.exec(raw);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]) as {
        pass?: boolean;
        score?: number;
        rationale?: string;
      };
      const pass = Boolean(parsed.pass);
      const score = typeof parsed.score === 'number' ? parsed.score : undefined;
      const rationale = parsed.rationale ?? raw.trim();

      // Apply threshold if set
      if (config.threshold !== undefined && score !== undefined) {
        return { pass: score >= config.threshold, score, rationale };
      }
      return { pass, score, rationale };
    } catch {
      // JSON parse failed; fall through
    }
  }

  // Heuristic: look for true/false in first 200 chars
  const snippet = raw.slice(0, 200).toLowerCase();
  const pass = snippet.includes('"pass": true') || snippet.includes('"pass":true');
  return { pass, rationale: raw.trim() };
}

function defaultGroundednessPrompt(): string {
  return `You are a legal-output reviewer evaluating GROUNDEDNESS only.
Given a USER REQUEST and a DRAFT, assess: does every factual claim in the
DRAFT correspond to information either in the USER REQUEST or to general
legal common-knowledge? Hallucinated parties, fabricated cases, invented
jurisdiction-specific rules → fail.
Reply STRICTLY in JSON: { "pass": <true|false>, "score": <0-1>, "rationale": "<one paragraph>" }`;
}

// ---------------------------------------------------------------------------
// Rule runner
// ---------------------------------------------------------------------------

function runRuleTest(input: TestRunnerInput): TestResult {
  const { config, draft } = input;

  if (!config.rule) {
    return { pass: true, rationale: 'No rule config found — defaulting to pass.' };
  }

  const rule = config.rule;

  if (rule.kind === 'regex') {
    const patterns = rule.patterns ?? (rule.pattern ? [rule.pattern] : []);
    for (const pat of patterns) {
      const re = new RegExp(pat);
      if (re.test(draft)) {
        return { pass: false, rationale: `Rule regex matched pattern: ${pat}` };
      }
    }
    return { pass: true, rationale: 'No regex pattern matched.' };
  }

  if (rule.kind === 'token-count') {
    const tokenCount = draft.split(/\s+/).length;
    const threshold = rule.threshold ?? 0;
    const pass = tokenCount <= threshold;
    return {
      pass,
      rationale: `Token count ${tokenCount} ${pass ? '<=' : '>'} threshold ${threshold}.`,
    };
  }

  if (rule.kind === 'date-window') {
    return runDateWindowRule(draft, rule.window_days ?? 30);
  }

  return { pass: true, rationale: `Unknown rule kind '${rule.kind}' — defaulting to pass.` };
}

function runDateWindowRule(draft: string, windowDays: number): TestResult {
  // Look for year references in legal citations: e.g. "(2019)", "Act of 1976", "U.S.C. (2021)"
  const yearPattern = /\b(19|20)\d{2}\b/g;
  const cutoffYear = new Date().getFullYear() - Math.ceil(windowDays / 365);
  const matches = [...draft.matchAll(yearPattern)];

  // Check for "still good law" annotation nearby
  for (const m of matches) {
    const year = parseInt(m[0], 10);
    if (year < cutoffYear) {
      // Check for annotation in ±200 chars around match
      const start = Math.max(0, (m.index ?? 0) - 200);
      const end = Math.min(draft.length, (m.index ?? 0) + 200);
      const context = draft.slice(start, end).toLowerCase();
      if (!context.includes('still good law') && !context.includes('still valid')) {
        return {
          pass: false,
          rationale: `Year ${year} found in draft is older than ${windowDays}-day window (cutoff year: ${cutoffYear}) with no "still good law" annotation.`,
        };
      }
    }
  }
  return { pass: true, rationale: 'No stale dated authorities found.' };
}

// ---------------------------------------------------------------------------
// Failure handler
// ---------------------------------------------------------------------------

export async function handleTestFailure(
  failedTest: TestConfig,
  result: TestResult,
  context: RunContext,
  matterId: string
): Promise<TestFailureAction> {
  const handler = context.workflow.on_test_failure;

  if (handler === 'retry_with_better_model_then_escalate') {
    const key = retryKey(matterId, failedTest.name);
    const count = retryCount.get(key) ?? 0;
    if (count === 0) {
      retryCount.set(key, 1);
      return { action: 'retry_with', model: resolveRetryModel(context) };
    }
    // Already retried once — escalate
    retryCount.set(key, count + 1);
    return { action: 'escalate_to', target: 'human' };
  }

  // Default: escalate
  return { action: 'escalate_to', target: 'human' };
}

/**
 * Resolve the retry model id for `retry_with_better_model_then_escalate`.
 *
 * Precedence:
 *   1. `providerOverride` set → `<provider>/<provider-retry-default>`.
 *   2. No override → `anthropic/claude-opus-4-7` (preserves Sprint 2 behavior).
 */
function resolveRetryModel(context: RunContext): string {
  const providerOverride = context.providerOverride;
  if (providerOverride) {
    const modelName = DEFAULT_RETRY_MODEL_PER_PROVIDER[providerOverride];
    if (modelName) {
      return `${providerOverride}/${modelName}`;
    }
    // Unknown provider — fall back to legacy default.
  }
  return 'anthropic/claude-opus-4-7';
}
