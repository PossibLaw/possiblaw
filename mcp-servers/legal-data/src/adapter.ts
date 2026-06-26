// mcp-servers/legal-data/src/adapter.ts
//
// The PURE, fully-tested core of the legal-data trust-adapter. No network, no
// clock, no MCP-SDK imports — everything testable lives here.
//
// PossibLaw does NOT re-implement CourtListener's API. The official CourtListener
// MCP (https://mcp.courtlistener.com) is the data source. This adapter sits in
// front of it and, for every tool call:
//   1. sanitizeArgs  — strips client identifiers from query/search-like args
//                       (gated on privacy tier) BEFORE anything is forwarded.
//   2. <forward>      — the caller invokes the injected UpstreamCaller.
//   3. wrapWithProvenance — wraps the upstream result in our sha256-aligned
//                       provenance envelope, extracting provenance best-effort.
//
// The adapter is SCHEMA-AGNOSTIC: we do not know (and do not pin) the upstream
// tool result schemas. We probe a small set of common field names best-effort
// and fall back to canonical JSON when no obvious text field is present.
import { documentSha256 } from "./hash.ts";
import { sanitizeQuery } from "./sanitize.ts";
import type {
  PrivacyTier,
  ProvenanceEnvelope,
  ProxyContext,
  ProxyResult,
  UnavailableResult,
  UpstreamCaller,
  UpstreamResult,
} from "./types.ts";

// ---------------------------------------------------------------------------
// 1. sanitizeArgs
// ---------------------------------------------------------------------------

// Arg keys whose VALUE is treated as a free-text legal query and therefore
// routed through sanitizeQuery. The upstream MCP names its params differently
// per tool; these are the common candidates. Sanitization is conservative:
// only string values under these keys are touched, everything else passes
// through unchanged.
const QUERY_LIKE_KEYS = new Set([
  "q",
  "query",
  "search",
  "search_query",
  "text",
  "term",
  "terms",
  "keyword",
  "keywords",
]);

/**
 * Apply sanitizeQuery to query/search-like string fields before forwarding.
 * Standard tier is a pass-through (sanitizeQuery itself no-ops on "standard").
 * Returns a NEW args object; the input is never mutated.
 */
export function sanitizeArgs(
  args: Record<string, unknown>,
  tier: PrivacyTier,
): Record<string, unknown> {
  if (tier === "standard") return { ...args };

  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(args)) {
    if (typeof value === "string" && QUERY_LIKE_KEYS.has(key.toLowerCase())) {
      out[key] = sanitizeQuery(value, tier).query;
    } else {
      out[key] = value;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// 2. wrapWithProvenance
// ---------------------------------------------------------------------------

// Candidate field names probed best-effort for each provenance facet. Order is
// preference order. We look at the top-level object and, if the result wraps a
// single primary record (e.g. { result: {...} } or { results: [first] }), at
// that record too.
const SOURCE_URL_KEYS = ["source_url", "absolute_url", "url", "uri", "html_link"];
const COURT_KEYS = ["court", "court_name", "court_id", "courtName"];
const DECIDED_DATE_KEYS = [
  "decided_date",
  "date_filed",
  "dateFiled",
  "date_decided",
  "filed",
  "date",
];
const CITATION_KEYS = ["citation", "cite", "citation_string", "reporter_citation"];

// Candidate field names probed for the result's PRIMARY TEXT (the body the
// citation gate would later hash if an agent quotes it). Order is preference.
const PRIMARY_TEXT_KEYS = [
  "plain_text",
  "text",
  "opinion_text",
  "body",
  "content",
  "snippet",
  "summary",
  "case_name",
  "caseName",
];

const CL_SITE = "https://www.courtlistener.com";

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

/** Pick the first record we can use for field extraction: the result itself, or its wrapped primary record. */
function primaryRecords(result: UpstreamResult): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  if (isRecord(result)) {
    out.push(result);
    // Common single-record wrappers.
    for (const k of ["result", "data", "opinion", "cluster", "docket"]) {
      if (isRecord(result[k])) out.push(result[k] as Record<string, unknown>);
    }
    // Common list wrappers — use the first hit for provenance hints.
    for (const k of ["results", "hits", "items"]) {
      const arr = result[k];
      if (Array.isArray(arr) && arr.length > 0 && isRecord(arr[0])) {
        out.push(arr[0] as Record<string, unknown>);
      }
    }
  }
  return out;
}

function firstString(records: Record<string, unknown>[], keys: string[]): string | undefined {
  for (const rec of records) {
    for (const key of keys) {
      const v = rec[key];
      if (typeof v === "string" && v.trim().length > 0) return v.trim();
    }
  }
  return undefined;
}

/** Resolve a CourtListener-style absolute_url path to a full URL; leave full URLs alone. */
function normalizeSourceUrl(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  if (/^https?:\/\//i.test(raw)) return raw;
  // A site-relative path like /opinion/108713/roe-v-wade/.
  if (raw.startsWith("/")) return `${CL_SITE}${raw}`;
  return raw;
}

/**
 * Strip illustrative/meta keys (leading underscore, e.g. our fixture `_comment`)
 * before canonical serialization, so the sha is stable and not polluted by
 * documentation noise. Applies recursively.
 */
function stripMetaKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripMetaKeys);
  if (isRecord(value)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (k.startsWith("_")) continue;
      out[k] = stripMetaKeys(v);
    }
    return out;
  }
  return value;
}

