// eval-harness/src/model-client/mock.ts
import type { ModelClient, ModelResult, ResolvedModel } from "./types.ts";

export class MockModelClient implements ModelClient {
  constructor(private readonly outputs: Record<string, string>) {}

  async run(_prompt: string, model: ResolvedModel): Promise<ModelResult> {
    const output = this.outputs[model.adapterType] ?? "";
    return { ok: true, output, costUsd: 0, ms: 0 };
  }
}
