/**
 * PossibLaw v2 — Guardrail runner.
 * Dispatches on GuardrailConfig.type: stub | llm-judge | rule.
 */
import type {
  GuardrailConfig,
  GuardrailResult,
  GuardrailEscalationAction,
  RunContext,
} from './types.js';

// ---------------------------------------------------------------------------
// Input type
// ---------------------------------------------------------------------------

export interface GuardrailRunnerInput {
  context: RunContext;
  draft: string;
  config: GuardrailConfig;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function runGuardrail(input: GuardrailRunnerInput): Promise<GuardrailResult> {
  const { config } = input;

  if (config.type === 'stub') {
    return {
      human_required: config.stub_result.human_required,
      reason: config.stub_result.reason_template,
    };
  }

  if (config.type === 'rule') {
    return runRuleGuardrail(input);
  }

  if (config.type === 'llm-judge') {
    return runLlmJudgeGuardrail(input);
  }

  // Unknown type: fall back to stub
  return {
    human_required: config.stub_result?.human_required ?? false,
    reason: config.stub_result?.reason_template ?? `Unknown guardrail type '${config.type}' — defaulting to clear.`,
  };
}

// ---------------------------------------------------------------------------
// Regex helper — extract inline flags like (?im) and use them as JS flags
// ---------------------------------------------------------------------------

function buildRegex(pattern: string): RegExp {
  // Strip leading (?<flags>) inline-flag group if present
  const inlineMatch = /^\(\?([gimsuy]+)\)/.exec(pattern);
  if (inlineMatch) {
    const flags = inlineMatch[1];
    const body = pattern.slice(inlineMatch[0].length);
    return new RegExp(body, flags);
  }
  return new RegExp(pattern, 'im');
}

// ---------------------------------------------------------------------------
// Rule guardrail
// ---------------------------------------------------------------------------

function runRuleGuardrail(input: GuardrailRunnerInput): GuardrailResult {
  const { config, draft } = input;

  if (!config.rule) {
    return { human_required: false, reason: 'No rule config — defaulting to clear.' };
  }

  const rule = config.rule;

  if (rule.kind === 'regex') {
    const patterns = rule.patterns ?? (rule.pattern ? [rule.pattern] : []);
    for (const pat of patterns) {
      const re = buildRegex(pat);
      if (re.test(draft)) {
        const reasonTemplate = config.reason_template ?? config.stub_result?.reason_template ?? '';
        const reason = reasonTemplate.replace('<pattern>', pat).trim() ||
          `Guardrail '${config.name}' fired: pattern matched: ${pat}`;
        return { human_required: true, reason };
      }
    }
    return { human_required: false, reason: `Guardrail '${config.name}': no patterns matched — clear.` };
  }

  return { human_required: false, reason: `Unknown rule kind '${rule.kind}' — defaulting to clear.` };
}

// ---------------------------------------------------------------------------
// LLM-judge guardrail
// ---------------------------------------------------------------------------

async function runLlmJudgeGuardrail(input: GuardrailRunnerInput): Promise<GuardrailResult> {
  const { config, draft, context } = input;

  const judgeModel = config.judge_model ?? 'claude-haiku-4-5';
  const rawPrompt = config.judge_prompt ?? defaultBarRulePrompt();

  // Offline: return stub_result
  if (context.offline) {
    return {
      human_required: config.stub_result?.human_required ?? false,
      reason: config.stub_result?.reason_template ?? 'Offline — stub result.',
    };
  }

  try {
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    const client = new Anthropic();
    const res = await client.messages.create({
      model: judgeModel.replace(/^anthropic\//, ''),
      max_tokens: 512,
      system: rawPrompt,
      messages: [{ role: 'user', content: `USER REQUEST:\n${context.userPrompt}\n\nDRAFT:\n${draft}` }],
    });

    const raw = res.content
      .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
      .map((b) => b.text)
      .join('');

    return parseGuardrailJudgeResponse(raw, config);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    // Fail safe: if judge errors, return clear (don't block unnecessarily)
    return { human_required: false, reason: `Guardrail judge call failed: ${message} — defaulting to clear.` };
  }
}

function parseGuardrailJudgeResponse(raw: string, config: GuardrailConfig): GuardrailResult {
  const jsonMatch = /\{[\s\S]*\}/.exec(raw);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]) as {
        human_required?: boolean;
        fired?: boolean;
        reason?: string;
        rationale?: string;
      };
      return {
        human_required: Boolean(parsed.human_required ?? parsed.fired),
        reason: parsed.reason ?? parsed.rationale ?? raw.trim(),
      };
    } catch {
      // fall through
    }
  }
  const snippet = raw.slice(0, 200).toLowerCase();
  const human_required = snippet.includes('"human_required": true') ||
    snippet.includes('"fired": true');
  return { human_required, reason: raw.trim() };
}

function defaultBarRulePrompt(): string {
  return `You are a legal-output reviewer evaluating BAR RULE 7.3 compliance (anti-solicitation).
Given a USER REQUEST and a DRAFT, assess: does this output constitute direct solicitation of legal
services to a non-lawyer who has not consented to such contact?
Reply STRICTLY in JSON: { "human_required": <true|false>, "reason": "<one paragraph>" }`;
}

// ---------------------------------------------------------------------------
// Escalation handler
// ---------------------------------------------------------------------------

export async function handleGuardrailHit(
  firedGuardrail: GuardrailConfig,
  result: GuardrailResult,
  context: RunContext
): Promise<GuardrailEscalationAction> {
  const handler = context.workflow.on_guardrail_hit;

  if (handler === 'escalate_to_human') {
    return { action: 'escalate_to', target: 'human' };
  }

  // Default: escalate to human
  return { action: 'escalate_to', target: 'human' };
}
