// mcp-servers/legal-data/src/types.ts
// Public shapes for the legal-data MCP: provenance envelope, tool results,
// the injectable fetch dependency, and the cache contract.

/** Injectable HTTP fetch. Tests stub this; production passes node's global fetch. */
export type FetchFn = (
  url: string,
  init?: { method?: string; headers?: Record<string, string>; body?: string },
) => Promise<FetchResponse>;

/** Minimal subset of the WHATWG Response surface we depend on. */
export interface FetchResponse {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
  text(): Promise<string>;
}

/**
 * Provenance envelope wrapped around EVERY successful tool result.
 * Agents get the slice AND where it came from, when, and a fingerprint.
 */
export interface ProvenanceEnvelope<T = unknown> {
  source: "courtlistener";
  source_url: string;
  retrieved_at: string; // ISO 8601 UTC
  court: string | null;
  decided_date: string | null; // YYYY-MM-DD
  citation: string | null;
  sha256: string; // documentSha256 of the normalized fingerprint text
  payload: T;
}

/** Structured failure — NEVER a fabricated opinion. */
export interface UnavailableResult {
  source: "courtlistener";
  status: "unavailable";
  reason: string;
  http_status?: number;
  source_url?: string;
}

/** Ambiguous citation -> ranked candidates; the resolver never silently picks one. */
export interface AmbiguousResult {
  source: "courtlistener";
  status: "ambiguous";
  citation: string;
  candidates: ProvenanceEnvelope[];
}

export type ToolResult<T = unknown> =
  | ProvenanceEnvelope<T>
  | AmbiguousResult
  | UnavailableResult;

export interface ClientOptions {
  fetchFn: FetchFn;
  apiKey?: string;
  cache?: Cache;
  baseUrl?: string; // default https://www.courtlistener.com/api/rest/v4
  /** Injectable clock for deterministic retrieved_at in tests. */
  now?: () => Date;
  /** Privacy tier of the originating matter. Drives query sanitization. */
  privacyTier?: "standard" | "confidential" | "privileged";
}

/** sha256-keyed cache so we absorb rate limits and tests stay deterministic. */
export interface Cache {
  get(key: string): unknown | undefined;
  set(key: string, value: unknown): void;
  has(key: string): boolean;
}
