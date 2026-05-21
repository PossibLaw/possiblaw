// PossibLaw — No-Op Signature connector
// Stand-in for DocuSign. Writes signature-request JSON to layer/connectors/local-signatures/.
// Always works without any credentials (tier: open-access).

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { ConnectorClient, ConnectorMetadata } from './types.js';
import { registerConnector } from './registry.js';
import { REPO_ROOT } from '../loader.js';

const SIGS_DIR = join(REPO_ROOT, 'layer', 'connectors', 'local-signatures');

function ensureDir(): void {
  if (!existsSync(SIGS_DIR)) {
    mkdirSync(SIGS_DIR, { recursive: true });
  }
}

interface SignatureRequestArgs {
  document_id: string;
  signers: string[];
  subject?: string;
}

interface SignatureStatusArgs {
  request_id: string;
}

interface SignatureRequestRecord {
  request_id: string;
  document_id: string;
  signers: string[];
  subject: string;
  status: 'pending';
  created_at: string;
}

class NoOpSignatureConnector implements ConnectorClient {
  readonly metadata: ConnectorMetadata = {
    id: 'no-op-signature',
    name: 'No-Op Signature',
    category: 'stand-in',
    tier: 'open-access',
    description: 'Stand-in for DocuSign. Writes signature-request JSON to layer/connectors/local-signatures/. Always reports status: pending. No credentials required.',
    env_vars: [],
    capabilities: ['signature.request', 'signature.status'],
  };

  isConfigured(): boolean {
    return true;
  }

  async healthcheck(): Promise<{ ok: boolean; detail: string }> {
    try {
      ensureDir();
      return { ok: true, detail: `local-signatures directory ready at ${SIGS_DIR}` };
    } catch (err: unknown) {
      return { ok: false, detail: String(err) };
    }
  }

  capabilities: Record<string, (args: unknown) => Promise<unknown>> = {
    'signature.request': async (args: unknown): Promise<SignatureRequestRecord> => {
      ensureDir();
      const { document_id, signers = [], subject = 'Signature Request' } = (args ?? {}) as SignatureRequestArgs;
      if (!document_id) throw new Error('signature.request requires args.document_id');
      const request_id = randomUUID();
      const record: SignatureRequestRecord = {
        request_id,
        document_id,
        signers,
        subject,
        status: 'pending',
        created_at: new Date().toISOString(),
      };
      writeFileSync(join(SIGS_DIR, `${request_id}.json`), JSON.stringify(record, null, 2), 'utf8');
      return record;
    },

    'signature.status': async (args: unknown): Promise<SignatureRequestRecord> => {
      ensureDir();
      const { request_id } = (args ?? {}) as SignatureStatusArgs;
      if (!request_id) throw new Error('signature.status requires args.request_id');
      const filePath = join(SIGS_DIR, `${request_id}.json`);
      if (!existsSync(filePath)) throw new Error(`Signature request not found: ${request_id}`);
      return JSON.parse(readFileSync(filePath, 'utf8')) as SignatureRequestRecord;
    },
  };
}

registerConnector(() => new NoOpSignatureConnector());
