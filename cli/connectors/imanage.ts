// PossibLaw — iManage connector
// Pattern: HTTP-only (Bearer token). iManage Work API v2.
// Env: IMANAGE_HOST, IMANAGE_LIBRARY, IMANAGE_TOKEN (all required).
// Reference: https://cloudimanage.com/work/api/v2/
// See cli/connectors/imanage.README.md for OAuth flow documentation.

import type { ConnectorClient, ConnectorMetadata } from './types.js';
import { registerConnector } from './registry.js';

const REQUIRED_ENV = ['IMANAGE_HOST', 'IMANAGE_LIBRARY', 'IMANAGE_TOKEN'] as const;
type IManageEnvKey = (typeof REQUIRED_ENV)[number];

function readEnv(): Record<IManageEnvKey, string | undefined> {
  return {
    IMANAGE_HOST: process.env['IMANAGE_HOST'],
    IMANAGE_LIBRARY: process.env['IMANAGE_LIBRARY'],
    IMANAGE_TOKEN: process.env['IMANAGE_TOKEN'],
  };
}

async function imFetch(
  path: string,
  method: 'GET' | 'PUT' = 'GET',
  body?: unknown,
): Promise<unknown> {
  const env = readEnv();
  for (const key of REQUIRED_ENV) {
    if (!env[key]) throw new Error(`${key} not set`);
  }

  const host = env['IMANAGE_HOST']!.replace(/\/$/, '');
  const init: RequestInit = {
    method,
    headers: {
      Authorization: `Bearer ${env['IMANAGE_TOKEN']!}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
  };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
  }

  const resp = await fetch(`${host}/work/api/v2${path}`, init);
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(
      `iManage API error: ${resp.status} ${resp.statusText}${text ? ` — ${text}` : ''}`,
    );
  }
  return resp.json() as Promise<unknown>;
}

interface DocumentsListArgs {
  folder_id?: string;
  limit?: number;
}

interface DocumentsGetArgs {
  doc_id: string;
}

interface DocumentsPutArgs {
  doc_id: string;
  content: unknown;
}

interface FoldersListArgs {
  workspace_id?: string;
}

class IManageConnector implements ConnectorClient {
  readonly metadata: ConnectorMetadata = {
    id: 'imanage',
    name: 'iManage',
    category: 'legal',
    tier: 'paid',
    description:
      'iManage Work document management system. Enterprise DMS for law firms. Requires iManage Work API v2 access. See imanage.README.md for OAuth setup.',
    env_vars: [
      {
        name: 'IMANAGE_HOST',
        required: true,
        description: 'iManage Work host URL (e.g. https://yourfirm.cloudimanage.com)',
      },
      {
        name: 'IMANAGE_LIBRARY',
        required: true,
        description: 'iManage library name (e.g. ACTIVE)',
      },
      {
        name: 'IMANAGE_TOKEN',
        required: true,
        description: 'Bearer token (or OAuth access token). See imanage.README.md for flows.',
      },
    ],
    capabilities: ['documents.list', 'documents.get', 'documents.put', 'folders.list'],
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
      const library = process.env['IMANAGE_LIBRARY']!;
      await imFetch(`/libraries/${library}`);
      return { ok: true, detail: `iManage library '${library}' reachable` };
    } catch (err: unknown) {
      return { ok: false, detail: String(err) };
    }
  }

  capabilities: Record<string, (args: unknown) => Promise<unknown>> = {
    'documents.list': async (args: unknown) => {
      const { folder_id, limit = 20 } = (args ?? {}) as DocumentsListArgs;
      const library = process.env['IMANAGE_LIBRARY']!;
      const base = `/libraries/${library}/documents`;
      const qs = new URLSearchParams({ limit: String(limit) });
      if (folder_id) qs.set('folder_id', folder_id);
      return imFetch(`${base}?${qs}`);
    },

    'documents.get': async (args: unknown) => {
      const { doc_id } = (args ?? {}) as DocumentsGetArgs;
      if (!doc_id) throw new Error('documents.get requires args.doc_id');
      const library = process.env['IMANAGE_LIBRARY']!;
      return imFetch(`/libraries/${library}/documents/${doc_id}`);
    },

    'documents.put': async (args: unknown) => {
      const { doc_id, content } = (args ?? {}) as DocumentsPutArgs;
      if (!doc_id) throw new Error('documents.put requires args.doc_id');
      const library = process.env['IMANAGE_LIBRARY']!;
      return imFetch(`/libraries/${library}/documents/${doc_id}`, 'PUT', content);
    },

    'folders.list': async (args: unknown) => {
      const { workspace_id } = (args ?? {}) as FoldersListArgs;
      const library = process.env['IMANAGE_LIBRARY']!;
      const base = `/libraries/${library}/folders`;
      const qs = new URLSearchParams();
      if (workspace_id) qs.set('workspace_id', workspace_id);
      const query = qs.toString();
      return imFetch(query ? `${base}?${query}` : base);
    },
  };
}

registerConnector(() => new IManageConnector());
