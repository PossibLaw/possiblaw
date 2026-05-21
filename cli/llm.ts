/**
 * PossibLaw v2 — LLM provider registry / call router.
 *
 * Dispatches `runAgent()` based on the `<provider>/<model>` prefix of
 * `agent.model`. Supported providers:
 *
 *   anthropic/<name>   — Anthropic SDK (requires ANTHROPIC_API_KEY)
 *   ollama/<name>      — Local Ollama daemon (falls back to offline if unreachable)
 *   claude-cli/<name>  — Shell out to local `claude -p` CLI (OAuth subscription auth)
 *   codex-cli/<name>   — Shell out to local `codex exec` CLI (OAuth subscription auth)
 *   (no prefix)        — Treated as anthropic/<model> for backwards compat
 *
 * Falls back to deterministic offline fixtures when ANTHROPIC_API_KEY is unset
 * (anthropic provider) or when Ollama is unreachable.
 *
 * CRITICAL safety rails for the *-cli providers (see paperclip/docs/agents-runtime.md):
 *  - `claude -p` child env MUST have ANTHROPIC_API_KEY unset — otherwise the CLI
 *    silently falls back to API-key billing instead of using the OAuth subscription.
 *  - Never pass `--bare` to claude (disables subscription auth).
 *  - codex exec emits banner/diagnostic info on stderr; only stdout is the
 *    model response.
 *  - 120s default timeout on both shell-outs.
 *  - Empty output (after stripping banners/whitespace) is rejected as an error.
 */
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Agent, Skill } from './types.js';
import { chat as ollamaChat, isOllamaAvailable } from './ollama.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ---------------------------------------------------------------------------
// Provider parsing
// ---------------------------------------------------------------------------

export type ProviderKind = 'anthropic' | 'ollama' | 'claude-cli' | 'codex-cli';

