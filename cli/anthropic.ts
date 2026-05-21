/**
 * PossibLaw v2 — Backwards-compatibility shim.
 *
 * The provider-dispatching `runAgent` lives in `cli/llm.ts`. This file
 * re-exports the public surface so existing imports (`from './anthropic.js'`)
 * continue to work without modification.
 */
export { runAgent } from './llm.js';
export type { AgentRunResult, RunAgentOpts } from './llm.js';
