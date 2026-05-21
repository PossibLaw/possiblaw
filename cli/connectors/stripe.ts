// PossibLaw — Stripe connector
// Pattern: official SDK (stripe npm package).
// Env: STRIPE_API_KEY (required). Use test key sk_test_... for dev.
// Reference: https://stripe.com/docs/api

import type { ConnectorClient, ConnectorMetadata } from './types.js';
import { registerConnector } from './registry.js';

// Dynamic import so the module loads even if stripe is not installed yet
// (fails only when isConfigured() is true and a capability is invoked).
async function getStripe(): Promise<import('stripe').default> {
  const apiKey = process.env['STRIPE_API_KEY'];
  if (!apiKey) throw new Error('STRIPE_API_KEY not set');
  const { default: Stripe } = await import('stripe');
  return new Stripe(apiKey);
}

interface CustomersListArgs {
  limit?: number;
}

interface CustomersCreateArgs {
  email: string;
  name?: string;
  description?: string;
}

interface InvoicesCreateArgs {
  customer: string;
  auto_advance?: boolean;
}

interface PaymentLinksCreateArgs {
  line_items: Array<{ price: string; quantity: number }>;
}

class StripeConnector implements ConnectorClient {
  readonly metadata: ConnectorMetadata = {
    id: 'stripe',
    name: 'Stripe',
    category: 'business',
    tier: 'open-access',
    description: 'Payments + invoicing + customers. Use for invoice generation, AR follow-up, refunds. Stripe has a free dev tier (test mode).',
    env_vars: [
      {
        name: 'STRIPE_API_KEY',
        required: true,
        description: 'From https://dashboard.stripe.com/apikeys — use test key sk_test_... for dev',
      },
    ],
    capabilities: ['customers.list', 'customers.create', 'invoices.create', 'payment_links.create'],
  };

  isConfigured(): boolean {
    return Boolean(process.env['STRIPE_API_KEY']);
  }

  async healthcheck(): Promise<{ ok: boolean; detail: string }> {
    if (!this.isConfigured()) {
      return { ok: false, detail: 'STRIPE_API_KEY not set' };
    }
    try {
      const stripe = await getStripe();
      const list = await stripe.customers.list({ limit: 1 });
      return { ok: true, detail: `Stripe reachable — has_more: ${list.has_more}` };
    } catch (err: unknown) {
      return { ok: false, detail: String(err) };
    }
  }

  capabilities: Record<string, (args: unknown) => Promise<unknown>> = {
    'customers.list': async (args: unknown) => {
      const stripe = await getStripe();
      const { limit = 10 } = (args ?? {}) as CustomersListArgs;
      return stripe.customers.list({ limit });
    },

    'customers.create': async (args: unknown) => {
      const stripe = await getStripe();
      const { email, name, description } = (args ?? {}) as CustomersCreateArgs;
      if (!email) throw new Error('customers.create requires args.email');
      return stripe.customers.create({ email, name, description });
    },

    'invoices.create': async (args: unknown) => {
      const stripe = await getStripe();
      const { customer, auto_advance = false } = (args ?? {}) as InvoicesCreateArgs;
      if (!customer) throw new Error('invoices.create requires args.customer');
      return stripe.invoices.create({ customer, auto_advance });
    },

    'payment_links.create': async (args: unknown) => {
      const stripe = await getStripe();
      const { line_items } = (args ?? {}) as PaymentLinksCreateArgs;
      if (!line_items?.length) throw new Error('payment_links.create requires args.line_items');
      return stripe.paymentLinks.create({ line_items });
    },
  };
}

registerConnector(() => new StripeConnector());