export function parseProvider(raw: string): { provider: ProviderKind; modelId: string } {
  if (raw.startsWith('ollama/')) {
    return { provider: 'ollama', modelId: raw.slice('ollama/'.length) };
  }
  if (raw.startsWith('claude-cli/')) {
    return { provider: 'claude-cli', modelId: raw.slice('claude-cli/'.length) };
  }
  if (raw.startsWith('codex-cli/')) {
    return { provider: 'codex-cli', modelId: raw.slice('codex-cli/'.length) };
  }
  // anthropic/ prefix or bare name
  return { provider: 'anthropic', modelId: raw.replace(/^anthropic\//, '') };
}

// ---------------------------------------------------------------------------
// Offline fixtures
// ---------------------------------------------------------------------------

/** Returns the appropriate chief-of-staff routing decision based on the prompt domain. */
function chiefOfStaffRoute(userPrompt: string): string {
  const lower = userPrompt.toLowerCase();
  if (lower.includes('invoice') || lower.includes('billing') || lower.includes('expense')) {
    return 'ROUTE_TO: finance-lead\nRationale: Finance matter — routing to Finance Lead.';
  }
  if (lower.includes('intake') || lower.includes('prospect') || lower.includes('pitch') || lower.includes('marketing')) {
    return 'ROUTE_TO: marketing-lead\nRationale: Marketing matter — routing to Marketing Lead.';
  }
  if (lower.includes('schedul') || lower.includes('calendar') || lower.includes('meeting')) {
    return 'ROUTE_TO: admin-lead\nRationale: Administrative scheduling matter — routing to Admin Lead.';
  }
  // Default: legal matter
  return 'ROUTE_TO: chief-counsel\nRationale: Legal matter — routing to Chief Counsel.';
}

const OFFLINE_FIXTURES: Record<string, string> = {
  'chief-counsel':
    'ROUTE_TO: commercial-lead\nRationale: Operator requests an NDA, which is a commercial matter.',
  'finance-lead':
    'ROUTE_TO: billing-prep\nRationale: Operator needs a draft invoice for a client matter; routing to billing-prep.',
  'admin-lead':
    'ROUTE_TO: calendar-coordinator\nRationale: Scheduling request — routing to calendar-coordinator.',
};

/** Returns the marketing-lead routing decision based on the prompt content. */
function marketingLeadRoute(userPrompt: string): string {
  const lower = userPrompt.toLowerCase();
  if (
    lower.includes('pitch') ||
    lower.includes('polish') ||
    lower.includes('deck') ||
    lower.includes('proposal')
  ) {
    return 'ROUTE_TO: pitch-polisher\nRationale: Pitch or proposal polishing request — routing to pitch-polisher.';
  }
  return 'ROUTE_TO: intake-form-drafter\nRationale: Operator needs a new client intake questionnaire; routing to intake-form-drafter.';
}

/** Returns the commercial-lead routing decision based on the prompt content. */
function commercialLeadRoute(userPrompt: string): string {
  const lower = userPrompt.toLowerCase();
  if (
    lower.includes('employee handbook') ||
    lower.includes('handbook section') ||
    lower.includes('pto policy') ||
    lower.includes('time off policy') ||
    lower.includes('employment policy')
  ) {
    return 'ROUTE_TO: employee-handbook-drafter\nRationale: Operator requests an employee handbook section; routing to employee-handbook-drafter.';
  }
  return 'ROUTE_TO: nda-drafter\nRationale: NDA draft is the nda-drafter\'s core competency.';
}

function loadFixtureFile(name: string): string {
  const fixturePath = join(__dirname, 'fixtures', name);
  return readFileSync(fixturePath, 'utf8');
}

function offlineFixture(agentName: string, userPrompt: string): string {
  // BAD_INPUT_DEMO: return a deliberately invalid draft for any specialist
  if (userPrompt.includes('BAD_INPUT_DEMO') && agentName === 'nda-drafter') {
    return '[INVALID DRAFT] xjq8wz lorem ipsum xjq8wz — this draft is intentionally incoherent for demo purposes.';
  }
  // Chief of Staff: route based on prompt content
  if (agentName === 'chief-of-staff') {
    return chiefOfStaffRoute(userPrompt);
  }
  // Commercial Lead: route based on prompt content (supports custom specialists)
  if (agentName === 'commercial-lead') {
    return commercialLeadRoute(userPrompt);
  }
  // Marketing Lead: route based on prompt content
  if (agentName === 'marketing-lead') {
    return marketingLeadRoute(userPrompt);
  }
  if (agentName in OFFLINE_FIXTURES) {
    return OFFLINE_FIXTURES[agentName];
  }
  // Specialist fixture files
  switch (agentName) {
    case 'nda-drafter':
      return loadFixtureFile('nda-fixture.md');
    case 'intake-form-drafter':
      return loadFixtureFile('intake-form-fixture.md');
    case 'pitch-polisher':
      return loadFixtureFile('pitch-polish-fixture.md');
    case 'billing-prep':
      return loadFixtureFile('billing-prep-fixture.md');
    case 'expense-categorizer':
      return loadFixtureFile('expense-categorizer-fixture.json');
    case 'calendar-coordinator':
      return loadFixtureFile('calendar-coordinator-fixture.md');
    case 'reconciler':
      return `## Reconciled draft

**Conflicts Check Notice:** Automated conflicts checking is not available. The operator must confirm no conflicts exist.

This reconciled non-disclosure agreement incorporates [agent-1]'s core confidentiality terms with [agent-2]'s freshness language addressing recent regulatory developments, and [agent-3]'s tighter scope restrictions limiting permitted purpose to a narrowly defined evaluation window.

## MUTUAL NON-DISCLOSURE AGREEMENT

*(Reconciled from 3 parallel drafts — see Reconciliation notes below)*

**PARTIES:** [PARTY A] and [PARTY B]
**EFFECTIVE DATE:** [EFFECTIVE DATE]
**PURPOSE:** Evaluation of a potential business relationship
**TERM:** 2 years from Effective Date
**GOVERNING LAW:** State of Delaware, USA

*[Full agreement clauses reconciled from all three drafts — human attorney review required before execution.]*

## Reconciliation notes

- **Draft 1 (temperature 0.2):** Contributed precise boilerplate clause structure and standard Delaware choice-of-law provision.
- **Draft 2 (temperature 0.7):** Contributed balanced mutual obligations and clearer definition of Confidential Information.
- **Draft 3 (temperature 1.0):** Contributed more expansive remedies clause and stronger injunctive relief language.
- **Disagreement:** Drafts 1 and 3 differed on the survival period after termination (1 year vs. 3 years); reconciler adopted the middle ground of 2 years consistent with Draft 2.

## Disclaimer
**PossibLaw Disclaimer:** This document was generated by an AI system and does not constitute legal advice. It has not been reviewed by a licensed attorney. The operator is the responsible professional and must review this draft before use. Do not sign or send this document without licensed lawyer review.`;

    case 'risk-spotter':
      return `## Worst-case scenarios
1. **Unlimited retention loophole** — Section 3 does not specify a destruction or return obligation after the permitted purpose concludes; the counterparty could retain Confidential Information indefinitely without breach.
2. **Oral disclosure gap** — The definition of Confidential Information does not require written confirmation within 10 days of oral disclosure; the counterparty could argue all verbal disclosures are unprotected.
3. **Affiliate carve-out exploitation** — "Affiliate" is undefined; a hostile acquirer who purchases the counterparty post-signing could claim affiliate status and receive full access.
4. **Residuals clause absence** — No residuals clause is present, but its absence may be exploited in some jurisdictions where courts have implied one from course of dealing.
5. **Injunctive relief waiver risk** — The dispute resolution clause mandates arbitration without expressly reserving the right to seek emergency injunctive relief; the counterparty could argue this waives preliminary injunction rights.

## Missing clauses
- **Return/destruction obligation** — Add: "Upon request or termination, Receiving Party shall promptly return or certify destruction of all Confidential Information within 10 business days."
- **Affiliate definition** — Add: "'Affiliate' means any entity directly controlling, controlled by, or under common control with a party as of the Effective Date only."
- **Residuals exclusion** — Add: "Receiving Party's obligations extend to residual knowledge retained in unaided human memory, which must not be deliberately memorized to circumvent this Agreement."

## Ambiguous language
- "reasonable efforts" — ambiguous because it sets no objective standard; suggested fix: replace with "the same degree of care as it uses to protect its own confidential information, but not less than reasonable care."

## Risk rating
Overall adversarial risk: HIGH — Multiple structural gaps create significant exposure for the disclosing party.

## Disclaimer
**PossibLaw Disclaimer:** This adversarial analysis was generated by an AI system and does not constitute legal advice. Review all identified risks with a licensed attorney before executing any agreement.`;

    case 'debate-judge':
      return `## Verdict

After reviewing all rounds of debate between the participants, the panel finds that the draft agreement presents significant risks that must be addressed before execution.

The nda-drafter's core structure is sound — the mutual obligations are balanced and the Delaware choice-of-law provision is appropriate. However, the risk-spotter has correctly identified that the absence of a return/destruction obligation and the undefined "Affiliate" term create material vulnerabilities.

On the contested survival period: the panel rules in favor of a 3-year post-termination survival period given the sensitivity of the disclosed information and the commercial context described.

The panel adopts the risk-spotter's recommendation on injunctive relief and directs that the arbitration clause explicitly preserve emergency injunctive relief in any court of competent jurisdiction.

## Dissent

The strongest counter-argument not adopted was the risk-spotter's position that oral disclosures should be entirely excluded absent written confirmation. The panel rejected this because the commercial context suggests parties will routinely exchange information verbally during due diligence, and a blanket exclusion would leave the disclosing party unprotected. Instead, a 10-business-day written confirmation requirement (as suggested) is the appropriate middle ground.

## Risks

- **Affiliate definition gap** — Must be added before execution; potential post-acquisition exposure is the highest-severity risk.
- **Return/destruction obligation absent** — Draft must be amended; creates indefinite retention risk.
- **Arbitration clause** — Must explicitly preserve emergency injunctive relief; currently ambiguous.
- **Oral disclosure protection** — Consider adding a 10-business-day written confirmation requirement.
- **Remedies clause** — Injunctive relief language should be strengthened; current formulation may be insufficient in some jurisdictions.

## Disclaimer
**PossibLaw Disclaimer:** This verdict was generated by an AI system and does not constitute legal advice. The operator must review all findings with a licensed attorney before acting.`;

    default:
      // Dynamic stub: works for any custom agent added via `team add`
      return `[OFFLINE STUB FOR ${agentName}] — fill in .possiblaw/custom-agents/${agentName}.md to get real output.`;
  }
}

// ---------------------------------------------------------------------------
// CLI shell-out helpers (claude-cli, codex-cli)
// ---------------------------------------------------------------------------

const DEFAULT_CLI_TIMEOUT_MS = 120_000;

interface SpawnResult {
  stdout: string;
  stderr: string;
  code: number | null;
}

/**
 * Spawn a child process and stream `stdinPayload` to its stdin.
 * Captures stdout/stderr. Enforces a hard timeout via AbortController.
 */
function spawnWithStdin(
  command: string,
  args: string[],
  stdinPayload: string,
  opts: { env: NodeJS.ProcessEnv; timeoutMs: number }
): Promise<SpawnResult> {
  return new Promise((resolve, reject) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), opts.timeoutMs);

    let stdout = '';
    let stderr = '';
    let settled = false;

    const child = spawn(command, args, {
      env: opts.env,
      stdio: ['pipe', 'pipe', 'pipe'],
      signal: controller.signal,
    });

    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8');
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
    });

    child.on('error', (err: NodeJS.ErrnoException) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (err.code === 'ABORT_ERR' || controller.signal.aborted) {
        reject(new Error(`Process '${command}' timed out after ${opts.timeoutMs}ms`));
        return;
      }
      if (err.code === 'ENOENT') {
        reject(new Error(
          `'${command}' not found on PATH. Install it and ensure it is on your PATH before using this provider.`
        ));
        return;
      }
      reject(err);
    });

    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (controller.signal.aborted) {
        reject(new Error(`Process '${command}' timed out after ${opts.timeoutMs}ms`));
        return;
      }
      resolve({ stdout, stderr, code });
    });

    // Write the prompt to stdin and close it so the child knows input is done.
    child.stdin.on('error', () => {
      // The child may close stdin early; swallow EPIPE-style errors.
    });
    child.stdin.end(stdinPayload, 'utf8');
  });
}

