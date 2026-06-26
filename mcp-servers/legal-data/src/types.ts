// mcp-servers/legal-data/src/types.ts
// Public shapes for the legal-data MCP trust-adapter: the provenance envelope,
// the structured-unavailable result, the upstream injection point, and the
// cache contract.
//
// This component is a THIN proxy in front of the OFFICIAL CourtListener MCP
// (https://mcp.courtlistener.com). We do NOT re-implement CourtListener's REST
// API and we do NOT pin upstream tool schemas — the adapter is intentionally
// schema-agnostic about what an upstream tool returns. The only thing we add is
// (a) a sha256 provenance envelope aligned with gate-proxy's citation gate, and
// (b) confidential-query sanitization before anything leaves the boundary.

export type PrivacyTier = "standard" | "confidential" | "privileged";

/**
 * The injection point for the official CourtListener MCP. Production wires a
 * real Streamable-HTTP + OAuth MCP client (see ./upstream.ts); tests pass a
 * deterministic stub. We deliberately type the result as `unknown` — the
 * adapter must not assume an upstream schema.
 */
export type UpstreamCaller = (
  toolName: string,
  args: Record<string, unknown>,
) => Promise<UpstreamResult>;

/** Whatever the upstream MCP tool returns. Opaque on purpose. */
export type UpstreamResult = unknown;

/**
 * Provenance envelope wrapped around EVERY successful proxied tool result.
 * Agents get the upstream slice AND a fingerprint + best-effort provenance.
 *
 * Provenance fields (source_url/court/decided_date/citation) are BEST-EFFORT:
 * extracted from common field names if present, omitted (undefined) if absent.
 * They are NEVER invented. `sha256` is ALWAYS computed.
 */
export interface ProvenanceEnvelope<T = UpstreamResult> {
  source: "courtlistener";
  source_url?: string;
  retrieved_at: string; // ISO 8601 UTC (injected — never Date.now() in the pure core)
  court?: string;
  decided_date?: string; // YYYY-MM-DD when extractable
  citation?: string;
  sha256: string; // documentSha256 over the result's canonical fingerprint text
  payload: T;
}

/**
 * Structured failure — returned when the upstream throws, rejects, or times out.
 * NEVER a fabricated opinion, never an envelope with invented fields.
 */
export interface UnavailableResult {
  source: "courtlistener";
  status: "unavailable";
  tool: string;
  reason: string;
}

export type ProxyResult<T = UpstreamResult> = ProvenanceEnvelope<T> | UnavailableResult;

/**
 * Context for wrapWithProvenance / proxyToolCall. `now` is injected so the pure
 * core is deterministic in tests (no Date.now() inside the pure functions).
 */
export interface ProxyContext {
  toolName: string;
  args: Record<string, unknown>;
  tier: PrivacyTier;
  now: string; // ISO 8601 UTC timestamp, injected by the caller
}

/** sha256-keyed cache so we absorb upstream rate limits and tests stay deterministic. */
export interface Cache {
  get(key: string): unknown | undefined;
  set(key: string, value: unknown): void;
  has(key: string): boolean;
}
