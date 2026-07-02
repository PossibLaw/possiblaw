// orchestration-eval/src/agent-resolver.ts
// Slug → agent-UUID resolution for issue assignment (Task 1.1).
//
// Why this exists: paperclip validates `assigneeAgentId` as a UUID
// (paperclip/packages/shared/src/validators/issue.ts:62), but the LAB manifest
// names Arm A assignees by package slug (e.g. `immigration-lead`). Passing the
// slug straight through 400s every Arm A issue creation.
//
// Resolution strategy (verified against paperclip source, read-only):
// - The agents table has NO `slug` column (paperclip/packages/db/src/schema/agents.ts).
// - GET /api/companies/:companyId/agents returns each row with
//   `urlKey = normalizeAgentUrlKey(name)` (paperclip/server/src/services/agents.ts,
//   withUrlKey / normalizeAgentRow).
// - Company import sets the agent's `name` from AGENTS.md frontmatter
//   (`name: Immigration Lead`), and paperclip's own import slug-matching uses
//   normalizeAgentUrlKey(name) (paperclip/server/src/services/company-portability.ts),
//   so urlKey("Immigration Lead") === package slug "immigration-lead".
// - We therefore match the manifest slug against each agent's `urlKey` when
//   present, else against the same normalization applied locally to `name`
//   (mirror of paperclip/packages/shared/src/agent-url-key.ts).

const SLUG_DELIM_RE = /[^a-z0-9]+/g;
const SLUG_TRIM_RE = /^-+|-+$/g;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuidLike(value: string | null | undefined): boolean {
  if (typeof value !== "string") return false;
  return UUID_RE.test(value.trim());
}

/** Mirror of paperclip's normalizeAgentUrlKey: lowercase, non-alphanumeric runs → "-", trim dashes. */
export function normalizeAgentSlug(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase().replace(SLUG_DELIM_RE, "-").replace(SLUG_TRIM_RE, "");
  return normalized.length > 0 ? normalized : null;
}

/** Structured, loud resolution failure. `message` carries the SKIPPED reason. */
export class AgentResolutionError extends Error {
  constructor(
    public readonly slug: string,
    public readonly detail: string,
    reasonPrefix = "agent_unresolved",
  ) {
    super(`${reasonPrefix}: ${slug} (${detail})`);
    this.name = "AgentResolutionError";
  }
}

export interface AgentDirectoryEntry { id: string; name?: string; urlKey?: string; }

export interface AgentDirectory {
  /** UUID passthrough; slug → unique agent UUID; otherwise throws AgentResolutionError. */
  resolveId(slugOrId: string): string;
  /** Best-effort display label (slug form) for an agent id; unknown ids echo back. */
  labelFor(agentId: string | null | undefined): string | null;
}

/** Build the slug→UUID map ONCE per run from the agent list API. */
export function buildAgentDirectory(agents: AgentDirectoryEntry[]): AgentDirectory {
  const idsByKey = new Map<string, string[]>();
  const labelById = new Map<string, string>();
  for (const a of agents) {
    const key = a.urlKey ?? normalizeAgentSlug(a.name);
    if (key) {
      labelById.set(a.id, key);
      const ids = idsByKey.get(key) ?? [];
      ids.push(a.id);
      idsByKey.set(key, ids);
    }
  }
  return {
    resolveId(slugOrId: string): string {
      if (isUuidLike(slugOrId)) return slugOrId.trim();
      const key = normalizeAgentSlug(slugOrId);
      const ids = (key ? idsByKey.get(key) : undefined) ?? [];
      if (ids.length === 1) return ids[0];
      if (ids.length > 1) throw new AgentResolutionError(slugOrId, `ambiguous — ${ids.length} agents match`);
      throw new AgentResolutionError(slugOrId, "no matching agent");
    },
    labelFor(agentId: string | null | undefined): string | null {
      if (!agentId) return null;
      return labelById.get(agentId) ?? agentId;
    },
  };
}

/** Fail-closed default when no live agent directory is provided:
 * UUIDs pass through; a slug is NEVER forwarded as assigneeAgentId. */
export function strictUuidOnlyDirectory(): AgentDirectory {
  return {
    resolveId(slugOrId: string): string {
      if (isUuidLike(slugOrId)) return slugOrId.trim();
      throw new AgentResolutionError(slugOrId, "no agent directory available to resolve slug");
    },
    labelFor: (agentId) => agentId ?? null,
  };
}
