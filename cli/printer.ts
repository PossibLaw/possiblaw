/**
 * PossibLaw v2 — Pretty console output.
 * Uses simple ANSI escapes only — no external dependencies.
 */
import type { RunReport, RunStepResult, AuditEvent } from './types.js';
import { formatCost } from './pricing.js';
import type { CostBreakdown } from './pricing.js';

// ---------------------------------------------------------------------------
// ANSI helpers
// ---------------------------------------------------------------------------

const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const MAGENTA = '\x1b[35m';
const BLUE = '\x1b[34m';

/** Returns a domain-specific color for non-legal domains. */
function domainColor(domain: string, text: string, color: boolean): string {
  if (!color) return text;
  switch (domain) {
    case 'marketing': return `${MAGENTA}${text}${RESET}`;
    case 'finance': return `${BLUE}${text}${RESET}`;
    case 'admin': return `${YELLOW}${text}${RESET}`;
    default: return `${CYAN}${text}${RESET}`;
  }
}

export interface PrinterOpts {
  color: boolean;
  verbose?: boolean;
}

function c(ansi: string, text: string, color: boolean): string {
  return color ? `${ansi}${text}${RESET}` : text;
}

function indent(text: string, spaces = 4): string {
  return text
    .split('\n')
    .map((line) => ' '.repeat(spaces) + line)
    .join('\n');
}

// ---------------------------------------------------------------------------
// Banner
// ---------------------------------------------------------------------------

export function printBanner(opts: PrinterOpts): void {
  console.log(c(DIM, 'PossibLaw does not practice law. Treat output as a starting point.', opts.color));
}

// ---------------------------------------------------------------------------
// Step printer
// ---------------------------------------------------------------------------

export function printStep(step: RunStepResult, opts: PrinterOpts): void {
  const { stepName, agentCallRecord, testName, testPassed, guardrailName, guardrailHit } = step;

  if (agentCallRecord) {
    const label = c(BOLD, `▶ ${stepName}`, opts.color) +
      c(DIM, ` | ${agentCallRecord.agent} | ${agentCallRecord.model}`, opts.color);
    console.log(label);

    const outputPreview = agentCallRecord.output.trim();
    console.log(indent(c(DIM, outputPreview, opts.color)));

    if (agentCallRecord.tokens) {
      console.log(
        indent(c(DIM, `tokens: in=${agentCallRecord.tokens.in} out=${agentCallRecord.tokens.out}`, opts.color))
      );
    }
  } else if (testName !== undefined) {
    const icon = testPassed ? c(GREEN, '✔', opts.color) : c(RED, '✘', opts.color);
    console.log(`${icon} test:${testName} — ${testPassed ? 'passed' : 'FAILED'}`);
  } else if (guardrailName !== undefined) {
    const icon = guardrailHit ? c(YELLOW, '⚠', opts.color) : c(GREEN, '✔', opts.color);
    const status = guardrailHit ? 'HIT (escalating)' : 'clear';
    console.log(`${icon} guardrail:${guardrailName} — ${status}`);
  } else {
    console.log(c(DIM, `  step: ${stepName}`, opts.color));
  }
}

// ---------------------------------------------------------------------------
// Final report
// ---------------------------------------------------------------------------

export function printReport(report: RunReport, opts: PrinterOpts): void {
  console.log('');
  console.log(c(BOLD, '─'.repeat(72), opts.color));

  if (report.status === 'delivered') {
    console.log(c(GREEN + BOLD, '✔  DELIVERED', opts.color));
    console.log('');
    console.log(c(BOLD, 'Deliverable:', opts.color));
    console.log('');
    console.log(report.deliverable.trim());
  } else if (report.status === 'escalated') {
    printEscalationCard(report, opts);
  } else {
    // error
    console.log(c(RED + BOLD, '✘  PIPELINE ERROR', opts.color));
    console.log('');
    console.log(report.error ?? 'Unknown error');
  }

  console.log('');
  console.log(c(BOLD, '─'.repeat(72), opts.color));

  // Print test + guardrail results summary if available
  if (report.test_results && report.test_results.length > 0) {
    console.log('');
    console.log(c(BOLD, 'Test results:', opts.color));
    for (const { name, result } of report.test_results) {
      const icon = result.pass ? c(GREEN, '✔', opts.color) : c(RED, '✘', opts.color);
      const score = result.score !== undefined ? ` (score: ${result.score.toFixed(2)})` : '';
      console.log(`  ${icon}  ${name}${score}`);
      console.log(indent(c(DIM, result.rationale, opts.color), 6));
    }
  }
  if (report.guardrail_results && report.guardrail_results.length > 0) {
    console.log('');
    console.log(c(BOLD, 'Guardrail results:', opts.color));
    for (const { name, result } of report.guardrail_results) {
      const icon = result.human_required ? c(YELLOW, '⚠', opts.color) : c(GREEN, '✔', opts.color);
      console.log(`  ${icon}  ${name}`);
      console.log(indent(c(DIM, result.reason, opts.color), 6));
    }
  }
  if (report.audit_log_path) {
    console.log('');
    console.log(c(DIM, `Audit log: ${report.audit_log_path}`, opts.color));
  }

  if (report.cost) {
    printCostReport(report.cost, opts);
  }
}

// ---------------------------------------------------------------------------
// Cost report
// ---------------------------------------------------------------------------

