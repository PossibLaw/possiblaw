/**
 * PossibLaw v2 — Workflow pipeline runner.
 */
import { randomUUID } from 'node:crypto';
import { loadAgent, loadTest, loadGuardrail, loadSkill } from './loader.js';
import { runAgent } from './anthropic.js';
import { runTest, handleTestFailure } from './test-runner.js';
import { runGuardrail, handleGuardrailHit } from './guardrail-runner.js';
import { createAuditLog } from './audit.js';
import { encode, decode, PrivacyFilterError } from './privacy-filter.js';
import type {
  Workflow,
  Agent,
  RunReport,
  RunStepResult,
  AgentCallRecord,
  RunContext,
  TestResult,
  GuardrailResult,
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

/**
 * Determine whether the privacy filter should apply to this agent call.
 * Returns true if `profile === 'always'`, or if `profile === 'cloud-only'` and the
 * agent model is a cloud/Anthropic model (model id starts with 'anthropic/' or 'claude').
 */
function shouldApplyPrivacyFilter(
  profile: 'always' | 'cloud-only' | 'off',
  agentModel: string
): boolean {
  if (profile === 'off') return false;
  if (profile === 'always') return true;
  // cloud-only: apply when the model is a cloud model
  const normalized = agentModel.toLowerCase().replace(/^anthropic\//, '');
  return normalized.startsWith('claude') || agentModel.startsWith('anthropic/');
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface PipelineOpts {
  verbose?: boolean;
  offline: boolean;
  privacyProfile?: 'always' | 'cloud-only' | 'off';
  matterTag?: string;
}

export async function runPipeline(
  workflow: Workflow,
  userPrompt: string,
  opts: PipelineOpts
): Promise<RunReport> {
  const matterId = randomUUID();
  const audit = createAuditLog(matterId);

  const stepResults: RunStepResult[] = [];
  const agentCalls: AgentCallRecord[] = [];
  const testResults: { name: string; result: TestResult }[] = [];
  const guardrailResults: { name: string; result: GuardrailResult }[] = [];
  let deliverable = '';
  let escalationReason: string | undefined;

  const privacyProfile = opts.privacyProfile ?? 'cloud-only';
  const matterTag = opts.matterTag ?? '';

  const context: RunContext = {
    workflow,
    userPrompt,
    verbose: opts.verbose ?? false,
    offline: opts.offline,
    privacyProfile,
    matterTag,
  };

  try {
    // -----------------------------------------------------------------------
    // Phase 1: Router chain
    // -----------------------------------------------------------------------
    let currentAgentName = workflow.router;
    let specialistName: string | null = null;
    const MAX_HOPS = 4; // Raised from 3 to support 3-hop chains (cos→chief-counsel→commercial-lead)
    let hops = 0;
    let parentStep: string | null = null;

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

      // Audit: log router call
      audit.log({
        step: stepName,
        agent: agent.name,
        model: result.model,
        prompt: userPrompt,
        output: result.output,
        parent_step: parentStep,
      });
      parentStep = stepName;

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
        return buildReport({
          workflowName: workflow.name,
          userPrompt,
          steps: stepResults,
          agentCalls,
          deliverable: '',
          status: 'escalated',
          escalationOrError: escalationReason,
          testResults,
          guardrailResults,
          auditLogPath: audit.path,
        });
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
      throw new Error('Router chain exhausted without reaching a specialist after 4 hops.');
    }

    // -----------------------------------------------------------------------
    // Phase 2: Specialist
    // -----------------------------------------------------------------------
    const specialist: Agent = loadAgent(specialistName);
    const skills = specialist.skills.map((skillName) => loadSkill(skillName));

    const runSpecialist = async (model?: string) => {
      const agentOverride: Agent = model
        ? { ...specialist, model }
        : specialist;

      const effectiveModel = agentOverride.model;
      const applyFilter = shouldApplyPrivacyFilter(privacyProfile, effectiveModel);

      if (applyFilter) {
        // Encode: replace entities in user prompt before sending to cloud LLM
        const encoded = await encode(userPrompt, matterId);
        if (opts.verbose) {
          console.error(
            `[privacy-filter] Encoded prompt (mode=${encoded.mode ?? 'llm'}). ` +
            `Key store has ${Object.keys(encoded.key_store).length} entries.`
          );
        }

        // Audit: log privacy-filter encode step
        audit.log({
          step: 'privacy-filter:encode',
          parent_step: parentStep,
          prompt: `[privacy-filter mode=${encoded.mode ?? 'llm'}] masked_text_length=${encoded.masked_text.length}`,
          output: JSON.stringify(Object.keys(encoded.key_store)),
        });

        const rawResult = await runAgent(agentOverride, encoded.masked_text, { skills, verbose: opts.verbose });

        // Decode: rehydrate entities in the model response
        let decodedOutput: string;
        try {
          decodedOutput = await decode(rawResult.output, encoded.key_store);
        } catch (pfErr: unknown) {
          if (pfErr instanceof PrivacyFilterError) {
            throw pfErr;
          }
          throw pfErr;
        }

        if (opts.verbose) {
          console.error(`[privacy-filter] Decoded response. Output length=${decodedOutput.length}.`);
        }

        audit.log({
          step: 'privacy-filter:decode',
          parent_step: 'privacy-filter:encode',
          output: '[privacy-filter] rehydration complete',
        });

        return { ...rawResult, output: decodedOutput };
      }

      return runAgent(agentOverride, userPrompt, { skills, verbose: opts.verbose });
    };

    let specialistResult = await runSpecialist();
    deliverable = specialistResult.output;

    let specialistRecord: AgentCallRecord = {
      agent: specialist.name,
      model: specialistResult.model,
      output: specialistResult.output,
      tokens: specialistResult.tokens,
    };
    agentCalls.push(specialistRecord);
    const specialistStepName = `specialist:${specialist.name}`;
    stepResults.push({
      stepName: specialistStepName,
      agentCallRecord: specialistRecord,
    });

    // Audit: log specialist call
    audit.log({
      step: specialistStepName,
      agent: specialist.name,
      model: specialistResult.model,
      prompt: userPrompt,
      output: specialistResult.output,
      parent_step: parentStep,
    });
    parentStep = specialistStepName;

    // -----------------------------------------------------------------------
    // Phase 3: Tests
    // -----------------------------------------------------------------------
    const testSuiteStep = workflow.pipeline.find(
      (p): p is { step: 'test'; suite: string[] } => p.step === 'test'
    );
    if (testSuiteStep) {
      for (const testName of testSuiteStep.suite) {
        const testConfig = loadTest(testName);

        const testResult = await runTest({ context, draft: deliverable, config: testConfig });
        testResults.push({ name: testName, result: testResult });

        // Audit: log test result
        audit.log({
          step: `test:${testName}`,
          parent_step: parentStep,
          test: { name: testName, result: testResult },
        });

        stepResults.push({
          stepName: `test:${testName}`,
          testName,
          testPassed: testResult.pass,
        });

        if (!testResult.pass) {
          const action = await handleTestFailure(testConfig, testResult, context, matterId);

          // Audit: log failure action
          audit.log({
            step: `test-failure-action:${testName}`,
            parent_step: `test:${testName}`,
            failure_action: action.action,
            failure_target: action.action === 'retry_with' ? action.model
              : action.action === 'escalate_to' ? action.target
              : action.agent,
          });

          if (action.action === 'retry_with') {
            // Re-run specialist with better model
            const retryModel = action.model;
            const retryResult = await runSpecialist(retryModel);
            deliverable = retryResult.output;

            specialistRecord = {
              agent: specialist.name,
              model: retryResult.model,
              output: retryResult.output,
              tokens: retryResult.tokens,
            };
            agentCalls.push(specialistRecord);
            const retryStepName = `specialist:${specialist.name}:retry`;
            stepResults.push({
              stepName: retryStepName,
              agentCallRecord: specialistRecord,
            });

            audit.log({
              step: retryStepName,
              agent: specialist.name,
              model: retryResult.model,
              prompt: userPrompt,
              output: retryResult.output,
              parent_step: `test-failure-action:${testName}`,
            });

            // Re-run the same test on the retried output
            const retryTestResult = await runTest({
              context,
              draft: deliverable,
              config: testConfig,
            });
            testResults.push({ name: `${testName}:retry`, result: retryTestResult });

            audit.log({
              step: `test:${testName}:retry`,
              parent_step: retryStepName,
              test: { name: `${testName}:retry`, result: retryTestResult },
            });

            stepResults.push({
              stepName: `test:${testName}:retry`,
              testName: `${testName}:retry`,
              testPassed: retryTestResult.pass,
            });

            if (!retryTestResult.pass) {
              // Retry also failed — escalate
              escalationReason = `Test '${testName}' failed after retry. ${retryTestResult.rationale}`;
              audit.log({
                step: `escalation:${testName}`,
                parent_step: `test:${testName}:retry`,
                failure_action: 'escalate_to',
                failure_target: 'human',
              });
              return buildReport({
                workflowName: workflow.name,
                userPrompt,
                steps: stepResults,
                agentCalls,
                deliverable,
                status: 'escalated',
                escalationOrError: escalationReason,
                testResults,
                guardrailResults,
                auditLogPath: audit.path,
              });
            }
          } else if (action.action === 'escalate_to') {
            escalationReason = `Test '${testName}' failed. ${testResult.rationale}`;
            return buildReport({
              workflowName: workflow.name,
              userPrompt,
              steps: stepResults,
              agentCalls,
              deliverable,
              status: 'escalated',
              escalationOrError: escalationReason,
              testResults,
              guardrailResults,
              auditLogPath: audit.path,
            });
          }
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

        const guardrailResult = await runGuardrail({
          context,
          draft: deliverable,
          config: guardrailConfig,
        });
        guardrailResults.push({ name: guardrailName, result: guardrailResult });

        // Audit: log guardrail result
        audit.log({
          step: `guardrail:${guardrailName}`,
          parent_step: parentStep,
          guardrail: { name: guardrailName, result: guardrailResult },
        });

        stepResults.push({
          stepName: `guardrail:${guardrailName}`,
          guardrailName,
          guardrailHit: guardrailResult.human_required,
          escalationReason: guardrailResult.human_required ? guardrailResult.reason : undefined,
        });

        if (guardrailResult.human_required) {
          await handleGuardrailHit(guardrailConfig, guardrailResult, context);
          escalationReason = guardrailResult.reason;

          audit.log({
            step: `escalation:guardrail:${guardrailName}`,
            parent_step: `guardrail:${guardrailName}`,
            failure_action: 'escalate_to',
            failure_target: 'human',
          });

          return buildReport({
            workflowName: workflow.name,
            userPrompt,
            steps: stepResults,
            agentCalls,
            deliverable,
            status: 'escalated',
            escalationOrError: escalationReason,
            testResults,
            guardrailResults,
            auditLogPath: audit.path,
          });
        }
      }
    }

    // -----------------------------------------------------------------------
    // All clear
    // -----------------------------------------------------------------------
    return buildReport({
      workflowName: workflow.name,
      userPrompt,
      steps: stepResults,
      agentCalls,
      deliverable,
      status: 'delivered',
      testResults,
      guardrailResults,
      auditLogPath: audit.path,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    // Determine which step was active when the error occurred
    const lastStep = stepResults[stepResults.length - 1];
    const stepLabel = lastStep ? lastStep.stepName : 'init';
    const tagged = `Pipeline failed at step ${stepLabel}: ${message}`;
    return buildReport({
      workflowName: workflow.name,
      userPrompt,
      steps: stepResults,
      agentCalls,
      deliverable,
      status: 'error',
      escalationOrError: tagged,
      testResults,
      guardrailResults,
      auditLogPath: audit.path,
    });
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

interface BuildReportArgs {
  workflowName: string;
  userPrompt: string;
  steps: RunStepResult[];
  agentCalls: AgentCallRecord[];
  deliverable: string;
  status: RunReport['status'];
  escalationOrError?: string;
  testResults: { name: string; result: TestResult }[];
  guardrailResults: { name: string; result: GuardrailResult }[];
  auditLogPath: string;
}

function buildReport(args: BuildReportArgs): RunReport {
  const report: RunReport = {
    workflow: args.workflowName,
    userPrompt: args.userPrompt,
    steps: args.steps,
    agentCalls: args.agentCalls,
    deliverable: args.deliverable,
    status: args.status,
    test_results: args.testResults,
    guardrail_results: args.guardrailResults,
    audit_log_path: args.auditLogPath,
  };
  if (args.status === 'escalated') report.escalationReason = args.escalationOrError;
  if (args.status === 'error') report.error = args.escalationOrError;
  return report;
}
