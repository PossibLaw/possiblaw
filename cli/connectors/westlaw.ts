// PossibLaw — Westlaw connector
// Pattern: HTTP-only (API key). Thomson Reuters Westlaw Edge API.
//
// IMPORTANT — UNCONFIRMED ENDPOINT & SCHEMA
// The base URL https://api.westlaw.com/v1/ and request/response shapes below
// are PLACEHOLDER values. The Westlaw Edge public API is only available under
// an enterprise contract with Thomson Reuters. The exact endpoint, auth scheme,
// and payload format depend on the operator's TR agreement.
// See cli/connectors/westlaw.README.md for reconciliation notes.
//
// Env: WESTLAW_API_KEY, WESTLAW_USER_ID (both required).

import type { ConnectorClient, ConnectorMetadata } from './types.js';
import { registerConnector } from './registry.js';

// UNCONFIRMED — verify with TR representative before production use.
const BASE_URL = 'https://api.westlaw.com/v1';

const REQUIRED_ENV = ['WESTLAW_API_KEY', 'WESTLAW_USER_ID'] as const;
type WestlawEnvKey = (typeof REQUIRED_ENV)[number];

function readEnv(): Record<WestlawEnvKey, string | undefined> {
  return {
    WESTLAW_API_KEY: process.env['WESTLAW_API_KEY'],
    WESTLAW_USER_ID: process.env['WESTLAW_USER_ID'],
  };
}

async function wlFetch(path: string, method: 'GET' | 'POST' = 'GET', body?: unknown): Promise<unknown> {
  const env = readEnv();
  for (const key of REQUIRED_ENV) {
    if (!env[key]) throw new Error(`${key} not set`);
  }

  const init: RequestInit = {
    method,
    headers: {
      'x-api-key': env['WESTLAW_API_KEY']!,
      'x-user-id': env['WESTLAW_USER_ID']!,
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
      `Westlaw API error: ${resp.status} ${resp.statusText}${text ? ` — ${text}` : ''}`,
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

interface CitationsKbcheckArgs {
  citation: string;
}

class WestlawConnector implements ConnectorClient {
  readonly metadata: ConnectorMetadata = {
    id: 'westlaw',
    name: 'Westlaw',
    category: 'legal',
    tier: 'paid',
    description:
      'Thomson Reuters Westlaw Edge API for case search and citation verification. UNCONFIRMED: endpoint and auth scheme require enterprise TR contract. Placeholder URL in use — see westlaw.README.md.',
    env_vars: [
      {
        name: 'WESTLAW_API_KEY',
        required: true,
        description: 'API key from Thomson Reuters developer portal (enterprise contract required)',
      },
      {
        name: 'WESTLAW_USER_ID',
        required: true,
        description: 'Westlaw user ID associated with the API credential',
      },
    ],
    capabilities: ['cases.search', 'cases.get', 'citations.kbcheck'],
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
      // UNCONFIRMED: /health is a placeholder ping path; verify with TR.
      await wlFetch('/health');
      return { ok: true, detail: 'Westlaw API reachable' };
    } catch (err: unknown) {
      return { ok: false, detail: String(err) };
    }
  }

  capabilities: Record<string, (args: unknown) => Promise<unknown>> = {
    'cases.search': async (args: unknown) => {
      const { query, jurisdiction, limit = 10 } = (args ?? {}) as CasesSearchArgs;
      if (!query) throw new Error('cases.search requires args.query');
      // UNCONFIRMED: request shape is placeholder; reconcile with TR spec.
      return wlFetch('/cases/search', 'POST', { query, jurisdiction, limit });
    },

    'cases.get': async (args: unknown) => {
      const { citation } = (args ?? {}) as CasesGetArgs;
      if (!citation) throw new Error('cases.get requires args.citation');
      const encoded = encodeURIComponent(citation);
      return wlFetch(`/cases/${encoded}`);
    },

    'citations.kbcheck': async (args: unknown) => {
      const { citation } = (args ?? {}) as CitationsKbcheckArgs;
      if (!citation) throw new Error('citations.kbcheck requires args.citation');
      // UNCONFIRMED: KeyCite equivalent endpoint name and path are placeholder.
      return wlFetch('/citations/keycite', 'POST', { citation });
    },
  };
}

registerConnector(() => new WestlawConnector());
