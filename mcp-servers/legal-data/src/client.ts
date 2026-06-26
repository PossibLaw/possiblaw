// mcp-servers/legal-data/src/client.ts
//
// LegalDataClient — pure logic for the CourtListener legal-data MCP.
// Backed by CourtListener REST v4 (https://www.courtlistener.com/api/rest/v4/).
//
// Every successful result is wrapped in a ProvenanceEnvelope. Every failure is a
// structured `unavailable` result — NEVER a fabricated opinion. The HTTP fetch is
// injected (`fetchFn`) so tests stub it with fixture JSON and make no live calls.
//
// Hashing reuses gate-proxy's documentSha256 (copied verbatim into ./hash.ts) so
// a fetched authority's fingerprint matches what the citation gate computes.
import { documentSha256 } from "./hash.ts";
import { MemoryCache } from "./cache.ts";
import { sanitizeQuery } from "./sanitize.ts";
import type {
  AmbiguousResult,
  Cache,
  ClientOptions,
  FetchFn,
  ProvenanceEnvelope,
  ToolResult,
  UnavailableResult,
} from "./types.ts";

const DEFAULT_BASE = "https://www.courtlistener.com/api/rest/v4";
const SITE = "https://www.courtlistener.com";

export interface SearchInput {
  query: string;
  court?: string;
  date_range?: { after?: string; before?: string };
}

interface ClusterLike {
  id?: number;
  case_name?: string;
  date_filed?: string;
  absolute_url?: string;
  court?: string;
  citations?: { volume?: number; reporter?: string; page?: string }[];
}

export class LegalDataClient {
  private readonly fetchFn: FetchFn;
  private readonly apiKey?: string;
  private readonly cache: Cache;
  private readonly baseUrl: string;
  private readonly now: () => Date;
  private readonly privacyTier: "standard" | "confidential" | "privileged";

  constructor(opts: ClientOptions) {
    this.fetchFn = opts.fetchFn;
    this.apiKey = opts.apiKey;
    this.cache = opts.cache ?? new MemoryCache();
    this.baseUrl = (opts.baseUrl ?? DEFAULT_BASE).replace(/\/$/, "");
    this.now = opts.now ?? (() => new Date());
    this.privacyTier = opts.privacyTier ?? "standard";
  }

  // -------------------------------------------------------------------------
  // Tools
  // -------------------------------------------------------------------------

  /** search_opinions(query, court?, date_range?) -> ranked stubs + provenance. */
  async searchOpinions(input: SearchInput): Promise<ToolResult> {
    // Privacy: strip client identifiers before the outbound third-party read.
    const { query } = sanitizeQuery(input.query, this.privacyTier);

    const params = new URLSearchParams({ q: query, type: "o" });
    if (input.court) params.set("court", input.court);
    if (input.date_range?.after) params.set("filed_after", input.date_range.after);
    if (input.date_range?.before) params.set("filed_before", input.date_range.before);

    const url = `${this.baseUrl}/search/?${params.toString()}`;
    const fetched = await this.getJson(url);
    if ("error" in fetched) return fetched.error;
    const body = fetched.value as { results?: unknown[] };

    const results = Array.isArray(body.results) ? body.results : [];
    // Fingerprint the result set deterministically (ids + cites) so the same
    // query over the same corpus version produces a stable sha.
    const fingerprint = results
      .map((r) => {
        const o = r as { id?: number; caseName?: string; citation?: unknown };
        return `${o.id ?? ""}:${o.caseName ?? ""}:${JSON.stringify(o.citation ?? [])}`;
      })
      .join("\n");

    return this.envelope({
      payload: body,
      fingerprintText: `search:${query}\n${fingerprint}`,
      sourceUrl: url,
      court: input.court ?? null,
      decidedDate: null,
      citation: null,
    });
  }