/**
 * Strip Claude Code banner/disclaimer lines from the start of stdout.
 * The CLI may prefix output with banner/disclaimer text before the actual model
 * response. We strip any leading blank lines and well-known banner-like prefixes.
 */
function stripClaudeBanner(raw: string): string {
  // First, trim leading whitespace/newlines.
  let text = raw.replace(/^\s+/, '');
  // Drop any leading lines that look like banner/disclaimer text. Heuristic:
  // banner lines are short, all-caps-ish, or begin with conventional markers.
  const bannerPatterns: RegExp[] = [
    /^Welcome to Claude Code.*$/im,
    /^Claude Code v[0-9].*$/im,
    /^\[.*disclaimer.*\].*$/im,
    /^Anthropic.*$/im,
  ];
  for (const re of bannerPatterns) {
    text = text.replace(re, '').replace(/^\s+/, '');
  }
  return text.trim();
}

interface CliCallOpts {
  systemPrompt: string;
  userPrompt: string;
  modelId: string;
  timeoutMs?: number;
  verbose?: boolean;
  /**
   * For claude-cli only: pass `--max-budget-usd <amount>` to bound subscription
   * spend for this single invocation. Ignored by codex-cli.
   */
  maxBudgetUsd?: number;
}

/**
 * Invoke `claude -p --model <name> --system-prompt <prompt> --output-format text`,
 * passing the user prompt via stdin. Returns the model response text.
 *
 * Strips ANTHROPIC_API_KEY from the child env so the CLI uses subscription auth.
 * Throws on empty output (after stripping) or non-zero exit.
 */