/**
 * Deterministic canonical JSON: object keys sorted recursively so two
 * structurally-equal results always serialize byte-identically.
 */
function canonicalJson(value: unknown): string {
  const normalize = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(normalize);
    if (isRecord(v)) {
      const sorted: Record<string, unknown> = {};
      for (const key of Object.keys(v).sort()) sorted[key] = normalize(v[key]);
      return sorted;
    }
    return v;
  };
  return JSON.stringify(normalize(value));
}

/**
 * Compute the deterministic fingerprint text for an upstream result:
 *   - if a primary text field is present, hash THAT (the authority body the
 *     citation gate would later hash if an agent quotes it);
 *   - otherwise hash the canonical JSON of the whole result (meta keys stripped).
 * documentSha256 then NFKC-normalizes + collapses whitespace before hashing,
 * keeping us byte-aligned with gate-proxy's citation gate.
 */
export function fingerprintText(result: UpstreamResult): string {
  const records = primaryRecords(result);
  const primary = firstString(records, PRIMARY_TEXT_KEYS);
  if (primary !== undefined) return primary;
  return canonicalJson(stripMetaKeys(result));
}

/**
 * Wrap an upstream result in our provenance envelope. PURE: `now` is passed in.
 * Provenance facets are extracted BEST-EFFORT and OMITTED when absent — never
 * invented. `sha256` is ALWAYS computed via documentSha256.
 */
export function wrapWithProvenance(
  upstreamResult: UpstreamResult,
  ctx: { now: string },
): ProvenanceEnvelope {
  const records = primaryRecords(upstreamResult);

  const sourceUrl = normalizeSourceUrl(firstString(records, SOURCE_URL_KEYS));
  const court = firstString(records, COURT_KEYS);
  const decidedDate = firstString(records, DECIDED_DATE_KEYS);
  const citation = firstString(records, CITATION_KEYS);

  const env: ProvenanceEnvelope = {
    source: "courtlistener",
    retrieved_at: ctx.now,
    sha256: documentSha256(fingerprintText(upstreamResult)),
    payload: upstreamResult,
  };
  // Only attach facets that were actually present upstream. No fabrication.
  if (sourceUrl !== undefined) env.source_url = sourceUrl;
  if (court !== undefined) env.court = court;
  if (decidedDate !== undefined) env.decided_date = decidedDate;
  if (citation !== undefined) env.citation = citation;

  return env;
}

// ---------------------------------------------------------------------------
// 3. proxyToolCall — sanitize -> forward -> wrap; failures never throw.
// ---------------------------------------------------------------------------

function describeUpstreamError(e: unknown): string {
  const name = (e as { name?: string })?.name ?? "";
  const msg = (e as { message?: string })?.message ?? String(e);
  if (name === "AbortError" || /timeout|abort/i.test(msg)) {
    return `CourtListener MCP request timed out: ${msg}`;
  }
  return `CourtListener MCP upstream call failed: ${msg}`;
}

/**
 * Orchestrate a single proxied tool call:
 *   sanitizeArgs(tier) -> upstream(toolName, sanitizedArgs) -> wrapWithProvenance.
 *
 * ANY upstream throw/rejection/timeout becomes a structured `unavailable`
 * result — this function NEVER throws and NEVER fabricates an opinion. The
 * upstream caller only ever sees SANITIZED args, so a confidential client
 * identifier never crosses the boundary.
 */
export async function proxyToolCall(
  upstream: UpstreamCaller,
  ctx: ProxyContext,
): Promise<ProxyResult> {
  const sanitized = sanitizeArgs(ctx.args, ctx.tier);
  try {
    const result = await upstream(ctx.toolName, sanitized);
    return wrapWithProvenance(result, { now: ctx.now });
  } catch (e) {
    const unavailable: UnavailableResult = {
      source: "courtlistener",
      status: "unavailable",
      tool: ctx.toolName,
      reason: describeUpstreamError(e),
    };
    return unavailable;
  }
}