  /** get_opinion(id) -> full opinion text + parse + provenance. */
  async getOpinion(id: number | string): Promise<ToolResult> {
    const url = `${this.baseUrl}/opinions/${id}/`;
    const fetched = await this.getJson(url);
    if ("error" in fetched) return fetched.error;
    const op = fetched.value as {
      plain_text?: string;
      html?: string;
      absolute_url?: string;
      cluster_id?: number;
    };

    // The authority body itself is the fingerprint target (this is the text the
    // citation gate will later hash if an agent quotes it).
    const bodyText = op.plain_text ?? op.html ?? "";

    // Best-effort cluster enrichment for court/date/citation in the envelope.
    let court: string | null = null;
    let decidedDate: string | null = null;
    let citation: string | null = null;
    if (op.cluster_id !== undefined) {
      const clusterFetched = await this.getJson(`${this.baseUrl}/clusters/${op.cluster_id}/`);
      if (!("error" in clusterFetched)) {
        const cl = clusterFetched.value as ClusterLike;
        decidedDate = cl.date_filed ?? null;
        citation = firstCitation(cl) ?? null;
        court = typeof cl.court === "string" ? cl.court : null;
      }
    }

    return this.envelope({
      payload: op,
      fingerprintText: bodyText,
      sourceUrl: absUrl(op.absolute_url),
      court,
      decidedDate,
      citation,
    });
  }

  /**
   * get_citation(cite) -> resolved opinion + decided_date + court + citation +
   * provenance. Ambiguous/parallel cites return RANKED candidates and never
   * silently pick one. Misses and upstream errors return `unavailable`.
   */
  async getCitation(cite: string): Promise<ToolResult> {
    const url = `${this.baseUrl}/citation-lookup/`;
    const fetched = await this.postJson(url, { text: cite });
    if ("error" in fetched) return fetched.error;

    const arr = Array.isArray(fetched.value) ? (fetched.value as unknown[]) : [];
    const entry = arr[0] as
      | { status?: number; error_message?: string; clusters?: ClusterLike[] }
      | undefined;

    if (!entry) {
      return unavailable(`no citation-lookup entry returned for "${cite}"`, undefined, url);
    }

    const clusters = Array.isArray(entry.clusters) ? entry.clusters : [];

    // status 200 + exactly one cluster -> resolved.
    if (entry.status === 200 && clusters.length === 1) {
      return this.clusterEnvelope(cite, clusters[0]);
    }

    // status 300 (or any >1 cluster set) -> ambiguous; return ranked candidates.
    if (clusters.length > 1) {
      const candidates = clusters
        .map((c) => this.clusterEnvelope(cite, c))
        .sort((a, b) => (a.decided_date ?? "").localeCompare(b.decided_date ?? ""));
      const result: AmbiguousResult = {
        source: "courtlistener",
        status: "ambiguous",
        citation: cite,
        candidates,
      };
      return result;
    }

    // status 404 / empty clusters -> not found. Never fabricate.
    return unavailable(
      entry.error_message || `citation not found: "${cite}"`,
      entry.status,
      url,
    );
  }

  /** get_docket(id) -> docket metadata + provenance. */
  async getDocket(id: number | string): Promise<ToolResult> {
    const url = `${this.baseUrl}/dockets/${id}/`;
    const fetched = await this.getJson(url);
    if ("error" in fetched) return fetched.error;
    const dk = fetched.value as {
      absolute_url?: string;
      date_terminated?: string;
      date_filed?: string;
      court?: string;
      court_id?: string;
      case_name?: string;
      docket_number?: string;
    };
    return this.envelope({
      payload: dk,
      // A docket has no opinion body; fingerprint its identifying metadata.
      fingerprintText: `docket:${dk.docket_number ?? id}|${dk.case_name ?? ""}|${dk.date_filed ?? ""}`,
      sourceUrl: absUrl(dk.absolute_url),
      court: dk.court_id ?? (typeof dk.court === "string" ? dk.court : null),
      decidedDate: dk.date_terminated ?? dk.date_filed ?? null,
      citation: null,
    });
  }

  // -------------------------------------------------------------------------
  // Envelope construction + cache
  // -------------------------------------------------------------------------