async function callClaudeCli(opts: CliCallOpts): Promise<string> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_CLI_TIMEOUT_MS;

  // CRITICAL: unset ANTHROPIC_API_KEY in child env, otherwise the CLI silently
  // falls back to API-key billing instead of using the OAuth subscription.
  const childEnv = { ...process.env };
  delete childEnv['ANTHROPIC_API_KEY'];

  const args = [
    '-p',
    '--model', opts.modelId,
    '--system-prompt', opts.systemPrompt,
    '--output-format', 'text',
  ];

  // Thread eval --budget through to claude's own per-invocation cap so runaway
  // spend is bounded at the provider layer. Only included when the caller asked
  // for it; absent flag means no provider-level cap.
  if (typeof opts.maxBudgetUsd === 'number' && Number.isFinite(opts.maxBudgetUsd) && opts.maxBudgetUsd > 0) {
    args.push('--max-budget-usd', String(opts.maxBudgetUsd));
  }

  if (opts.verbose) {
    console.error(`[verbose] claude-cli spawn: claude ${args.map((a) => (a.includes(' ') ? `"${a.slice(0, 40)}..."` : a)).join(' ')}`);
  }

  let result: SpawnResult;
  try {
    result = await spawnWithStdin('claude', args, opts.userPrompt, {
      env: childEnv,
      timeoutMs,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`claude-cli invocation failed: ${message}`);
  }

  if (result.code !== 0) {
    throw new Error(
      `claude-cli exited with code ${result.code}: ${result.stderr.trim() || result.stdout.trim() || '(no output)'}`
    );
  }

  const cleaned = stripClaudeBanner(result.stdout);
  if (cleaned.length === 0) {
    throw new Error('claude-cli produced empty output (after stripping banner lines).');
  }
  return cleaned;
}

