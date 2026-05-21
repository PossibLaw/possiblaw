// PossibLaw — DocuSign connector
// Pattern: OAuth-ish enterprise (docusign-esign npm package, JWT auth flow).
// Env: DOCUSIGN_INTEGRATION_KEY, DOCUSIGN_USER_ID, DOCUSIGN_ACCOUNT_ID,
//      DOCUSIGN_PRIVATE_KEY_PATH, DOCUSIGN_BASE_PATH (optional, default: demo).
// Reference: https://developers.docusign.com/platform/auth/jwt-get-token/

import { readFileSync, existsSync } from 'node:fs';
import type { ConnectorClient, ConnectorMetadata } from './types.js';
import { registerConnector } from './registry.js';

const DEFAULT_BASE_PATH = 'https://demo.docusign.net/restapi';

const REQUIRED_ENV: Array<keyof DocuSignEnv> = [
  'DOCUSIGN_INTEGRATION_KEY',
  'DOCUSIGN_USER_ID',
  'DOCUSIGN_ACCOUNT_ID',
  'DOCUSIGN_PRIVATE_KEY_PATH',
];

interface DocuSignEnv {
  DOCUSIGN_INTEGRATION_KEY?: string;
  DOCUSIGN_USER_ID?: string;
  DOCUSIGN_ACCOUNT_ID?: string;
  DOCUSIGN_PRIVATE_KEY_PATH?: string;
  DOCUSIGN_BASE_PATH?: string;
}

function readEnv(): DocuSignEnv {
  return {
    DOCUSIGN_INTEGRATION_KEY: process.env['DOCUSIGN_INTEGRATION_KEY'],
    DOCUSIGN_USER_ID: process.env['DOCUSIGN_USER_ID'],
    DOCUSIGN_ACCOUNT_ID: process.env['DOCUSIGN_ACCOUNT_ID'],
    DOCUSIGN_PRIVATE_KEY_PATH: process.env['DOCUSIGN_PRIVATE_KEY_PATH'],
    DOCUSIGN_BASE_PATH: process.env['DOCUSIGN_BASE_PATH'],
  };
}

async function getApiClient(): Promise<{
  envelopesApi: import('docusign-esign').EnvelopesApi;
  accountId: string;
}> {
  const env = readEnv();
  for (const key of REQUIRED_ENV) {
    if (!env[key]) throw new Error(`${key} not set`);
  }

  const { ApiClient, EnvelopesApi } = await import('docusign-esign');

  const basePath = env.DOCUSIGN_BASE_PATH ?? DEFAULT_BASE_PATH;
  const apiClient = new ApiClient({ basePath, oAuthBasePath: 'account.docusign.com' });

  // Read private key
  const pkPath = env['DOCUSIGN_PRIVATE_KEY_PATH']!;
  if (!existsSync(pkPath)) throw new Error(`Private key file not found: ${pkPath}`);
  const privateKeyBytes = readFileSync(pkPath);

  // JWT token request
  const SCOPES = ['signature', 'impersonation'];
  const tokenResult = await apiClient.requestJWTUserToken(
    env['DOCUSIGN_INTEGRATION_KEY']!,
    env['DOCUSIGN_USER_ID']!,
    SCOPES,
    privateKeyBytes,
    3600,
  );

  apiClient.addDefaultHeader('Authorization', `Bearer ${tokenResult.body.access_token}`);

  return {
    envelopesApi: new EnvelopesApi(apiClient),
    accountId: env['DOCUSIGN_ACCOUNT_ID']!,
  };
}

interface EnvelopesCreateArgs {
  email_subject: string;
  documents: Array<{ documentBase64: string; name: string; fileExtension: string; documentId: string }>;
  signers: Array<{ email: string; name: string; recipientId: string; tabs?: Record<string, unknown> }>;
}

interface EnvelopesStatusArgs {
  envelope_id: string;
}

class DocuSignConnector implements ConnectorClient {
  readonly metadata: ConnectorMetadata = {
    id: 'docusign',
    name: 'DocuSign',
    category: 'legal',
    tier: 'paid',
    description: 'E-signature via DocuSign. JWT auth flow. Use DOCUSIGN_BASE_PATH=https://demo.docusign.net/restapi for sandbox.',
    env_vars: [
      { name: 'DOCUSIGN_INTEGRATION_KEY', required: true, description: 'App integration key from DocuSign developer console' },
      { name: 'DOCUSIGN_USER_ID', required: true, description: 'DocuSign user GUID (impersonated user)' },
      { name: 'DOCUSIGN_ACCOUNT_ID', required: true, description: 'DocuSign account GUID' },
      { name: 'DOCUSIGN_PRIVATE_KEY_PATH', required: true, description: 'Absolute path to RSA private key PEM file' },
      { name: 'DOCUSIGN_BASE_PATH', required: false, description: 'API base path (default: https://demo.docusign.net/restapi)' },
    ],
    capabilities: ['envelopes.create', 'envelopes.status'],
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
      const { envelopesApi, accountId } = await getApiClient();
      // List 1 envelope as a ping
      await envelopesApi.listStatusChanges(accountId, { count: '1' });
      return { ok: true, detail: 'DocuSign JWT auth succeeded' };
    } catch (err: unknown) {
      return { ok: false, detail: String(err) };
    }
  }

  capabilities: Record<string, (args: unknown) => Promise<unknown>> = {
    'envelopes.create': async (args: unknown) => {
      const { envelopesApi, accountId } = await getApiClient();
      const { email_subject, documents, signers } = (args ?? {}) as EnvelopesCreateArgs;
      if (!email_subject) throw new Error('envelopes.create requires args.email_subject');
      if (!documents?.length) throw new Error('envelopes.create requires args.documents');
      if (!signers?.length) throw new Error('envelopes.create requires args.signers');

      const envelopeDefinition = {
        emailSubject: email_subject,
        documents,
        recipients: { signers },
        status: 'sent',
      };
      return envelopesApi.createEnvelope(accountId, { envelopeDefinition });
    },

    'envelopes.status': async (args: unknown) => {
      const { envelopesApi, accountId } = await getApiClient();
      const { envelope_id } = (args ?? {}) as EnvelopesStatusArgs;
      if (!envelope_id) throw new Error('envelopes.status requires args.envelope_id');
      return envelopesApi.getEnvelope(accountId, envelope_id, {});
    },
  };
}

registerConnector(() => new DocuSignConnector());
