/**
 * PossibLaw v2 — Pretty console output.
 * Uses simple ANSI escapes only — no external dependencies.
 */
import type { RunReport, RunStepResult } from './types.js';

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
// Team list
// ---------------------------------------------------------------------------

export function printTeamList(
  agents: Array<{ name: string; role: string; description: string }>,
  templateName: string,
  opts: PrinterOpts
): void {
  console.log('');
  console.log(c(BOLD, `Team — template: ${templateName}`, opts.color));
  console.log(c(DIM, '─'.repeat(60), opts.color));
  for (const agent of agents) {
    const roleLabel = c(CYAN, `[${agent.role}]`, opts.color);
    console.log(`  ${roleLabel}  ${c(BOLD, agent.name, opts.color)}`);
    console.log(c(DIM, indent(agent.description, 10), opts.color));
  }
  console.log('');
}