/**
 * Invoke `codex exec --skip-git-repo-check -s read-only -m <model>`,
 * passing the user prompt via stdin. Returns stdout trimmed.
 *
 * stderr (banner/diagnostic info) is captured but discarded.
 * Throws on empty stdout or non-zero exit.
 */
async function callCodexCli(opts: CliCallOpts): Promise<string> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_CLI_TIMEOUT_MS;

  // codex inherits the parent env; it uses its own OAuth credentials.
  const childEnv = { ...process.env };

  // codex exec does not have a separate --system-prompt flag in the relevant
  // version. Prepend system prompt to user prompt with a clear separator so
  // the model sees both. (System role guidance is still surfaced via prompt
  // structure.)
  const composedPrompt =
    `${opts.systemPrompt}\n\n---\n\n${opts.userPrompt}`;

  const args = [
    'exec',
    '--skip-git-repo-check',
    '-s', 'read-only',
    '-m', opts.modelId,
  ];

  if (opts.verbose) {
    console.error(`[verbose] codex-cli spawn: codex ${args.join(' ')}`);
  }

  let result: SpawnResult;
  try {
    result = await spawnWithStdin('codex', args, composedPrompt, {
      env: childEnv,
      timeoutMs,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`codex-cli invocation failed: ${message}`);
  }

  if (result.code !== 0) {
    throw new Error(
      `codex-cli exited with code ${result.code}: ${result.stderr.trim() || result.stdout.trim() || '(no output)'}`
    );
  }

  // stderr is banner/diagnostic info — discard. stdout is the actual response.
  const cleaned = result.stdout.trim();
  if (cleaned.length === 0) {
    throw new Error('codex-cli produced empty stdout.');
  }
  return cleaned;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface AgentRunResult {
  output: string;
  model: string;
  tokens: { in: number; out: number } | null;
}

export interface RunAgentOpts {
  skills?: Skill[];
  verbose?: boolean;
  /** Temperature override (0–1). Default: model default (unset). */
  temperature?: number;
  /**
   * For `claude-cli/*` provider only: pass `--max-budget-usd <amount>` to the
   * spawned `claude -p` invocation. Ignored by other providers.
   *
   * The Claude CLI enforces this as a hard cap on subscription spend for the
   * single invocation. Eval runs thread their `--budget` flag through here so
   * runaway spend is bounded at the provider layer.
   */
  maxBudgetUsd?: number;
}

export async function runAgent(
  agent: Agent,
  userPrompt: string,
  opts: RunAgentOpts = {}
): Promise<AgentRunResult> {
  const { provider, modelId } = parseProvider(agent.model);

  // Build system prompt
  let systemPrompt = agent.body.trim();
  if (opts.skills && opts.skills.length > 0) {
    const skillsSection = opts.skills
      .map((s) => `### ${s.name}\n\n${s.body.trim()}`)
      .join('\n\n');
    systemPrompt += `\n\n## Available Skills\n\n${skillsSection}`;
  }

  if (opts.verbose) {
    console.error(`[verbose] system prompt for ${agent.name}:\n${systemPrompt}\n`);
    console.error(`[verbose] user prompt: ${userPrompt}\n`);
  }

  // ---------------------------------------------------------------------------
  // Ollama provider
  // ---------------------------------------------------------------------------
  if (provider === 'ollama') {
    // Check if Ollama is reachable
    const available = await isOllamaAvailable();
    if (!available) {
      if (opts.verbose) {
        console.error(`[verbose] Ollama unreachable — falling back to offline fixture for ${agent.name}`);
      }
      const output = offlineFixture(agent.name, userPrompt);
      return { output, model: `ollama/${modelId} (offline)`, tokens: null };
    }

    try {
      const output = await ollamaChat(systemPrompt, userPrompt, { model: modelId });
      if (opts.verbose) {
        console.error(`[verbose] Ollama response for ${agent.name}:\n${output}\n`);
      }
      // Ollama does not expose token counts in our current client
      return { output, model: `ollama/${modelId}`, tokens: null };
    } catch {
      // Fallback to offline fixture on Ollama error
      if (opts.verbose) {
        console.error(`[verbose] Ollama error — falling back to offline fixture for ${agent.name}`);
      }
      const output = offlineFixture(agent.name, userPrompt);
      return { output, model: `ollama/${modelId} (offline)`, tokens: null };
    }
  }

  // ---------------------------------------------------------------------------
  // claude-cli provider (subscription auth via local `claude` CLI)
  // ---------------------------------------------------------------------------
  if (provider === 'claude-cli') {
    const output = await callClaudeCli({
      systemPrompt,
      userPrompt,
      modelId,
      verbose: opts.verbose,
      maxBudgetUsd: opts.maxBudgetUsd,
    });
    if (opts.verbose) {
      console.error(`[verbose] claude-cli response for ${agent.name}:\n${output}\n`);
    }
    // Subscription auth — no per-call token counts exposed by the CLI.
    return { output, model: `claude-cli/${modelId}`, tokens: null };
  }

  // ---------------------------------------------------------------------------
  // codex-cli provider (subscription auth via local `codex` CLI)
  // ---------------------------------------------------------------------------
  if (provider === 'codex-cli') {
    const output = await callCodexCli({
      systemPrompt,
      userPrompt,
      modelId,
      verbose: opts.verbose,
    });
    if (opts.verbose) {
      console.error(`[verbose] codex-cli response for ${agent.name}:\n${output}\n`);
    }
    return { output, model: `codex-cli/${modelId}`, tokens: null };
  }

  // ---------------------------------------------------------------------------
  // Anthropic provider (default)
  // ---------------------------------------------------------------------------

  // Offline mode: no API key present
  if (!process.env['ANTHROPIC_API_KEY']) {
    const output = offlineFixture(agent.name, userPrompt);
    if (opts.verbose) {
      console.error(`[verbose] OFFLINE response for ${agent.name}:\n${output}\n`);
    }
    return { output, model: `${modelId} (offline)`, tokens: null };
  }

  // Live mode
  try {
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    const client = new Anthropic();
    const res = await client.messages.create({
      model: modelId,
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
      ...(opts.temperature !== undefined ? { temperature: opts.temperature } : {}),
    });

    const output = res.content
      .filter((block): block is { type: 'text'; text: string } => block.type === 'text')
      .map((block) => block.text)
      .join('');

    if (opts.verbose) {
      console.error(`[verbose] live response for ${agent.name}:\n${output}\n`);
    }

    return {
      output,
      model: modelId,
      tokens: { in: res.usage.input_tokens, out: res.usage.output_tokens },
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Anthropic API call for agent ${agent.name} failed: ${message}`);
  }
}
