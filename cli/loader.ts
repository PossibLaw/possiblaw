/**
 * PossibLaw v2 — Layer file loader
 * Resolves paths relative to the repo root (found by walking up from this
 * file looking for package.json with name "possiblaw").
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import matter from 'gray-matter';
import yaml from 'js-yaml';
import type { Agent, Workflow, Template, TestConfig, GuardrailConfig, Skill } from './types.js';
import { getEffectiveModel } from './overrides.js';
import { applyRosterOverrides } from './template-overrides.js';

// ---------------------------------------------------------------------------
// Repo root discovery
// ---------------------------------------------------------------------------

function findRepoRoot(startDir: string): string {
  let dir = startDir;
  while (true) {
    const pkgPath = join(dir, 'package.json');
    if (existsSync(pkgPath)) {
      const raw = JSON.parse(readFileSync(pkgPath, 'utf8')) as { name?: string };
      if (raw.name === 'possiblaw') {
        return dir;
      }
    }
    const parent = dirname(dir);
    if (parent === dir) {
      throw new Error('Could not find possiblaw repo root (no package.json with name "possiblaw" found).');
    }
    dir = parent;
  }
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
export const REPO_ROOT = findRepoRoot(__dirname);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Recursively find all files under `dir` matching `predicate`. */
function findFiles(dir: string, predicate: (path: string) => boolean): string[] {
  if (!existsSync(dir)) return [];
  const results: string[] = [];
  function walk(current: string): void {
    for (const entry of readdirSync(current)) {
      const full = join(current, entry);
      const stat = statSync(full);
      if (stat.isDirectory()) {
        walk(full);
      } else if (predicate(full)) {
        results.push(full);
      }
    }
  }
  walk(dir);
  return results;
}

function parseYaml(filePath: string): unknown {
  const raw = readFileSync(filePath, 'utf8');
  return yaml.load(raw);
}

// ---------------------------------------------------------------------------
// Public loaders
// ---------------------------------------------------------------------------

export function loadAgent(name: string): Agent {
  // Custom agents in .possiblaw/custom-agents/ take priority over layer/agents/
  const customAgentDir = join(REPO_ROOT, '.possiblaw', 'custom-agents');
  const layerAgentDir = join(REPO_ROOT, 'layer', 'agents');

  const customCandidates = findFiles(customAgentDir, (p) => p.endsWith('.md'));
  const layerCandidates = findFiles(layerAgentDir, (p) => p.endsWith('.md'));
  const candidates = [...customCandidates, ...layerCandidates];

  for (const filePath of candidates) {
    const parsed = matter(readFileSync(filePath, 'utf8'));
    const fm = parsed.data as Record<string, unknown>;
    if (fm['name'] === name) {
      const baseModel = String(fm['model']);
      const effectiveModel = getEffectiveModel(name, baseModel);
      if (effectiveModel !== baseModel) {
        console.error(
          `[override] agent.model overridden: ${baseModel} → ${effectiveModel} (agent: ${name})`
        );
      }
      return {
        name: String(fm['name']),
        role: fm['role'] as Agent['role'],
        domain: fm['domain'] as Agent['domain'],
        reports_to: fm['reports_to'] != null ? String(fm['reports_to']) : null,
        manages: Array.isArray(fm['manages']) ? (fm['manages'] as string[]) : [],
        model: effectiveModel,
        fallback_model: fm['fallback_model'] != null ? String(fm['fallback_model']) : '',
        tests: Array.isArray(fm['tests']) ? (fm['tests'] as string[]) : [],
        guardrails: Array.isArray(fm['guardrails']) ? (fm['guardrails'] as string[]) : [],
        skills: Array.isArray(fm['skills']) ? (fm['skills'] as string[]) : [],
        connectors: Array.isArray(fm['connectors']) ? (fm['connectors'] as string[]) : [],
        description: String(fm['description'] ?? ''),
        body: parsed.content,
      };
    }
  }

  throw new Error(
    `Agent '${name}' not found in layer/agents/ or .possiblaw/custom-agents/. Looked at: ${candidates.join(', ')}`
  );
}

export function loadWorkflow(name: string): Workflow {
  const filePath = join(REPO_ROOT, 'layer', 'workflows', `${name}.yaml`);
  if (!existsSync(filePath)) {
    throw new Error(`Workflow '${name}' not found. Expected: ${filePath}`);
  }
  const data = parseYaml(filePath) as Workflow;
  return data;
}