export function printCostReport(cost: CostBreakdown, opts: PrinterOpts): void {
  const offline = cost.notes.some((n) => n.includes('offline'));
  console.log('');
  console.log(c(DIM, '─'.repeat(45), opts.color));
  console.log(c(BOLD, 'Cost report (pricing snapshot 2026-05-20)', opts.color));
  console.log(c(DIM, '─'.repeat(45), opts.color));

  if (offline) {
    console.log(c(DIM, '  (offline — model costs not incurred)', opts.color));
  } else {
    const bp = cost.by_phase;
    console.log(`  Routing:    ${formatCost(bp.routing)}`);
    console.log(`  Specialist: ${formatCost(bp.specialist)}`);
    console.log(`  Tests:      ${formatCost(bp.tests)}`);
    console.log(`  Guardrails: ${formatCost(bp.guardrails)}  (rule-based, free)`);
    console.log(c(DIM, '  ' + '─'.repeat(35), opts.color));
    console.log(`  Total:      ${c(BOLD, formatCost(cost.total), opts.color)}`);
  }

  console.log(c(DIM, '─'.repeat(45), opts.color));
  for (const note of cost.notes) {
    if (!note.includes('offline')) {
      console.log(c(DIM, `  Note: ${note}`, opts.color));
    }
  }
}

function printEscalationCard(report: RunReport, opts: PrinterOpts): void {
  const box = (text: string): string => c(YELLOW + BOLD, text, opts.color);

  console.log(box('╔══════════════════════════════════════════════════════════════════════╗'));
  console.log(box('║                        ESCALATION CARD                              ║'));
  console.log(box('╚══════════════════════════════════════════════════════════════════════╝'));
  console.log('');

  console.log(c(BOLD, 'Matter:', opts.color));
  console.log(indent(report.userPrompt, 2));
  console.log('');

  // Which guardrail hit?
  const hitStep = report.steps.find(
    (s) => s.guardrailHit === true || (s.stepName.startsWith('guardrail') && s.guardrailHit)
  );
  if (hitStep?.guardrailName) {
    console.log(c(BOLD, 'Guardrail triggered:', opts.color));
    console.log(indent(hitStep.guardrailName, 2));
    console.log('');
  }

  if (report.escalationReason) {
    console.log(c(BOLD, 'Reason:', opts.color));
    console.log(indent(report.escalationReason.trim(), 2));
    console.log('');
  }

  console.log(c(BOLD, 'Recommended next action:', opts.color));
  console.log(indent('Reviewing lawyer must approve before signed document is sent.', 2));
  console.log('');

  if (report.deliverable) {
    console.log(c(BOLD, 'Draft deliverable (for lawyer review):', opts.color));
    console.log('');
    console.log(report.deliverable.trim());
  }
}

// ---------------------------------------------------------------------------
// Audit log printer
// ---------------------------------------------------------------------------

export function printAuditLog(events: AuditEvent[], matterId: string, opts: PrinterOpts): void {
  console.log('');
  console.log(c(BOLD, `Audit log — matter: ${matterId}`, opts.color));
  console.log(c(DIM, '─'.repeat(72), opts.color));
  if (events.length === 0) {
    console.log(c(DIM, '  (no events)', opts.color));
    return;
  }
  for (const evt of events) {
    const ts = c(DIM, evt.ts, opts.color);
    const step = c(BOLD, evt.step, opts.color);
    console.log(`  ${ts}  ${step}`);
    if (evt.agent) console.log(indent(c(DIM, `agent: ${evt.agent}  model: ${evt.model ?? '—'}`, opts.color), 6));
    if (evt.test) {
      const icon = evt.test.result.pass ? c(GREEN, '✔', opts.color) : c(RED, '✘', opts.color);
      const score = evt.test.result.score !== undefined ? ` score=${evt.test.result.score.toFixed(2)}` : '';
      console.log(indent(`${icon} test:${evt.test.name}${score} — ${evt.test.result.rationale}`, 6));
    }
    if (evt.guardrail) {
      const icon = evt.guardrail.result.human_required ? c(YELLOW, '⚠', opts.color) : c(GREEN, '✔', opts.color);
      console.log(indent(`${icon} guardrail:${evt.guardrail.name} — ${evt.guardrail.result.reason}`, 6));
    }
    if (evt.failure_action) {
      const target = evt.failure_target ?? '—';
      console.log(indent(c(YELLOW, `failure_action: ${evt.failure_action} → ${target}`, opts.color), 6));
    }
    if (evt.prompt_hash) console.log(indent(c(DIM, `prompt_hash: ${evt.prompt_hash.slice(0, 16)}...`, opts.color), 6));
    if (evt.output_hash) console.log(indent(c(DIM, `output_hash: ${evt.output_hash.slice(0, 16)}...`, opts.color), 6));
  }
  console.log('');
}

// ---------------------------------------------------------------------------
// Team list
// ---------------------------------------------------------------------------

export function printTeamList(
  agents: Array<{ name: string; role: string; description: string; domain?: string }>,
  templateName: string,
  opts: PrinterOpts
): void {
  console.log('');
  console.log(c(BOLD, `Team — template: ${templateName}`, opts.color));
  console.log(c(DIM, '─'.repeat(60), opts.color));
  for (const agent of agents) {
    const domain = agent.domain ?? 'legal';
    const roleLabel = domainColor(domain, `[${agent.role}]`, opts.color);
    const domainTag = domain !== 'legal' && domain !== 'ops'
      ? domainColor(domain, ` <${domain}>`, opts.color)
      : '';
    console.log(`  ${roleLabel}  ${c(BOLD, agent.name, opts.color)}${domainTag}`);
    console.log(c(DIM, indent(agent.description, 10), opts.color));
  }
  console.log('');
}
