// trace-store/src/config.ts
//
// loadTraceConfig — reads the `trace` section from the shared gate-policy.yaml.
//
// FAIL-CLOSED, mirroring mcp-servers/firm-facade/src/policy.ts. Every one of
// these yields the CLOSED config (capture "off", no content roles):
//   - missing file, unreadable file, parse error
//   - missing `trace` key, or a non-object one
//   - `enabled` that is not the literal boolean true
//   - `capture` that is not exactly "hashes-only" or "full"
//   - `contentRoles` containing any unrecognised role
//   - `retentionDays` that is not a positive integer
//   - capture "full" with an empty contentRoles list
//
// That last rule is deliberate: capturing prompt text that no role may read is
// pure liability — storage risk with no operator benefit. Rather than silently
// downgrade to "hashes-only" we close, so the misconfiguration is visible.
//
// Path resolution: explicit `path` arg → GATE_POLICY_PATH env var → closed.
// GATE_POLICY_PATH is the same variable gate-proxy and firm-facade read, so an
// operator configures one file for all three processes.

import fs from "node:fs";
import yaml from "js-yaml";
import { TRACE_ROLES, type CaptureMode, type TraceRole } from "./types.ts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TraceConfig {
  /** Master switch. False means nothing is recorded at all. */
  enabled: boolean;
  capture: CaptureMode;
  /** Roles permitted to read captured content. Empty under every closed path. */
  contentRoles: readonly TraceRole[];
  /** Days content is retained before a purge may strip it. */
  retentionDays: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Firm-policy default. Overridable in gate-policy.yaml. */
export const DEFAULT_RETENTION_DAYS = 90;

/** Immutable closed-config sentinel. Returned on every error path. */
const CLOSED: Readonly<TraceConfig> = Object.freeze({
  enabled: false,
  capture: "off" as CaptureMode,
  contentRoles: Object.freeze([]) as readonly TraceRole[],
  retentionDays: DEFAULT_RETENTION_DAYS,
});

const VALID_CAPTURE: ReadonlySet<string> = new Set<CaptureMode>(["hashes-only", "full"]);

const VALID_KEYS: ReadonlySet<string> = new Set([
  "enabled",
  "capture",
  "contentRoles",
  "retentionDays",
]);

// ---------------------------------------------------------------------------
// loadTraceConfig
// ---------------------------------------------------------------------------

export function loadTraceConfig(path?: string): TraceConfig {
  const filePath = path ?? process.env["GATE_POLICY_PATH"];
  if (!filePath) return CLOSED;

  let raw: string;
  try {
    raw = fs.readFileSync(filePath, "utf8");
  } catch {
    return CLOSED;
  }

  let parsed: unknown;
  try {
    parsed = yaml.load(raw);
  } catch {
    return CLOSED;
  }

  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return CLOSED;
  }

  const section = (parsed as Record<string, unknown>)["trace"];
  if (section === null || section === undefined || typeof section !== "object" || Array.isArray(section)) {
    return CLOSED;
  }
  const doc = section as Record<string, unknown>;

  // Unknown keys are a misconfiguration, not something to ignore — a typo'd
  // key would otherwise silently take its default.
  for (const key of Object.keys(doc)) {
    if (!VALID_KEYS.has(key)) return CLOSED;
  }

  // enabled — literal boolean true only. The string "true" does not open this.
  if (doc["enabled"] !== true) return CLOSED;

  // capture — exactly one of the two open modes.
  const capture = doc["capture"];
  if (typeof capture !== "string" || !VALID_CAPTURE.has(capture)) return CLOSED;

  // contentRoles — absent is an empty list; any unrecognised entry closes.
  let contentRoles: TraceRole[] = [];
  const rolesRaw = doc["contentRoles"];
  if (rolesRaw !== undefined) {
    if (!Array.isArray(rolesRaw)) return CLOSED;
    for (const entry of rolesRaw) {
      if (typeof entry !== "string") return CLOSED;
      if (!TRACE_ROLES.includes(entry as TraceRole)) return CLOSED;
      if (!contentRoles.includes(entry as TraceRole)) contentRoles.push(entry as TraceRole);
    }
  }

  // Content nobody may read is liability without benefit — close instead.
  if (capture === "full" && contentRoles.length === 0) return CLOSED;

  // retentionDays — absent takes the default; present must be a positive integer.
  let retentionDays = DEFAULT_RETENTION_DAYS;
  const retentionRaw = doc["retentionDays"];
  if (retentionRaw !== undefined) {
    if (typeof retentionRaw !== "number" || !Number.isInteger(retentionRaw) || retentionRaw <= 0) {
      return CLOSED;
    }
    retentionDays = retentionRaw;
  }

  return Object.freeze({
    enabled: true,
    capture: capture as CaptureMode,
    contentRoles: Object.freeze(contentRoles) as readonly TraceRole[],
    retentionDays,
  });
}

/** The closed config, for callers that need an explicit "record nothing". */
export function closedTraceConfig(): TraceConfig {
  return CLOSED;
}
