// eval-harness/src/model-client/index.ts
import * as claudeDriver from "./drivers/claude.ts";
import * as codexDriver from "./drivers/codex.ts";
import * as geminiDriver from "./drivers/gemini.ts";
import * as opencodeDriver from "./drivers/opencode.ts";
import type { ModelClient, ModelResult, ResolvedModel } from "./types.ts";

type DriverFn = (prompt: string, model: ResolvedModel) => Promise<ModelResult>;

const DRIVERS: Record<string, DriverFn> = {
  claude_local: claudeDriver.run,
  codex_local: codexDriver.run,
  gemini_local: geminiDriver.run,
  opencode_local: opencodeDriver.run,
};

export function driverFor(adapterType: string): DriverFn {
  const driver = DRIVERS[adapterType];
  if (!driver) {
    throw new Error(`Unknown adapter type: ${adapterType}. Known: ${Object.keys(DRIVERS).join(", ")}`);
  }
  return driver;
}

export function createModelClient(): ModelClient {
  return {
    run(prompt: string, model: ResolvedModel): Promise<ModelResult> {
      return driverFor(model.adapterType)(prompt, model);
    },
  };
}

export type { ModelClient, ModelResult, ResolvedModel };
