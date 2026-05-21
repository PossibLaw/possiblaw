// PossibLaw — Local FS Document Store connector
// Stand-in for iManage / NetDocuments. Backed by layer/connectors/local-docs/.
// Always works without any credentials (tier: open-access).

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ConnectorClient, ConnectorMetadata } from './types.js';
import { registerConnector } from './registry.js';
import { REPO_ROOT } from '../loader.js';

const DOCS_DIR = join(REPO_ROOT, 'layer', 'connectors', 'local-docs');

function ensureDir(): void {
  if (!existsSync(DOCS_DIR)) {
    mkdirSync(DOCS_DIR, { recursive: true });
  }
}

interface DocumentsListArgs {
  prefix?: string;
}

interface DocumentsGetArgs {
  id: string;
}

interface DocumentsPutArgs {
  id: string;
  content: string;
}

interface DocumentRecord {
  id: string;
  size: number;
}

interface DocumentContent {
  id: string;
  content: string;
}

class LocalFsDocStoreConnector implements ConnectorClient {
  readonly metadata: ConnectorMetadata = {
    id: 'local-fs-doc-store',
    name: 'Local FS Doc Store',
    category: 'stand-in',
    tier: 'open-access',
    description: 'Stand-in for iManage / NetDocuments. Reads and writes plain files under layer/connectors/local-docs/. No credentials required.',
    env_vars: [],
    capabilities: ['documents.list', 'documents.get', 'documents.put'],
  };

  isConfigured(): boolean {
    return true;
  }

  async healthcheck(): Promise<{ ok: boolean; detail: string }> {
    try {
      ensureDir();
      return { ok: true, detail: `local-docs directory ready at ${DOCS_DIR}` };
    } catch (err: unknown) {
      return { ok: false, detail: String(err) };
    }
  }

  capabilities: Record<string, (args: unknown) => Promise<unknown>> = {
    'documents.list': async (args: unknown): Promise<DocumentRecord[]> => {
      ensureDir();
      const { prefix = '' } = (args ?? {}) as DocumentsListArgs;
      const files = readdirSync(DOCS_DIR).filter((f) => f.startsWith(prefix));
      return files.map((f) => ({ id: f, size: readFileSync(join(DOCS_DIR, f)).length }));
    },

    'documents.get': async (args: unknown): Promise<DocumentContent> => {
      ensureDir();
      const { id } = (args ?? {}) as DocumentsGetArgs;
      if (!id) throw new Error('documents.get requires args.id');
      const filePath = join(DOCS_DIR, id);
      if (!existsSync(filePath)) throw new Error(`Document not found: ${id}`);
      return { id, content: readFileSync(filePath, 'utf8') };
    },

    'documents.put': async (args: unknown): Promise<{ id: string; written: boolean }> => {
      ensureDir();
      const { id, content } = (args ?? {}) as DocumentsPutArgs;
      if (!id) throw new Error('documents.put requires args.id');
      if (content === undefined) throw new Error('documents.put requires args.content');
      writeFileSync(join(DOCS_DIR, id), content, 'utf8');
      return { id, written: true };
    },
  };
}

registerConnector(() => new LocalFsDocStoreConnector());