  private clusterEnvelope(cite: string, cluster: ClusterLike): ProvenanceEnvelope {
    const caseName = cluster.case_name ?? "";
    const decidedDate = cluster.date_filed ?? null;
    const citation = firstCitation(cluster) ?? cite;
    // Deterministic fingerprint for a resolved cite: caption|cite|date.
    const fingerprint = `${caseName}|${citation}|${decidedDate ?? ""}`;
    return this.envelope({
      payload: cluster,
      fingerprintText: fingerprint,
      sourceUrl: absUrl(cluster.absolute_url),
      court: typeof cluster.court === "string" ? cluster.court : null,
      decidedDate,
      citation,
    });
  }

  private envelope(args: {
    payload: unknown;
    fingerprintText: string;
    sourceUrl: string;
    court: string | null;
    decidedDate: string | null;
    citation: string | null;
  }): ProvenanceEnvelope {
    const sha256 = documentSha256(args.fingerprintText);
    const env: ProvenanceEnvelope = {
      source: "courtlistener",
      source_url: args.sourceUrl,
      retrieved_at: this.now().toISOString(),
      court: args.court,
      decided_date: args.decidedDate,
      citation: args.citation,
      sha256,
      payload: args.payload,
    };
    // Cache keyed by sha256 — same authority, same key.
    this.cache.set(sha256, env);
    return env;
  }

  // -------------------------------------------------------------------------
  // HTTP — all network failures become structured `unavailable`, never throw.
  // -------------------------------------------------------------------------

  private headers(): Record<string, string> {
    const h: Record<string, string> = { Accept: "application/json" };
    if (this.apiKey) h["Authorization"] = `Token ${this.apiKey}`;
    return h;
  }

  private async getJson(
    url: string,
  ): Promise<{ value: unknown } | { error: UnavailableResult }> {
    // Cache GETs by URL so the sha-keyed authority cache is consulted first.
    const cacheKey = `url:${url}`;
    if (this.cache.has(cacheKey)) {
      return { value: this.cache.get(cacheKey) };
    }
    try {
      const res = await this.fetchFn(url, { method: "GET", headers: this.headers() });
      if (!res.ok) {
        return { error: unavailable(`CourtListener returned HTTP ${res.status}`, res.status, url) };
      }
      const value = await res.json();
      this.cache.set(cacheKey, value);
      return { value };
    } catch (e) {
      return { error: unavailable(describeFetchError(e), undefined, url) };
    }
  }

  private async postJson(
    url: string,
    body: Record<string, unknown>,
  ): Promise<{ value: unknown } | { error: UnavailableResult }> {
    try {
      const res = await this.fetchFn(url, {
        method: "POST",
        headers: { ...this.headers(), "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        return { error: unavailable(`CourtListener returned HTTP ${res.status}`, res.status, url) };
      }
      return { value: await res.json() };
    } catch (e) {
      return { error: unavailable(describeFetchError(e), undefined, url) };
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function unavailable(reason: string, httpStatus?: number, sourceUrl?: string): UnavailableResult {
  const r: UnavailableResult = { source: "courtlistener", status: "unavailable", reason };
  if (httpStatus !== undefined) r.http_status = httpStatus;
  if (sourceUrl !== undefined) r.source_url = sourceUrl;
  return r;
}

function describeFetchError(e: unknown): string {
  const name = (e as { name?: string })?.name ?? "";
  const msg = (e as { message?: string })?.message ?? String(e);
  if (name === "AbortError" || /timeout|abort/i.test(msg)) {
    return `CourtListener request timed out: ${msg}`;
  }
  return `CourtListener request failed (network): ${msg}`;
}

/** Resolve a CourtListener absolute_url path to a full URL. */
function absUrl(path: string | undefined): string {
  if (!path) return SITE;
  if (path.startsWith("http")) return path;
  return `${SITE}${path.startsWith("/") ? "" : "/"}${path}`;
}

/** Format the first citation of a cluster as "<vol> <reporter> <page>". */
function firstCitation(cluster: ClusterLike): string | undefined {
  const c = cluster.citations?.[0];
  if (!c || c.volume === undefined || !c.reporter || c.page === undefined) return undefined;
  return `${c.volume} ${c.reporter} ${c.page}`;
}
