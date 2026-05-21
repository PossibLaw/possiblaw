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
  const agentDir = join(REPO_ROOT, 'layer', 'agents');
  const candidates = findFiles(agentDir, (p) => p.endsWith('.md'));

  for (const filePath of candidates) {
    const parsed = matter(readFileSync(filePath, 'utf8'));
    const fm = parsed.data as Record<string, unknown>;
    if (fm['name'] === name) {
      return {
        name: String(fm['name']),
        role: fm['role'] as Agent['role'],
        domain: fm['domain'] as Agent['domain'],
        reports_to: fm['reports_to'] != null ? String(fm['reports_to']) : null,
        manages: Array.isArray(fm['manages']) ? (fm['manages'] as string[]) : [],
        model: String(fm['model']),
        fallback_model: String(fm['fallback_model']),
        tests: Array.isArray(fm['tests']) ? (fm['tests'] as string[]) : [],
        guardrails: Array.isArray(fm['guardrails']) ? (fm['guardrails'] as string[]) : [],
        skills: Array.isArray(fm['skills']) ? (fm['skills'] as string[]) : [],
        description: String(fm['description'] ?? ''),
        body: parsed.content,
      };
    }
  }

  throw new Error(
    `Agent '${name}' not found in layer/agents/. Looked at: ${candidates.join(', ')}`
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
  return data;
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
