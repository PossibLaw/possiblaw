/**
 * PossibLaw v2 — Test runner.
 * Dispatches on TestConfig.type: stub | llm-judge | rule.
 */
import type {
  TestConfig,
  TestResult,
  TestFailureAction,
  RunContext,
} from './types.js';

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

  const judgeModel = config.judge_model ?? 'claude-haiku-4-5';
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

  // Live: call Anthropic
  try {
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    const client = new Anthropic();
    const res = await client.messages.create({
      model: judgeModel.replace(/^anthropic\//, ''),
      max_tokens: 512,
      system: rawPrompt,
      messages: [{ role: 'user', content: userMessage }],
    });

    const raw = res.content
      .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
      .map((b) => b.text)
      .join('');

    return parseJudgeResponse(raw, config);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    // Fail safe: if judge errors, return fail with reason
    return { pass: false, rationale: `Judge call failed: ${message}` };
  }
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
      return { action: 'retry_with', model: 'anthropic/claude-opus-4-7' };
    }
    // Already retried once — escalate
    retryCount.set(key, count + 1);
    return { action: 'escalate_to', target: 'human' };
  }

  // Default: escalate
  return { action: 'escalate_to', target: 'human' };
}
