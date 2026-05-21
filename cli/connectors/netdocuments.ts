// PossibLaw — NetDocuments connector
// Pattern: HTTP-only (OAuth bearer token). NetDocuments REST API v2.
// Env: NETDOCS_HOST, NETDOCS_REPOSITORY_ID, NETDOCS_OAUTH_TOKEN (all required).
// Reference: https://api.netdocuments.com/v2/

import type { ConnectorClient, ConnectorMetadata } from './types.js';
import { registerConnector } from './registry.js';

const REQUIRED_ENV = [
  'NETDOCS_HOST',
  'NETDOCS_REPOSITORY_ID',
  'NETDOCS_OAUTH_TOKEN',
] as const;
type NetDocsEnvKey = (typeof REQUIRED_ENV)[number];

function readEnv(): Record<NetDocsEnvKey, string | undefined> {
  return {
    NETDOCS_HOST: process.env['NETDOCS_HOST'],
    NETDOCS_REPOSITORY_ID: process.env['NETDOCS_REPOSITORY_ID'],
    NETDOCS_OAUTH_TOKEN: process.env['NETDOCS_OAUTH_TOKEN'],
  };
}

async function ndFetch(
  path: string,
  method: 'GET' | 'PUT' = 'GET',
  body?: unknown,
): Promise<unknown> {
  const env = readEnv();
  for (const key of REQUIRED_ENV) {
    if (!env[key]) throw new Error(`${key} not set`);
  }

  const host = env['NETDOCS_HOST']!.replace(/\/$/, '');
  const init: RequestInit = {
    method,
    headers: {
      Authorization: `Bearer ${env['NETDOCS_OAUTH_TOKEN']!}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
  };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
  }

  const resp = await fetch(`${host}/v2${path}`, init);
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(
      `NetDocuments API error: ${resp.status} ${resp.statusText}${text ? ` — ${text}` : ''}`,
    );
  }
  return resp.json() as Promise<unknown>;
}

interface DocumentsListArgs {
  workspace_id?: string;
  limit?: number;
}

interface DocumentsGetArgs {
  doc_id: string;
}

interface DocumentsPutArgs {
  doc_id: string;
  content: unknown;
}

interface WorkspacesListArgs {
  limit?: number;
}

class NetDocumentsConnector implements ConnectorClient {
  readonly metadata: ConnectorMetadata = {
    id: 'netdocuments',
    name: 'NetDocuments',
    category: 'legal',
    tier: 'paid',
    description:
      'NetDocuments cloud DMS for law firms. REST API v2. Requires NetDocuments account with API access and OAuth credentials.',
    env_vars: [
      {
        name: 'NETDOCS_HOST',
        required: true,
        description:
          'NetDocuments API host (default: https://api.netdocuments.com; region-specific variants exist)',
      },
      {
        name: 'NETDOCS_REPOSITORY_ID',
        required: true,
        description: 'NetDocuments repository/cabinet ID for document operations',
      },
      {
        name: 'NETDOCS_OAUTH_TOKEN',
        required: true,
        description:
          'OAuth 2.0 access token. Obtain via NetDocuments OAuth 2.0 authorization code flow.',
      },
    ],
    capabilities: ['documents.list', 'documents.get', 'documents.put', 'workspaces.list'],
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
      const repoId = process.env['NETDOCS_REPOSITORY_ID']!;
      await ndFetch(`/repositories/${repoId}`);
      return { ok: true, detail: `NetDocuments repository '${repoId}' reachable` };
    } catch (err: unknown) {
      return { ok: false, detail: String(err) };
    }
  }

  capabilities: Record<string, (args: unknown) => Promise<unknown>> = {
    'documents.list': async (args: unknown) => {
      const { workspace_id, limit = 20 } = (args ?? {}) as DocumentsListArgs;
      const repoId = process.env['NETDOCS_REPOSITORY_ID']!;
      const qs = new URLSearchParams({ limit: String(limit) });
      if (workspace_id) qs.set('workspace_id', workspace_id);
      return ndFetch(`/repositories/${repoId}/documents?${qs}`);
    },

    'documents.get': async (args: unknown) => {
      const { doc_id } = (args ?? {}) as DocumentsGetArgs;
      if (!doc_id) throw new Error('documents.get requires args.doc_id');
      const repoId = process.env['NETDOCS_REPOSITORY_ID']!;
      return ndFetch(`/repositories/${repoId}/documents/${doc_id}`);
    },

    'documents.put': async (args: unknown) => {
      const { doc_id, content } = (args ?? {}) as DocumentsPutArgs;
      if (!doc_id) throw new Error('documents.put requires args.doc_id');
      const repoId = process.env['NETDOCS_REPOSITORY_ID']!;
      return ndFetch(`/repositories/${repoId}/documents/${doc_id}`, 'PUT', content);
    },

    'workspaces.list': async (args: unknown) => {
      const { limit = 20 } = (args ?? {}) as WorkspacesListArgs;
      const repoId = process.env['NETDOCS_REPOSITORY_ID']!;
      return ndFetch(`/repositories/${repoId}/workspaces?limit=${limit}`);
    },
  };
}

registerConnector(() => new NetDocumentsConnector());
