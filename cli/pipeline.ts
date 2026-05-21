/**
 * PossibLaw v2 — Workflow pipeline runner.
 */
import { loadAgent, loadTest, loadGuardrail, loadSkill } from './loader.js';
import { runAgent } from './anthropic.js';
import type {
  Workflow,
  Agent,
  RunReport,
  RunStepResult,
  AgentCallRecord,
} from './types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Parse ROUTE_TO and Rationale from router/lead output. */
function parseRoutingOutput(output: string): { routeTo: string | null; rationale: string | null } {
  const routeMatch = /^ROUTE_TO:\s*(\S+)/m.exec(output);
  const rationaleMatch = /^Rationale:\s*(.+)/m.exec(output);
  return {
    routeTo: routeMatch ? routeMatch[1].trim() : null,
    rationale: rationaleMatch ? rationaleMatch[1].trim() : null,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface PipelineOpts {
  verbose?: boolean;
  offline: boolean;
}

export async function runPipeline(
  workflow: Workflow,
  userPrompt: string,
  opts: PipelineOpts
): Promise<RunReport> {
  const stepResults: RunStepResult[] = [];
  const agentCalls: AgentCallRecord[] = [];
  let deliverable = '';
  let escalationReason: string | undefined;

  try {
    // -----------------------------------------------------------------------
    // Phase 1: Router chain
    // -----------------------------------------------------------------------
    let currentAgentName = workflow.router;
    let specialistName: string | null = null;
    const MAX_HOPS = 3;
    let hops = 0;

    while (hops < MAX_HOPS && specialistName === null) {
      hops++;
      const agent: Agent = loadAgent(currentAgentName);
      const stepName = `route:${currentAgentName}`;

      const result = await runAgent(agent, userPrompt, { verbose: opts.verbose });

      const { routeTo, rationale } = parseRoutingOutput(result.output);

      const record: AgentCallRecord = {
        agent: agent.name,
        model: result.model,
        output: result.output,
        tokens: result.tokens,
        routeTo: routeTo ?? undefined,
        rationale: rationale ?? undefined,
      };
      agentCalls.push(record);

      stepResults.push({
        stepName,
        agentCallRecord: record,
      });

      if (!routeTo) {
        // No routing directive — treat output as final deliverable if specialist
        if (agent.role === 'specialist') {
          deliverable = result.output;
          specialistName = agent.name;
        } else {
          throw new Error(
            `Agent '${agent.name}' (${agent.role}) produced no ROUTE_TO directive and is not a specialist.`
          );
        }
        break;
      }

      if (routeTo === 'human-escalation') {
        // Early escalation from router
        escalationReason = rationale ?? 'Router escalated to human review.';
        stepResults.push({
          stepName: 'guardrail:human-escalation',
          guardrailName: 'router-escalation',
          guardrailHit: true,
          escalationReason,
        });
        return buildReport(workflow.name, userPrompt, stepResults, agentCalls, '', 'escalated', escalationReason);
      }

      // Determine if next agent is a specialist or another router/lead
      const nextAgent: Agent = loadAgent(routeTo);
      if (nextAgent.role === 'specialist') {
        specialistName = nextAgent.name;
      } else {
        currentAgentName = routeTo;
      }
    }

    if (specialistName === null) {
      throw new Error('Router chain exhausted without reaching a specialist after 3 hops.');
    }

    // -----------------------------------------------------------------------
    // Phase 2: Specialist
    // -----------------------------------------------------------------------
    const specialist: Agent = loadAgent(specialistName);
    const skills = specialist.skills.map((skillName) => loadSkill(skillName));

    const specialistResult = await runAgent(specialist, userPrompt, {
      skills,
      verbose: opts.verbose,
    });

    deliverable = specialistResult.output;

    const specialistRecord: AgentCallRecord = {
      agent: specialist.name,
      model: specialistResult.model,
      output: specialistResult.output,
      tokens: specialistResult.tokens,
    };
    agentCalls.push(specialistRecord);
    stepResults.push({
      stepName: `specialist:${specialist.name}`,
      agentCallRecord: specialistRecord,
    });

    // -----------------------------------------------------------------------
    // Phase 3: Tests
    // -----------------------------------------------------------------------
    const testSuiteStep = workflow.pipeline.find(
      (p): p is { step: 'test'; suite: string[] } => p.step === 'test'
    );
    if (testSuiteStep) {
      for (const testName of testSuiteStep.suite) {
        const testConfig = loadTest(testName);
        let passed = true;

        if (testConfig.type === 'stub') {
          passed = testConfig.stub_result.pass;
        }

        stepResults.push({
          stepName: `test:${testName}`,
          testName,
          testPassed: passed,
        });

        if (!passed) {
          // on_test_failure: retry_with_better_model_then_escalate
          // Sprint 1a: stub always passes; this path is future-facing
          escalationReason = `Test '${testName}' failed. ${testConfig.stub_result.rationale}`;
          return buildReport(
            workflow.name, userPrompt, stepResults, agentCalls,
            deliverable, 'escalated', escalationReason
          );
        }
      }
    }

    // -----------------------------------------------------------------------
    // Phase 4: Guardrails
    // -----------------------------------------------------------------------
    const guardrailStep = workflow.pipeline.find(
      (p): p is { step: 'guardrail'; suite: string[] } => p.step === 'guardrail'
    );
    if (guardrailStep) {
      for (const guardrailName of guardrailStep.suite) {
        const guardrailConfig = loadGuardrail(guardrailName);
        let humanRequired = false;

        if (guardrailConfig.type === 'stub') {
          humanRequired = guardrailConfig.stub_result.human_required;
        }

        stepResults.push({
          stepName: `guardrail:${guardrailName}`,
          guardrailName,
          guardrailHit: humanRequired,
          escalationReason: humanRequired
            ? guardrailConfig.stub_result.reason_template
            : undefined,
        });

        if (humanRequired) {
          // on_guardrail_hit: escalate_to_human
          escalationReason = guardrailConfig.stub_result.reason_template;
          return buildReport(
            workflow.name, userPrompt, stepResults, agentCalls,
            deliverable, 'escalated', escalationReason
          );
        }
      }
    }

    // -----------------------------------------------------------------------
    // All clear
    // -----------------------------------------------------------------------
    return buildReport(workflow.name, userPrompt, stepResults, agentCalls, deliverable, 'delivered');
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    // Determine which step was active when the error occurred
    const lastStep = stepResults[stepResults.length - 1];
    const stepLabel = lastStep ? lastStep.stepName : 'init';
    const tagged = `Pipeline failed at step ${stepLabel}: ${message}`;
    return buildReport(workflow.name, userPrompt, stepResults, agentCalls, deliverable, 'error', tagged);
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function buildReport(
  workflowName: string,
  userPrompt: string,
  steps: RunStepResult[],
  agentCalls: AgentCallRecord[],
  deliverable: string,
  status: RunReport['status'],
  escalationOrError?: string
): RunReport {
  const report: RunReport = {
    workflow: workflowName,
    userPrompt,
    steps,
    agentCalls,
    deliverable,
    status,
  };
  if (status === 'escalated') report.escalationReason = escalationOrError;
  if (status === 'error') report.error = escalationOrError;
  return report;
}
