// PossibLaw — QuickBooks connector
// Pattern: official SDK (node-quickbooks npm package).
// Env: QB_CONSUMER_KEY, QB_CONSUMER_SECRET, QB_TOKEN, QB_TOKEN_SECRET,
//      QB_REALM_ID, QB_USE_SANDBOX (default: true for dev).
// Reference: https://developer.intuit.com/app/developer/qbo/docs/develop

import type { ConnectorClient, ConnectorMetadata } from './types.js';
import { registerConnector } from './registry.js';

const REQUIRED_ENV = [
  'QB_CONSUMER_KEY',
  'QB_CONSUMER_SECRET',
  'QB_TOKEN',
  'QB_TOKEN_SECRET',
  'QB_REALM_ID',
] as const;
type QBEnvKey = (typeof REQUIRED_ENV)[number];

interface QBEnvMap {
  QB_CONSUMER_KEY?: string;
  QB_CONSUMER_SECRET?: string;
  QB_TOKEN?: string;
  QB_TOKEN_SECRET?: string;
  QB_REALM_ID?: string;
  QB_USE_SANDBOX?: string;
}

function readEnv(): QBEnvMap {
  return {
    QB_CONSUMER_KEY: process.env['QB_CONSUMER_KEY'],
    QB_CONSUMER_SECRET: process.env['QB_CONSUMER_SECRET'],
    QB_TOKEN: process.env['QB_TOKEN'],
    QB_TOKEN_SECRET: process.env['QB_TOKEN_SECRET'],
    QB_REALM_ID: process.env['QB_REALM_ID'],
    QB_USE_SANDBOX: process.env['QB_USE_SANDBOX'],
  };
}

type QBCallback<T> = (err: unknown, result: T) => void;

function promisify<T>(
  fn: (callback: QBCallback<T>) => void,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    fn((err: unknown, result: T) => {
      if (err) reject(err);
      else resolve(result);
    });
  });
}

// node-quickbooks ships its own .d.ts — use the class instance type via a typeof trick.
type QBClientModule = typeof import('node-quickbooks');
type QBInstance = InstanceType<QBClientModule['default']>;

async function getQBClient(): Promise<QBInstance> {
  const env = readEnv();
  for (const key of REQUIRED_ENV) {
    if (!env[key as QBEnvKey]) throw new Error(`${key} not set`);
  }

  const mod = await import('node-quickbooks');
  // node-quickbooks is CommonJS; ESM interop places the constructor at mod.default
  // or at the module namespace itself. Cast through unknown to satisfy the strict type.
  const QBCtor = ((mod.default ?? mod) as unknown) as QBClientModule['default'];
  const useSandbox = env.QB_USE_SANDBOX !== 'false'; // default true for dev
  return new QBCtor(
    env.QB_CONSUMER_KEY!,
    env.QB_CONSUMER_SECRET!,
    env.QB_TOKEN!,
    env.QB_TOKEN_SECRET!,
    env.QB_REALM_ID!,
    useSandbox,
  );
}

interface CustomersListArgs {
  limit?: number;
}

interface InvoicesCreateArgs {
  customer_ref: string;
  line_items: Array<{ description: string; amount: number }>;
}

interface InvoicesListArgs {
  limit?: number;
}

interface AccountsListArgs {
  limit?: number;
}

class QuickBooksConnector implements ConnectorClient {
  readonly metadata: ConnectorMetadata = {
    id: 'quickbooks',
    name: 'QuickBooks',
    category: 'business',
    tier: 'open-access',
    description:
      'Intuit QuickBooks Online via node-quickbooks SDK. Free Intuit Developer sandbox available. Use QB_USE_SANDBOX=true (default) for dev.',
    env_vars: [
      {
        name: 'QB_CONSUMER_KEY',
        required: true,
        description: 'OAuth 1.0a consumer key from Intuit Developer portal',
      },
      {
        name: 'QB_CONSUMER_SECRET',
        required: true,
        description: 'OAuth 1.0a consumer secret from Intuit Developer portal',
      },
      {
        name: 'QB_TOKEN',
        required: true,
        description: 'OAuth 1.0a access token',
      },
      {
        name: 'QB_TOKEN_SECRET',
        required: true,
        description: 'OAuth 1.0a access token secret',
      },
      {
        name: 'QB_REALM_ID',
        required: true,
        description: 'QuickBooks Online company ID (realm ID)',
      },
      {
        name: 'QB_USE_SANDBOX',
        required: false,
        description: 'Set to "false" to use production. Default: true (sandbox mode).',
      },
    ],
    capabilities: ['customers.list', 'invoices.create', 'invoices.list', 'accounts.list'],
  };

  isConfigured(): boolean {
    const env = readEnv();
    return REQUIRED_ENV.every((k) => Boolean(env[k as QBEnvKey]));
  }

  async healthcheck(): Promise<{ ok: boolean; detail: string }> {
    if (!this.isConfigured()) {
      const env = readEnv();
      const missing = REQUIRED_ENV.filter((k) => !env[k as QBEnvKey]);
      return { ok: false, detail: `Missing env vars: ${missing.join(', ')}` };
    }
    try {
      const qb = await getQBClient();
      await promisify<unknown>((cb) => qb.findCustomers({ limit: 1 }, cb as QBCallback<unknown>));
      return { ok: true, detail: 'QuickBooks API reachable' };
    } catch (err: unknown) {
      return { ok: false, detail: String(err) };
    }
  }

  capabilities: Record<string, (args: unknown) => Promise<unknown>> = {
    'customers.list': async (args: unknown) => {
      const qb = await getQBClient();
      const { limit = 20 } = (args ?? {}) as CustomersListArgs;
      return promisify<unknown>((cb) => qb.findCustomers({ limit }, cb as QBCallback<unknown>));
    },

    'invoices.create': async (args: unknown) => {
      const qb = await getQBClient();
      const { customer_ref, line_items } = (args ?? {}) as InvoicesCreateArgs;
      if (!customer_ref) throw new Error('invoices.create requires args.customer_ref');
      if (!line_items?.length) throw new Error('invoices.create requires args.line_items');

      const invoice = {
        CustomerRef: { value: customer_ref },
        Line: line_items.map((li, i) => ({
          Id: String(i + 1),
          LineNum: i + 1,
          Description: li.description,
          Amount: li.amount,
          DetailType: 'SalesItemLineDetail' as const,
          SalesItemLineDetail: { ItemRef: { value: '1', name: 'Services' } },
        })),
      };
      return promisify<unknown>((cb) => qb.createInvoice(invoice as Parameters<typeof qb.createInvoice>[0], cb as QBCallback<unknown>));
    },

    'invoices.list': async (args: unknown) => {
      const qb = await getQBClient();
      const { limit = 20 } = (args ?? {}) as InvoicesListArgs;
      return promisify<unknown>((cb) => qb.findInvoices({ limit }, cb as QBCallback<unknown>));
    },

    'accounts.list': async (args: unknown) => {
      const qb = await getQBClient();
      const { limit = 20 } = (args ?? {}) as AccountsListArgs;
      return promisify<unknown>((cb) => qb.findAccounts({ limit }, cb as QBCallback<unknown>));
    },
  };
}

registerConnector(() => new QuickBooksConnector());