export function loadTemplate(name: string): Template {
  const filePath = join(REPO_ROOT, 'layer', 'templates', `${name}.yaml`);
  if (!existsSync(filePath)) {
    throw new Error(`Template '${name}' not found. Expected: ${filePath}`);
  }
  const data = parseYaml(filePath) as Template;
  // Apply .possiblaw/template-overrides.yaml if present
  const effectiveRoster = applyRosterOverrides(name, data.roster);
  return { ...data, roster: effectiveRoster };
}

export function loadTest(name: string): TestConfig {
  const testsDir = join(REPO_ROOT, 'layer', 'tests');
  const candidates = findFiles(testsDir, (p) => p.endsWith('.yaml') || p.endsWith('.yml'));

  for (const filePath of candidates) {
    const data = parseYaml(filePath) as Record<string, unknown>;
    if (data['name'] === name) {
      return data as unknown as TestConfig;
    }
  }

  throw new Error(
    `Test '${name}' not found in layer/tests/. Looked at: ${candidates.join(', ')}`
  );
}

export function loadGuardrail(name: string): GuardrailConfig {
  const guardrailDir = join(REPO_ROOT, 'layer', 'guardrails');
  const candidates = findFiles(guardrailDir, (p) => p.endsWith('.yaml') || p.endsWith('.yml'));

  for (const filePath of candidates) {
    const data = parseYaml(filePath) as Record<string, unknown>;
    if (data['name'] === name) {
      return data as unknown as GuardrailConfig;
    }
  }

  throw new Error(
    `Guardrail '${name}' not found in layer/guardrails/. Looked at: ${candidates.join(', ')}`
  );
}

/**
 * Return all agent names found in layer/agents/ AND .possiblaw/custom-agents/ (scans frontmatter).
 * Custom agents shadow layer agents on name collision.
 */
export function listAgentNames(): string[] {
  const layerDir = join(REPO_ROOT, 'layer', 'agents');
  const customDir = join(REPO_ROOT, '.possiblaw', 'custom-agents');

  const layerCandidates = findFiles(layerDir, (p) => p.endsWith('.md'));
  const customCandidates = findFiles(customDir, (p) => p.endsWith('.md'));

  const names: string[] = [];
  const seen = new Set<string>();

  // Custom agents first (they shadow layer agents)
  for (const filePath of customCandidates) {
    const parsed = matter(readFileSync(filePath, 'utf8'));
    const fm = parsed.data as Record<string, unknown>;
    if (typeof fm['name'] === 'string' && !seen.has(fm['name'])) {
      names.push(fm['name']);
      seen.add(fm['name']);
    }
  }
  for (const filePath of layerCandidates) {
    const parsed = matter(readFileSync(filePath, 'utf8'));
    const fm = parsed.data as Record<string, unknown>;
    if (typeof fm['name'] === 'string' && !seen.has(fm['name'])) {
      names.push(fm['name']);
      seen.add(fm['name']);
    }
  }
  return names;
}

/**
 * Return agent names found only in .possiblaw/custom-agents/ (operator-created).
 */
export function listCustomAgentNames(): string[] {
  const customDir = join(REPO_ROOT, '.possiblaw', 'custom-agents');
  const candidates = findFiles(customDir, (p) => p.endsWith('.md'));
  const names: string[] = [];
  for (const filePath of candidates) {
    const parsed = matter(readFileSync(filePath, 'utf8'));
    const fm = parsed.data as Record<string, unknown>;
    if (typeof fm['name'] === 'string') {
      names.push(fm['name']);
    }
  }
  return names;
}

export function loadSkill(name: string): Skill {
  const skillsDir = join(REPO_ROOT, 'layer', 'skills');
  const candidates = findFiles(skillsDir, (p) => p.endsWith('.md'));

  for (const filePath of candidates) {
    const parsed = matter(readFileSync(filePath, 'utf8'));
    const fm = parsed.data as Record<string, unknown>;
    if (fm['name'] === name) {
      return {
        name: String(fm['name']),
        description: String(fm['description'] ?? ''),
        body: parsed.content,
      };
    }
  }

  throw new Error(
    `Skill '${name}' not found in layer/skills/. Looked at: ${candidates.join(', ')}`
  );
}
