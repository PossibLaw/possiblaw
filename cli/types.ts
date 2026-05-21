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

export interface TestRuleConfig {
  kind: 'regex' | 'token-count' | 'date-window';
  pattern?: string;
  patterns?: string[];
  threshold?: number;
  window_days?: number;
  min_count?: number;
}

export interface TestConfig {
  name: string;
  kind: 'test';
  type: 'stub' | 'llm-judge' | 'rule' | string;
  description: string;
  threshold?: number;
  judge_model?: string;
  judge_prompt?: string;
  rule?: TestRuleConfig;
  stub_result: {
    pass: boolean;
    score: number;
    rationale: string;
  };
}

export interface PrivacyProfileCheckRule {
  kind: 'privacy-profile-check';
  required_when: {
    matter_tag: string[];
  };
  forbid_profile: string;
}

export interface GuardrailRuleConfig {
  kind: 'regex' | 'token-count' | 'privacy-profile-check';
  pattern?: string;
  patterns?: string[];
  threshold?: number;
  required_when?: { matter_tag: string[] };
  forbid_profile?: string;
}

export interface GuardrailConfig {
  name: string;
  kind: 'guardrail';
  type: 'stub' | 'llm-judge' | 'rule' | string;
  description: string;
  triggers: Array<{ action_type?: string; output_kind?: string }>;
  judge_model?: string;
  judge_prompt?: string;
  rule?: GuardrailRuleConfig;
  reason_template?: string;
  stub_result: {
    human_required: boolean;
    reason_template: string;
  };
}

// ---------------------------------------------------------------------------
// Test + Guardrail result types
// ---------------------------------------------------------------------------

export interface TestResult {
  pass: boolean;
  score?: number;
  rationale: string;
}

export interface GuardrailResult {
  human_required: boolean;
  reason: string;
}

// ---------------------------------------------------------------------------
// Failure handler types
// ---------------------------------------------------------------------------

export type TestFailureAction =
  | { action: 'retry_with'; model: string }
  | { action: 'escalate_to'; target: 'human' }
  | { action: 'route_to'; agent: string };

export type GuardrailEscalationAction =
  | { action: 'escalate_to'; target: 'human' }
  | { action: 'route_to'; agent: string };

// ---------------------------------------------------------------------------
// Audit event type
// ---------------------------------------------------------------------------

export interface AuditEvent {
  ts: string;
  matter_id: string;
  step: string;
  agent?: string;
  model?: string;
  prompt_hash?: string;
  output_hash?: string;
  /** Plaintext prompt (Sprint 2 — Sprint 3 removes for privileged matters). */
  prompt?: string;
  /** Plaintext output (Sprint 2 — Sprint 3 removes for privileged matters). */
  output?: string;
  parent_step?: string | null;
  test?: { name: string; result: TestResult };
  guardrail?: { name: string; result: GuardrailResult };
  failure_action?: 'retry_with' | 'escalate_to' | 'route_to';
  failure_target?: string;
  test_results?: TestResult[] | null;
  guardrail_results?: GuardrailResult[] | null;
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
  test_results: { name: string; result: TestResult }[];
  guardrail_results: { name: string; result: GuardrailResult }[];
  audit_log_path: string;
}

export interface RunContext {
  workflow: Workflow;
  userPrompt: string;
  verbose: boolean;
  offline: boolean;
  privacyProfile?: 'always' | 'cloud-only' | 'off';
  matterTag?: string;
}
