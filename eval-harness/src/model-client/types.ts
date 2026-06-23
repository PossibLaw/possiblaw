// eval-harness/src/model-client/types.ts
import type { ResolvedModel } from "../variants.ts";
export type ModelResult =
  | { ok: true; output: string; costUsd: number; ms: number }
  | { ok: false; skipped: true; reason: string };
export interface ModelClient { run(prompt: string, model: ResolvedModel): Promise<ModelResult>; }
export type { ResolvedModel };
