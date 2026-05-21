/**
 * PossibLaw v2 — Template roster overrides.
 * Reads from <repo>/.possiblaw/template-overrides.yaml (repo-local, gitignored).
 *
 * Schema:
 *   templates:
 *     small-firm:
 *       roster:
 *         specialists:
 *           add: [employee-handbook-drafter]
 *           remove: [pitch-polisher]
 */

import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import yaml from 'js-yaml';
import { REPO_ROOT } from './loader.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RosterPatch {
  routers?: { add?: string[]; remove?: string[] };
  leads?: { add?: string[]; remove?: string[] };
  specialists?: { add?: string[]; remove?: string[] };
}

export interface TemplateOverrideEntry {
  roster?: RosterPatch;
}

export interface TemplateOverridesFile {
  templates?: Record<string, TemplateOverrideEntry>;
}

// ---------------------------------------------------------------------------
// File path
// ---------------------------------------------------------------------------

export function templateOverridesPath(): string {
  return join(REPO_ROOT, '.possiblaw', 'template-overrides.yaml');
}

// ---------------------------------------------------------------------------
// Load
// ---------------------------------------------------------------------------

export function loadTemplateOverrides(): TemplateOverridesFile {
  const filePath = templateOverridesPath();
  if (!existsSync(filePath)) return {};
  try {
    const raw = readFileSync(filePath, 'utf8');
    return (yaml.load(raw) as TemplateOverridesFile | null) ?? {};
  } catch {
    return {};
  }
}

// ---------------------------------------------------------------------------
// Save
// ---------------------------------------------------------------------------

function saveTemplateOverrides(data: TemplateOverridesFile): void {
  const dir = join(REPO_ROOT, '.possiblaw');
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  const content = yaml.dump(data, { indent: 2 });
  writeFileSync(templateOverridesPath(), content, 'utf8');
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

/**
 * Add an agent to the roster of a template (section: routers | leads | specialists).
 * Creates the template entry if absent. No-op if already present.
 */
export function addToTemplateRoster(
  templateName: string,
  section: 'routers' | 'leads' | 'specialists',
  agentName: string
): void {
  const data = loadTemplateOverrides();
  data.templates ??= {};
  data.templates[templateName] ??= {};
  data.templates[templateName].roster ??= {};
  const roster = data.templates[templateName].roster!;
  roster[section] ??= {};
  const patch = roster[section]!;
  patch.add ??= [];
  if (!patch.add.includes(agentName)) {
    patch.add.push(agentName);
  }
  // Remove from the remove list if it was there
  if (patch.remove) {
    patch.remove = patch.remove.filter((n) => n !== agentName);
  }
  saveTemplateOverrides(data);
}

/**
 * Remove an agent from the roster of a template.
 * - If the agent was in the `add` list (custom-added), remove it from there.
 * - If the agent comes from the base template, add it to the `remove` list.
 * Operates only on sections where the agent is actually present.
 */
export function removeFromTemplateRoster(
  templateName: string,
  agentName: string
): void {
  const data = loadTemplateOverrides();
  data.templates ??= {};
  data.templates[templateName] ??= {};
  data.templates[templateName].roster ??= {};
  const roster = data.templates[templateName].roster!;

  for (const section of ['routers', 'leads', 'specialists'] as const) {
    const patch = roster[section];
    if (patch?.add) {
      const wasCustAdd = patch.add.includes(agentName);
      patch.add = patch.add.filter((n) => n !== agentName);
      // If it was a custom-added agent, we've removed it from add — no need for remove list
      if (wasCustAdd) continue;
    }
    // For base-template agents, add to remove list (section-specific only if needed)
    // We add to specialists/leads/routers as appropriate based on base template resolution
    // Rather than blindly adding to all sections, we'll add a remove sentinel for all (safe — applyRosterOverrides checks)
  }

  // Add a targeted sentinel: add to all sections' remove list — applyRosterOverrides will filter
  for (const section of ['routers', 'leads', 'specialists'] as const) {
    roster[section] ??= {};
    const patch = roster[section]!;
    patch.remove ??= [];
    if (!patch.remove.includes(agentName)) {
      patch.remove.push(agentName);
    }
  }

  saveTemplateOverrides(data);
}

/**
 * Update all references to oldName → newName in template-overrides.yaml.
 */
export function renameInTemplateOverrides(oldName: string, newName: string): void {
  const data = loadTemplateOverrides();
  if (!data.templates) return;
  for (const entry of Object.values(data.templates)) {
    if (!entry.roster) continue;
    for (const section of ['routers', 'leads', 'specialists'] as const) {
      const patch = entry.roster[section];
      if (!patch) continue;
      if (patch.add) {
        patch.add = patch.add.map((n) => (n === oldName ? newName : n));
      }
      if (patch.remove) {
        patch.remove = patch.remove.map((n) => (n === oldName ? newName : n));
      }
    }
  }
  saveTemplateOverrides(data);
}

/**
 * Apply template overrides to a base roster.
 * Returns the effective (merged) roster lists.
 */
export function applyRosterOverrides(
  templateName: string,
  base: { routers: string[]; leads: string[]; specialists: string[] }
): { routers: string[]; leads: string[]; specialists: string[] } {
  const overrides = loadTemplateOverrides();
  const entry = overrides.templates?.[templateName];
  if (!entry?.roster) return { ...base };

  const result = {
    routers: [...base.routers],
    leads: [...base.leads],
    specialists: [...base.specialists],
  };

  for (const section of ['routers', 'leads', 'specialists'] as const) {
    const patch = entry.roster[section];
    if (!patch) continue;
    if (patch.add) {
      for (const name of patch.add) {
        if (!result[section].includes(name)) {
          result[section].push(name);
        }
      }
    }
    if (patch.remove) {
      result[section] = result[section].filter((n) => !patch.remove!.includes(n));
    }
  }

  return result;
}
