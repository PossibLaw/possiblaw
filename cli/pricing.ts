/**
 * PossibLaw v2 — Token pricing module.
 * Pricing snapshot: 2026-05-20.
 * Source: Anthropic public pricing.
 * Update this file when pricing changes.
 */

// ---------------------------------------------------------------------------
// Pricing table (USD per 1M tokens)
// ---------------------------------------------------------------------------

interface ModelPrice {
  inputPerMillion: number;
  outputPerMillion: number;
}

const PRICING_TABLE: Record<string, ModelPrice> = {
  'claude-opus-4-7': { inputPerMillion: 15.0, outputPerMillion: 75.0 },
  'claude-sonnet-4-6': { inputPerMillion: 3.0, outputPerMillion: 15.0 },
  'claude-haiku-4-5': { inputPerMillion: 0.8, outputPerMillion: 4.0 },
};

// ---------------------------------------------------------------------------
// Cost types
// ---------------------------------------------------------------------------

export interface CostByCall {
  agent: string;
  model: string;
  input: number;
  output: number;
  cost: number;
}

export interface CostBreakdown {
  total: number;
  by_phase: { routing: number; specialist: number; tests: number; guardrails: number };
  by_call: CostByCall[];
  notes: string[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function normalizeModel(model: string): string {
  // Strip "(offline)" suffix
  const cleaned = model.replace(/\s*\(offline\)\s*$/, '').trim();
  // Strip "anthropic/" prefix
  return cleaned.replace(/^anthropic\//, '');
}

function isOffline(model: string): boolean {
  return model.includes('(offline)');
}

function isOllama(model: string): boolean {
  const cleaned = normalizeModel(model);
  return cleaned.startsWith('ollama/') || model.startsWith('ollama/');
}

/**
 * Returns true if the model string belongs to a subscription-auth provider
 * (claude-cli/* or codex-cli/*). For these providers the operator already
 * pays via subscription, so the per-call cost is $0.
 */
export function isSubscriptionProvider(model: string): boolean {
  const cleaned = model.replace(/\s*\(offline\)\s*$/, '').trim();
  return cleaned.startsWith('claude-cli/') || cleaned.startsWith('codex-cli/');
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Compute cost for a single LLM call.
 * Returns 0 for offline / ollama runs.
 */
export function costForCall(
  model: string,
  inputTokens: number,
  outputTokens: number
): number {
  if (isOffline(model) || isOllama(model)) return 0;
  // Subscription providers: operator pays the flat subscription fee, not per-call.
  if (isSubscriptionProvider(model)) return 0;

  const normalized = normalizeModel(model);
  const price = PRICING_TABLE[normalized];
  if (!price) return 0;

  return (inputTokens / 1_000_000) * price.inputPerMillion +
         (outputTokens / 1_000_000) * price.outputPerMillion;
}

/**
 * Format the cost cell for a single agent call. For subscription providers,
 * returns the literal string `subscription` so the cost report makes clear
 * the call did not incur a per-call charge. For all other providers, returns
 * a dollar-formatted string with 4 decimal places.
 */
export function formatCallCost(model: string, cost: number): string {
  if (isSubscriptionProvider(model)) return 'subscription';
  return formatCost(cost);
}

const PRICING_NOTE = 'Pricing snapshot 2026-05-20. Update cli/pricing.ts to refresh.';

// ---------------------------------------------------------------------------
// Typical-call assumptions for workflow cost estimates
// ---------------------------------------------------------------------------

export const TYPICAL_TOKENS = {
  router: { in: 400, out: 80 },
  specialist: { in: 800, out: 1500 },
  test: { in: 200, out: 60 },
  guardrail: { in: 0, out: 0 }, // rule-based, free
} as const;

/**
 * Compute estimated cost for a workflow using typical-call assumptions.
 */
export function estimateWorkflowCost(
  routerCalls: Array<{ agent: string; model: string }>,
  specialistCalls: Array<{ agent: string; model: string }>,
  testCalls: Array<{ agent: string; model: string }>,
  guardrailCalls: Array<{ agent: string; model: string }>
): CostBreakdown {
  const by_call: CostByCall[] = [];
  let routing = 0;
  let specialist = 0;
  let tests = 0;
  let guardrails = 0;

  for (const r of routerCalls) {
    const cost = costForCall(r.model, TYPICAL_TOKENS.router.in, TYPICAL_TOKENS.router.out);
    routing += cost;
    by_call.push({ agent: r.agent, model: r.model, input: TYPICAL_TOKENS.router.in, output: TYPICAL_TOKENS.router.out, cost });
  }

  for (const s of specialistCalls) {
    const cost = costForCall(s.model, TYPICAL_TOKENS.specialist.in, TYPICAL_TOKENS.specialist.out);
    specialist += cost;
    by_call.push({ agent: s.agent, model: s.model, input: TYPICAL_TOKENS.specialist.in, output: TYPICAL_TOKENS.specialist.out, cost });
  }

  for (const t of testCalls) {
    const cost = costForCall(t.model, TYPICAL_TOKENS.test.in, TYPICAL_TOKENS.test.out);
    tests += cost;
    by_call.push({ agent: t.agent, model: t.model, input: TYPICAL_TOKENS.test.in, output: TYPICAL_TOKENS.test.out, cost });
  }

  for (const g of guardrailCalls) {
    // Rule-based guardrails are free
    by_call.push({ agent: g.agent, model: g.model, input: 0, output: 0, cost: 0 });
  }

  const total = routing + specialist + tests + guardrails;
  return {
    total,
    by_phase: { routing, specialist, tests, guardrails },
    by_call,
    notes: [PRICING_NOTE],
  };
}

/**
 * Format a cost figure as a dollar string with 4 decimal places.
 */
export function formatCost(cost: number): string {
  return `$${cost.toFixed(4)}`;
}
