// PossibLaw v2 — Core TypeScript types
// Mirrors the authoritative layer/ schemas exactly.

export interface Agent {
  name: string;
  role: 'router' | 'lead' | 'specialist';
  domain: 'legal' | 'marketing' | 'finance' | 'admin' | 'ops';
  reports_to: string | null;
  manages: string[];
  model: string;
  fallback_model: string;
  tests: string[];
  guardrails: string[];
  skills: string[];
  description: string;
  /** System-prompt body (markdown content after frontmatter). */
  body: string;
}

export interface Workflow {
  name: string;
  description: string;
  router: string;
  pipeline: PipelineStep[];
  on_test_failure: string;
  on_guardrail_hit: string;
}

export type PipelineStep =
  | { step: 'route'; agent: string }
  | { step: 'specialist'; agent: string }
  | { step: 'test'; suite: string[] }
  | { step: 'guardrail'; suite: string[] };

export interface Template {
  name: string;
  description?: string;
  roster: {
    routers: string[];
    leads: string[];
    specialists: string[];
  };
  workflows: string[];
  disclaimer: string;
}

export interface TestConfig {
  name: string;
  kind: 'test';
  type: 'stub' | string;
  description: string;
  threshold?: number;
  stub_result: {
    pass: boolean;
    score: number;
    rationale: string;
  };
}

export interface GuardrailConfig {
  name: string;
  kind: 'guardrail';
  type: 'stub' | string;
  description: string;
  triggers: Array<{ action_type?: string; output_kind?: string }>;
  stub_result: {
    human_required: boolean;
    reason_template: string;
  };
}

export interface Skill {
  name: string;
  description: string;
  /** Markdown body after frontmatter. */
  body: string;
}

// ---------------------------------------------------------------------------
// Run context / report types
// ---------------------------------------------------------------------------

export interface AgentCallRecord {
  agent: string;
  model: string;
  output: string;
  tokens: { in: number; out: number } | null;
  /** Parsed ROUTE_TO value, if the output contained one. */
  routeTo?: string;
  /** Parsed Rationale text, if the output contained one. */
  rationale?: string;
}

export type RunStatus = 'delivered' | 'escalated' | 'error';

export interface RunStepResult {
  stepName: string;
  agentCallRecord?: AgentCallRecord;
  testName?: string;
  testPassed?: boolean;
  guardrailName?: string;
  guardrailHit?: boolean;
  escalationReason?: string;
}

export interface RunReport {
  workflow: string;
  userPrompt: string;
  steps: RunStepResult[];
  agentCalls: AgentCallRecord[];
  deliverable: string;
  status: RunStatus;
  escalationReason?: string;
  error?: string;
}

export interface RunContext {
  workflow: Workflow;
  userPrompt: string;
  verbose: boolean;
  offline: boolean;
}
