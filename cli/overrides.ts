/**
 * PossibLaw v2 — Per-operator agent model overrides.
 * Reads from <repo>/.possiblaw/overrides.yaml (repo-local, gitignored).
 * Falls back to ~/.possiblaw/overrides.yaml if repo-local is absent.
 *
 * Schema:
 *   overrides:
 *     nda-drafter:
 *       model: anthropic/claude-haiku-4-5
 *     expense-categorizer:
 *       model: ollama/llama3.1:8b
 */

import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import yaml from 'js-yaml';
import { REPO_ROOT } from './loader.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AgentOverride {
  model: string;
}

interface OverridesFile {
  overrides?: Record<string, AgentOverride>;
}

// ---------------------------------------------------------------------------
// File resolution
// ---------------------------------------------------------------------------

function resolveOverridesPath(): string | null {
  const repoLocal = join(REPO_ROOT, '.possiblaw', 'overrides.yaml');
  if (existsSync(repoLocal)) return repoLocal;

  const homeLocal = join(homedir(), '.possiblaw', 'overrides.yaml');
  if (existsSync(homeLocal)) return homeLocal;

  return null;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Load the overrides map. Returns an empty record if no file is present.
 */
export function loadOverrides(): Record<string, AgentOverride> {
  const filePath = resolveOverridesPath();
  if (!filePath) return {};

  try {
    const raw = readFileSync(filePath, 'utf8');
    const parsed = yaml.load(raw) as OverridesFile | null;
    return parsed?.overrides ?? {};
  } catch {
    return {};
  }
}

/**
 * Apply any override for `agentName` to the given model string.
 * Logs the change to stderr if an override is applied.
 */
export function applyOverride(agentName: string, model: string): string {
  const overrides = loadOverrides();
  const override = overrides[agentName];
  if (!override) return model;

  console.error(
    `[override] agent.model overridden: ${model} → ${override.model} (agent: ${agentName})`
  );
  return override.model;
}

/**
 * Write a model override for `agentName` to the repo-local overrides file.
 * Creates the .possiblaw/ directory if needed.
 */
export function writeOverride(agentName: string, model: string): void {
  const dir = join(REPO_ROOT, '.possiblaw');
  const filePath = join(dir, 'overrides.yaml');

  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  let existing: Record<string, AgentOverride> = {};
  if (existsSync(filePath)) {
    try {
      const raw = readFileSync(filePath, 'utf8');
      const parsed = yaml.load(raw) as OverridesFile | null;
      existing = parsed?.overrides ?? {};
    } catch {
      existing = {};
    }
  }

  existing[agentName] = { model };

  const content = yaml.dump({ overrides: existing }, { indent: 2 });
  writeFileSync(filePath, content, 'utf8');
}

/**
 * Get the effective model for an agent (after override, if any).
 */
export function getEffectiveModel(agentName: string, baseModel: string): string {
  const overrides = loadOverrides();
  return overrides[agentName]?.model ?? baseModel;
}
