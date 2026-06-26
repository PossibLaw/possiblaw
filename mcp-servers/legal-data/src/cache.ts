// mcp-servers/legal-data/src/cache.ts
// sha256-keyed in-memory cache. Absorbs CourtListener rate limits and makes
// repeated lookups deterministic. Keyed by the authority's documentSha256 so a
// cache hit is provably the same authority a previous fetch fingerprinted.
import type { Cache } from "./types.ts";

export class MemoryCache implements Cache {
  private readonly store = new Map<string, unknown>();

  get(key: string): unknown | undefined {
    return this.store.get(key);
  }

  set(key: string, value: unknown): void {
    this.store.set(key, value);
  }

  has(key: string): boolean {
    return this.store.has(key);
  }
}
