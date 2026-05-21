// PossibLaw — Lexis connector
// Pattern: HTTP-only (API key). LexisNexis API.
//
// IMPORTANT — UNCONFIRMED ENDPOINT & SCHEMA
// The base URL https://api.lexis.com/v1/ and request/response shapes below
// are PLACEHOLDER values. LexisNexis API access is product-specific and
// requires an enterprise contract. The exact endpoint, auth scheme, and
// payload format depend on the operator's LexisNexis product agreement.
// See cli/connectors/lexis.README.md for reconciliation notes.
//
// Env: LEXIS_API_KEY, LEXIS_USER_ID (both required).

import type { ConnectorClient, ConnectorMetadata } from './types.js';
import { registerConnector } from './registry.js';

// UNCONFIRMED — verify with LexisNexis representative before production use.
const BASE_URL = 'https://api.lexis.com/v1';

const REQUIRED_ENV = ['LEXIS_API_KEY', 'LEXIS_USER_ID'] as const;
type LexisEnvKey = (typeof REQUIRED_ENV)[number];

function readEnv(): Record<LexisEnvKey, string | undefined> {
  return {
    LEXIS_API_KEY: process.env['LEXIS_API_KEY'],
    LEXIS_USER_ID: process.env['LEXIS_USER_ID'],
  };
}

async function lxFetch(path: string, method: 'GET' | 'POST' = 'GET', body?: unknown): Promise<unknown> {
  const env = readEnv();
  for (const key of REQUIRED_ENV) {
    if (!env[key]) throw new Error(`${key} not set`);
  }

  const init: RequestInit = {
    method,
    headers: {
      'x-api-key': env['LEXIS_API_KEY']!,
      'x-user-id': env['LEXIS_USER_ID']!,
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
    throw new Error(
      `Lexis API error: ${resp.status} ${resp.statusText}${text ? ` — ${text}` : ''}`,
    );
  }
  return resp.json() as Promise<unknown>;
}

interface CasesSearchArgs {
  query: string;
  jurisdiction?: string;
  limit?: number;
}

interface CasesGetArgs {
  citation: string;
}

interface CitationsShepardizeArgs {
  citation: string;
}

class LexisConnector implements ConnectorClient {
  readonly metadata: ConnectorMetadata = {
    id: 'lexis',
    name: 'Lexis',
    category: 'legal',
    tier: 'paid',
    description:
      'LexisNexis API for case search and Shepard\'s citation verification. UNCONFIRMED: endpoint and auth scheme require enterprise LexisNexis contract. Placeholder URL in use — see lexis.README.md.',
    env_vars: [
      {
        name: 'LEXIS_API_KEY',
        required: true,
        description: 'API key from LexisNexis developer portal (enterprise contract required)',
      },
      {
        name: 'LEXIS_USER_ID',
        required: true,
        description: 'LexisNexis user ID associated with the API credential',
      },
    ],
    capabilities: ['cases.search', 'cases.get', 'citations.shepardize'],
  };

  isConfigured(): boolean {
    const env = readEnv();
    return REQUIRED_ENV.every((k) => Boolean(env[k]));
  }

  async healthcheck(): Promise<{ ok: boolean; detail: string }> {
    if (!this.isConfigured()) {
      const missing = REQUIRED_ENV.filter((k) => !readEnv()[k]);
      return { ok: false, detail: `Missing env vars: ${missing.join(', ')}` };
    }
    try {
      // UNCONFIRMED: /health is a placeholder ping path; verify with LexisNexis.
      await lxFetch('/health');
      return { ok: true, detail: 'Lexis API reachable' };
    } catch (err: unknown) {
      return { ok: false, detail: String(err) };
    }
  }

  capabilities: Record<string, (args: unknown) => Promise<unknown>> = {
    'cases.search': async (args: unknown) => {
      const { query, jurisdiction, limit = 10 } = (args ?? {}) as CasesSearchArgs;
      if (!query) throw new Error('cases.search requires args.query');
      // UNCONFIRMED: request shape is placeholder; reconcile with LexisNexis spec.
      return lxFetch('/cases/search', 'POST', { query, jurisdiction, limit });
    },

    'cases.get': async (args: unknown) => {
      const { citation } = (args ?? {}) as CasesGetArgs;
      if (!citation) throw new Error('cases.get requires args.citation');
      const encoded = encodeURIComponent(citation);
      return lxFetch(`/cases/${encoded}`);
    },

    'citations.shepardize': async (args: unknown) => {
      const { citation } = (args ?? {}) as CitationsShepardizeArgs;
      if (!citation) throw new Error('citations.shepardize requires args.citation');
      // UNCONFIRMED: Shepard's endpoint name and path are placeholder.
      return lxFetch('/citations/shepards', 'POST', { citation });
    },
  };
}

registerConnector(() => new LexisConnector());
