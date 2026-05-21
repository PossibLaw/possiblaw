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
import { costForCall } from './pricing.js';
import type { CostBreakdown, CostByCall } from './pricing.js';
import type {
  Workflow,
  Agent,
  RunReport,
  RunStepResult,
  AgentCallRecord,
  RunContext,
  TestResult,
  GuardrailResult,
  BranchRecord,
  BranchOutput,
  DebateRound,
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
 * agent model is a cloud model. Cloud models include:
 *   - anthropic/* (direct API)
 *   - bare claude-* (back-compat for anthropic with no prefix)
 *   - claude-cli/* (subscription routes through Anthropic's cloud)
 *   - codex-cli/* (subscription routes through OpenAI's cloud)
 * ollama/* is *not* cloud (runs locally).
 */
function shouldApplyPrivacyFilter(
  profile: 'always' | 'cloud-only' | 'off',
  agentModel: string
): boolean {
  if (profile === 'off') return false;
  if (profile === 'always') return true;
  // cloud-only: apply when the model is a cloud model
  if (agentModel.startsWith('ollama/')) return false;
  if (agentModel.startsWith('claude-cli/')) return true;
  if (agentModel.startsWith('codex-cli/')) return true;
  if (agentModel.startsWith('anthropic/')) return true;
  const normalized = agentModel.toLowerCase();
  return normalized.startsWith('claude');
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
  const branchRecords: BranchRecord[] = [];
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
          branches: branchRecords,
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
    // Phase 2: Specialist (or parallel/debate override)
    // -----------------------------------------------------------------------
    const specialist: Agent = loadAgent(specialistName);
    const skills = specialist.skills.map((skillName) => loadSkill(skillName));

    const runOneAgent = async (
      agentToRun: Agent,
      promptText: string,
      agentSkills: ReturnType<typeof loadSkill>[],
      temperature?: number
    ) => {
      const effectiveModel = agentToRun.model;
      const applyFilter = shouldApplyPrivacyFilter(privacyProfile, effectiveModel);

      if (applyFilter) {
        const encoded = await encode(promptText, matterId);
        if (opts.verbose) {
          console.error(
            `[privacy-filter] Encoded prompt (mode=${encoded.mode ?? 'llm'}). ` +
            `Key store has ${Object.keys(encoded.key_store).length} entries.`
          );
        }
        audit.log({
          step: 'privacy-filter:encode',
          parent_step: parentStep,
          prompt: `[privacy-filter mode=${encoded.mode ?? 'llm'}] masked_text_length=${encoded.masked_text.length}`,
          output: JSON.stringify(Object.keys(encoded.key_store)),
        });
        const rawResult = await runAgent(agentToRun, encoded.masked_text, {
          skills: agentSkills,
          verbose: opts.verbose,
          temperature,
        });
        let decodedOutput: string;
        try {
          decodedOutput = await decode(rawResult.output, encoded.key_store);
        } catch (pfErr: unknown) {
          if (pfErr instanceof PrivacyFilterError) throw pfErr;
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

      return runAgent(agentToRun, promptText, {
        skills: agentSkills,
        verbose: opts.verbose,
        temperature,
      });
    };

    // Convenience wrapper matching the old signature (no temperature, no custom agent/prompt)
    const runSpecialist = async (model?: string) => {
      const agentOverride: Agent = model ? { ...specialist, model } : specialist;
      return runOneAgent(agentOverride, userPrompt, skills);
    };

    // -----------------------------------------------------------------------
    // Detect Sprint 8 step kinds in the pipeline
    // -----------------------------------------------------------------------
    const parallelStep = workflow.pipeline.find(
      (p): p is { step: 'parallel'; count: number; temperatures: number[]; resolved_by: string } =>
        p.step === 'parallel'
    );
    const reconcileStep = workflow.pipeline.find(
      (p): p is { step: 'reconcile'; agent: string } => p.step === 'reconcile'
    );
    const debateStep = workflow.pipeline.find(
      (p): p is { step: 'debate'; participants: string[]; rounds: number; judge: string } =>
        p.step === 'debate'
    );

    if (debateStep) {
      // -----------------------------------------------------------------------
      // Phase 2-debate: Multi-round debate
      // -----------------------------------------------------------------------
      const participants = debateStep.participants;
      const numRounds = debateStep.rounds ?? 3;
      const debateRounds: DebateRound[] = [];

      // Each round: build positions map
      let previousPositions: Record<string, string> = {};

      for (let round = 1; round <= numRounds; round++) {
        const roundPositions: Record<string, string> = {};

        const roundResults = await Promise.all(
          participants.map(async (participantName) => {
            const participantAgent = loadAgent(participantName);
            const participantSkills = participantAgent.skills.map((s) => loadSkill(s));

            let debatePrompt: string;
            if (round === 1) {
              debatePrompt = userPrompt;
            } else {
              // Build context from previous round positions
              const otherPositions = participants
                .filter((p) => p !== participantName)
                .map((p) => `### Position from ${p}:\n${previousPositions[p] ?? '(no position)'}`)
                .join('\n\n');
              debatePrompt =
                `${userPrompt}\n\n---\n\n## Previous round positions (round ${round - 1}):\n\n${otherPositions}\n\n---\n\nUpdate your position in light of the above.`;
            }

            const result = await runOneAgent(participantAgent, debatePrompt, participantSkills);
            return { participantName, result };
          })
        );

        for (const { participantName, result } of roundResults) {
          roundPositions[participantName] = result.output;
          const rec: AgentCallRecord = {
            agent: participantName,
            model: result.model,
            output: result.output,
            tokens: result.tokens,
          };
          agentCalls.push(rec);
          const stepName = `debate:round${round}:${participantName}`;
          stepResults.push({ stepName, agentCallRecord: rec });
          audit.log({
            step: stepName,
            agent: participantName,
            model: result.model,
            prompt: userPrompt,
            output: result.output,
            parent_step: parentStep,
          });
        }

        debateRounds.push({ round, positions: roundPositions });
        previousPositions = roundPositions;
        parentStep = `debate:round${round}:${participants[participants.length - 1]}`;
      }

      // Judge synthesizes final verdict
      const judgeAgent = loadAgent(debateStep.judge);
      const judgeSkills = judgeAgent.skills.map((s) => loadSkill(s));
      const transcriptText = debateRounds
        .map((r) => {
          const positionsText = Object.entries(r.positions)
            .map(([agent, pos]) => `#### ${agent}:\n${pos}`)
            .join('\n\n');
          return `## Round ${r.round}\n\n${positionsText}`;
        })
        .join('\n\n');

      const judgePrompt = `${userPrompt}\n\n---\n\n## Full debate transcript:\n\n${transcriptText}\n\n---\n\nWrite your verdict.`;
      const judgeResult = await runOneAgent(judgeAgent, judgePrompt, judgeSkills);
      deliverable = judgeResult.output;

      const judgeRecord: AgentCallRecord = {
        agent: judgeAgent.name,
        model: judgeResult.model,
        output: judgeResult.output,
        tokens: judgeResult.tokens,
      };
      agentCalls.push(judgeRecord);
      const judgeStepName = `debate:judge:${judgeAgent.name}`;
      stepResults.push({ stepName: judgeStepName, agentCallRecord: judgeRecord });
      audit.log({
        step: judgeStepName,
        agent: judgeAgent.name,
        model: judgeResult.model,
        prompt: judgePrompt,
        output: judgeResult.output,
        parent_step: parentStep,
      });
      parentStep = judgeStepName;

      const branchRecord: BranchRecord = {
        kind: 'debate',
        rounds: debateRounds,
        verdict: judgeResult.output,
      };
      branchRecords.push(branchRecord);
      stepResults[stepResults.length - 1].branchRecord = branchRecord;

    } else if (parallelStep) {
      // -----------------------------------------------------------------------
      // Phase 2-parallel: Run specialist N times in parallel at diverse temperatures
      // -----------------------------------------------------------------------
      const count = parallelStep.count ?? 3;
      const temperatures = parallelStep.temperatures ?? [0.2, 0.7, 1.0];

      const branchOutputs: BranchOutput[] = [];

      const parallelResults = await Promise.all(
        Array.from({ length: count }, (_, i) => {
          const temp = temperatures[i] ?? temperatures[temperatures.length - 1];
          return runOneAgent(specialist, userPrompt, skills, temp).then((result) => ({
            index: i,
            temperature: temp,
            result,
          }));
        })
      );

      for (const { index, temperature, result } of parallelResults) {
        branchOutputs.push({ agent: specialist.name, temperature, output: result.output });
        const rec: AgentCallRecord = {
          agent: specialist.name,
          model: result.model,
          output: result.output,
          tokens: result.tokens,
        };
        agentCalls.push(rec);
        const stepName = `parallel:${specialist.name}:branch${index + 1}`;
        stepResults.push({ stepName, agentCallRecord: rec });
        audit.log({
          step: stepName,
          agent: specialist.name,
          model: result.model,
          prompt: userPrompt,
          output: result.output,
          parent_step: parentStep,
        });
      }
      parentStep = `parallel:${specialist.name}:branch${count}`;

      // Use the first branch as deliverable until reconcile step runs
      deliverable = parallelResults[0].result.output;

      const parallelBranchRecord: BranchRecord = {
        kind: 'parallel',
        branches: branchOutputs,
      };
      branchRecords.push(parallelBranchRecord);
      stepResults[stepResults.length - 1].branchRecord = parallelBranchRecord;

      // -----------------------------------------------------------------------
      // Phase 2-reconcile: Merge parallel outputs
      // -----------------------------------------------------------------------
      if (reconcileStep) {
        const reconcilerAgent = loadAgent(reconcileStep.agent);
        const reconcilerSkills = reconcilerAgent.skills.map((s) => loadSkill(s));

        const labeledBlocks = branchOutputs
          .map((b, i) => `### Output from ${b.agent} (branch ${i + 1}, temperature ${b.temperature}):\n${b.output}`)
          .join('\n\n');

        const reconcilePrompt =
          `${userPrompt}\n\n---\n\n## Parallel specialist outputs to reconcile:\n\n${labeledBlocks}\n\n---\n\nSynthesize into a single merged deliverable.`;

        const reconcileResult = await runOneAgent(reconcilerAgent, reconcilePrompt, reconcilerSkills);
        deliverable = reconcileResult.output;
        parallelBranchRecord.verdict = reconcileResult.output;

        const reconcileRecord: AgentCallRecord = {
          agent: reconcilerAgent.name,
          model: reconcileResult.model,
          output: reconcileResult.output,
          tokens: reconcileResult.tokens,
        };
        agentCalls.push(reconcileRecord);
        const reconcileStepName = `reconcile:${reconcilerAgent.name}`;
        stepResults.push({ stepName: reconcileStepName, agentCallRecord: reconcileRecord });
        audit.log({
          step: reconcileStepName,
          agent: reconcilerAgent.name,
          model: reconcileResult.model,
          prompt: reconcilePrompt,
          output: reconcileResult.output,
          parent_step: parentStep,
        });
        parentStep = reconcileStepName;
      }

    } else {
      // -----------------------------------------------------------------------
      // Phase 2-standard: Single specialist (existing behavior)
      // -----------------------------------------------------------------------
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

    }

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
            // Re-run specialist with better model (only for standard single-specialist path)
            const retryModel = action.model;
            const retryResult = await runSpecialist(retryModel);
            deliverable = retryResult.output;

            const retryRecord: AgentCallRecord = {
              agent: specialist.name,
              model: retryResult.model,
              output: retryResult.output,
              tokens: retryResult.tokens,
            };
            agentCalls.push(retryRecord);
            const retryStepName = `specialist:${specialist.name}:retry`;
            stepResults.push({
              stepName: retryStepName,
              agentCallRecord: retryRecord,
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
                branches: branchRecords,
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
              branches: branchRecords,
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
            branches: branchRecords,
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
      branches: branchRecords,
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
      branches: branchRecords,
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
  branches?: BranchRecord[];
}

function computeCost(steps: RunStepResult[], agentCalls: AgentCallRecord[]): CostBreakdown {
  const by_call: CostByCall[] = [];
  let routing = 0;
  let specialist = 0;
  const tests = 0;
  const guardrails = 0;

  const PRICING_NOTE = 'Pricing snapshot 2026-05-20. Update cli/pricing.ts to refresh.';
  const allOffline = agentCalls.every((c) => c.model.includes('(offline)'));
  const hasSubscription = agentCalls.some(
    (c) => c.model.startsWith('claude-cli/') || c.model.startsWith('codex-cli/')
  );

  for (const step of steps) {
    const rec = step.agentCallRecord;
    if (!rec) continue;

    const inTokens = rec.tokens?.in ?? 0;
    const outTokens = rec.tokens?.out ?? 0;
    const cost = costForCall(rec.model, inTokens, outTokens);
    const entry: CostByCall = { agent: rec.agent, model: rec.model, input: inTokens, output: outTokens, cost };

    // Classify by stepName prefix
    if (step.stepName.startsWith('route:')) {
      routing += cost;
    } else {
      // specialist: (including :retry), and any other agent-backed steps
      specialist += cost;
    }
    by_call.push(entry);
  }

  // Tests and guardrails are rule-based stubs in current sprint — cost is $0

  const total = routing + specialist + tests + guardrails;
  const notes: string[] = [PRICING_NOTE];
  if (allOffline) {
    notes.push('(offline — model costs not incurred)');
  }
  if (hasSubscription) {
    notes.push('Rows marked "subscription" are billed via your claude/codex CLI subscription, not per-call.');
  }

  return { total, by_phase: { routing, specialist, tests, guardrails }, by_call, notes };
}

function buildReport(args: BuildReportArgs): RunReport {
  const cost = computeCost(args.steps, args.agentCalls);
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
    cost,
  };
  if (args.status === 'escalated') report.escalationReason = args.escalationOrError;
  if (args.status === 'error') report.error = args.escalationOrError;
  if (args.branches && args.branches.length > 0) report.branches = args.branches;
  return report;
}
