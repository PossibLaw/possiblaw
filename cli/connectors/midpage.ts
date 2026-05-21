// PossibLaw — midpage connector
// Pattern: HTTP-only (plain fetch with Bearer token).
// midpage.ai is a legal AI tool for brief research and drafting.
//
// IMPORTANT — UNCONFIRMED SCHEMA
// The REST endpoint and request/response shapes below are *anticipated* based on
// midpage's public marketing material as of 2026-05-20. midpage has not published
// a formal public API spec. Before using this connector in production:
//   1. Contact midpage at https://midpage.ai to request API access.
//   2. Verify the base URL: currently assumed https://api.midpage.ai/v1/
//   3. Reconcile request/response shapes with the actual API spec.
// See cli/connectors/midpage.README.md for full reconciliation notes.
//
// Env: MIDPAGE_API_KEY (required).

import type { ConnectorClient, ConnectorMetadata } from './types.js';
import { registerConnector } from './registry.js';

const BASE_URL = 'https://api.midpage.ai/v1';

async function mpFetch(
  path: string,
  method: 'GET' | 'POST' = 'GET',
  body?: unknown,
): Promise<unknown> {
  const apiKey = process.env['MIDPAGE_API_KEY'];
  if (!apiKey) throw new Error('MIDPAGE_API_KEY not set');

  const init: RequestInit = {
    method,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
  };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
  }

  const resp = await fetch(`${BASE_URL}${path}`, init);
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`midpage API error: ${resp.status} ${resp.statusText}${text ? ` — ${text}` : ''}`);
  }
  return resp.json() as Promise<unknown>;
}

interface BriefsListArgs {
  limit?: number;
  offset?: number;
}

interface BriefsGetArgs {
  id: string;
}

interface BriefsCreateArgs {
  title: string;
  matter_description: string;
  jurisdiction?: string;
}

class MidpageConnector implements ConnectorClient {
  readonly metadata: ConnectorMetadata = {
    id: 'midpage',
    name: 'midpage',
    category: 'legal',
    tier: 'paid',
    description: 'Legal AI tool for brief research and drafting. Contact midpage.ai for API access. UNCONFIRMED: API schema is anticipated — verify with midpage before production use.',
    env_vars: [
      {
        name: 'MIDPAGE_API_KEY',
        required: true,
        description: 'API key from midpage.ai — contact them for access',
      },
    ],
    capabilities: ['briefs.list', 'briefs.get', 'briefs.create'],
  };

  isConfigured(): boolean {
    return Boolean(process.env['MIDPAGE_API_KEY']);
  }

  async healthcheck(): Promise<{ ok: boolean; detail: string }> {
    if (!this.isConfigured()) {
      return { ok: false, detail: 'MIDPAGE_API_KEY not set' };
    }
    try {
      await mpFetch('/briefs', 'GET');
      return { ok: true, detail: 'midpage API reachable' };
    } catch (err: unknown) {
      return { ok: false, detail: String(err) };
    }
  }

  capabilities: Record<string, (args: unknown) => Promise<unknown>> = {
    'briefs.list': async (args: unknown) => {
      const { limit = 20, offset = 0 } = (args ?? {}) as BriefsListArgs;
      return mpFetch(`/briefs?limit=${limit}&offset=${offset}`);
    },

    'briefs.get': async (args: unknown) => {
      const { id } = (args ?? {}) as BriefsGetArgs;
      if (!id) throw new Error('briefs.get requires args.id');
      return mpFetch(`/briefs/${id}`);
    },

    'briefs.create': async (args: unknown) => {
      const { title, matter_description, jurisdiction } = (args ?? {}) as BriefsCreateArgs;
      if (!title) throw new Error('briefs.create requires args.title');
      if (!matter_description) throw new Error('briefs.create requires args.matter_description');
      return mpFetch('/briefs', 'POST', { title, matter_description, jurisdiction });
    },
  };
}

registerConnector(() => new MidpageConnector());
