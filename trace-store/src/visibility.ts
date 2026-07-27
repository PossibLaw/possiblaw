// trace-store/src/visibility.ts
//
// Role gate over captured content. Records are readable by anyone who can read
// the store; the PROMPT AND OUTPUT inside them are not.
//
// FAIL-CLOSED at every branch: a closed config, an unrecognised role, a role
// absent from the allow list, and a malformed role value all yield a record
// with no content. There is no error path that returns content — a caller that
// gets a record either was entitled to the content or does not receive it.

import type { TraceConfig } from "./config.ts";
import { withoutContent } from "./record.ts";
import { TRACE_ROLES, type TraceRecord, type TraceRole } from "./types.ts";

/**
 * May this role read captured prompt/output content?
 *
 * Accepts an unvalidated string — callers pass whatever their auth layer
 * produced, and an unrecognised value is simply denied.
 */
export function canViewContent(role: string | undefined | null, config: TraceConfig): boolean {
  if (!config.enabled) return false;
  if (config.capture !== "full") return false;
  if (typeof role !== "string" || role === "") return false;
  if (!TRACE_ROLES.includes(role as TraceRole)) return false;
  return config.contentRoles.includes(role as TraceRole);
}

/**
 * Return the record as this role may see it. Content is preserved only when
 * canViewContent allows it; otherwise it is stripped and the hash retained.
 *
 * Note this does NOT set contentPurgedAt — the content still exists, this
 * caller just may not read it. Only a retention purge marks a record purged.
 */
export function redactForRole(
  record: TraceRecord,
  role: string | undefined | null,
  config: TraceConfig,
): TraceRecord {
  if (canViewContent(role, config)) return record;
  return withoutContent(record);
}

export function redactManyForRole(
  records: readonly TraceRecord[],
  role: string | undefined | null,
  config: TraceConfig,
): TraceRecord[] {
  // Resolve the role decision once — it cannot vary across records.
  if (canViewContent(role, config)) return [...records];
  return records.map((r) => withoutContent(r));
}
