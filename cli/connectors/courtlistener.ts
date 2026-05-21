// PossibLaw — CourtListener connector
// Stand-in for Westlaw / Lexis. Uses CourtListener's free public REST API v4.
// No API key required for low-volume access.
// Reference: https://www.courtlistener.com/help/api/

import type { ConnectorClient, ConnectorMetadata } from './types.js';
import { registerConnector } from './registry.js';

const BASE_URL = 'https://www.courtlistener.com/api/rest/v4';

interface CasesSearchArgs {
  q: string;
  page_size?: number;
}

interface CasesGetArgs {
  id: string | number;
}

interface CourtListenerOpinion {
  id: number;
  absolute_url: string;
  case_name?: string;
  caseName?: string;
  [key: string]: unknown;
}

interface CourtListenerSearchResult {
  count: number;
  next: string | null;
  previous: string | null;
  results: CourtListenerOpinion[];
}

async function clFetch(path: string, params: Record<string, string> = {}): Promise<unknown> {
  const url = new URL(`${BASE_URL}${path}`);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  const resp = await fetch(url.toString(), {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'possiblaw/0.0.1 (https://github.com/possiblaw/possiblaw)',
    },
  });
  if (resp.status === 429) {
    throw new Error('CourtListener rate limit reached. Retry after a moment.');
  }
  if (!resp.ok) {
    throw new Error(`CourtListener API error: ${resp.status} ${resp.statusText}`);
  }
  return resp.json() as Promise<unknown>;
}

class CourtListenerConnector implements ConnectorClient {
  readonly metadata: ConnectorMetadata = {
    id: 'courtlistener',
    name: 'CourtListener',
    category: 'stand-in',
    tier: 'open-access',
    description: 'Stand-in for Westlaw / Lexis. Uses CourtListener free public API (https://www.courtlistener.com/api/rest/v4/). No API key required for low-volume access. Falls back gracefully on rate limit.',
    env_vars: [
      {
        name: 'COURTLISTENER_API_KEY',
        required: false,
        description: 'Optional API key for higher rate limits. Create free account at courtlistener.com.',
      },
    ],
    capabilities: ['cases.search', 'cases.get'],
  };

  isConfigured(): boolean {
    return true; // always works; key is optional
  }

  async healthcheck(): Promise<{ ok: boolean; detail: string }> {
    try {
      // Use /search/ endpoint — works without auth for low-volume access
      const result = await clFetch('/search/', { q: 'contract', page_size: '1' }) as CourtListenerSearchResult;
      return {
        ok: true,
        detail: `CourtListener reachable — ${result.count} total opinions indexed`,
      };
    } catch (err: unknown) {
      return { ok: false, detail: String(err) };
    }
  }

  capabilities: Record<string, (args: unknown) => Promise<unknown>> = {
    'cases.search': async (args: unknown): Promise<CourtListenerSearchResult> => {
      const { q, page_size = 10 } = (args ?? {}) as CasesSearchArgs;
      if (!q) throw new Error('cases.search requires args.q');
      const params: Record<string, string> = {
        q,
        page_size: String(page_size),
      };
      const apiKey = process.env['COURTLISTENER_API_KEY'];
      if (apiKey) params['Authorization'] = `Token ${apiKey}`;
      // /search/ is the public full-text search endpoint (no auth required for low-volume)
      return clFetch('/search/', params) as Promise<CourtListenerSearchResult>;
    },

    'cases.get': async (args: unknown): Promise<CourtListenerOpinion> => {
      const { id } = (args ?? {}) as CasesGetArgs;
      if (!id) throw new Error('cases.get requires args.id');
      // /clusters/ is the public case cluster endpoint (no auth required for low-volume)
      return clFetch(`/clusters/${id}/`) as Promise<CourtListenerOpinion>;
    },
  };
}

registerConnector(() => new CourtListenerConnector());
