// PossibLaw — HubSpot connector
// Pattern: official SDK (@hubspot/api-client).
// Env: HUBSPOT_ACCESS_TOKEN (required). Free HubSpot developer account available.
// Reference: https://developers.hubspot.com/docs/api/overview

import type { ConnectorClient, ConnectorMetadata } from './types.js';
import { registerConnector } from './registry.js';

async function getHubSpotClient(): Promise<import('@hubspot/api-client').Client> {
  const token = process.env['HUBSPOT_ACCESS_TOKEN'];
  if (!token) throw new Error('HUBSPOT_ACCESS_TOKEN not set');
  const { Client } = await import('@hubspot/api-client');
  return new Client({ accessToken: token });
}

interface ContactsListArgs {
  limit?: number;
}

interface ContactsCreateArgs {
  email: string;
  firstname?: string;
  lastname?: string;
  company?: string;
}

interface CompaniesListArgs {
  limit?: number;
}

interface DealsCreateArgs {
  dealname: string;
  amount?: number;
  closedate?: string;
  pipeline?: string;
  dealstage?: string;
}

class HubSpotConnector implements ConnectorClient {
  readonly metadata: ConnectorMetadata = {
    id: 'hubspot',
    name: 'HubSpot',
    category: 'business',
    tier: 'open-access',
    description:
      'HubSpot CRM via official @hubspot/api-client SDK. Free developer account available at https://developers.hubspot.com. Use private app access tokens.',
    env_vars: [
      {
        name: 'HUBSPOT_ACCESS_TOKEN',
        required: true,
        description:
          'Private app access token from HubSpot portal. Create at: Settings → Integrations → Private Apps.',
      },
    ],
    capabilities: ['contacts.list', 'contacts.create', 'companies.list', 'deals.create'],
  };

  isConfigured(): boolean {
    return Boolean(process.env['HUBSPOT_ACCESS_TOKEN']);
  }

  async healthcheck(): Promise<{ ok: boolean; detail: string }> {
    if (!this.isConfigured()) {
      return { ok: false, detail: 'HUBSPOT_ACCESS_TOKEN not set' };
    }
    try {
      const hs = await getHubSpotClient();
      const result = await hs.crm.contacts.basicApi.getPage(1);
      return {
        ok: true,
        detail: `HubSpot reachable — contacts paged (has_more: ${result.paging != null})`,
      };
    } catch (err: unknown) {
      return { ok: false, detail: String(err) };
    }
  }

  capabilities: Record<string, (args: unknown) => Promise<unknown>> = {
    'contacts.list': async (args: unknown) => {
      const hs = await getHubSpotClient();
      const { limit = 10 } = (args ?? {}) as ContactsListArgs;
      return hs.crm.contacts.basicApi.getPage(limit);
    },

    'contacts.create': async (args: unknown) => {
      const hs = await getHubSpotClient();
      const { email, firstname, lastname, company } = (args ?? {}) as ContactsCreateArgs;
      if (!email) throw new Error('contacts.create requires args.email');
      const properties: Record<string, string> = { email };
      if (firstname) properties['firstname'] = firstname;
      if (lastname) properties['lastname'] = lastname;
      if (company) properties['company'] = company;
      return hs.crm.contacts.basicApi.create({ properties, associations: [] });
    },

    'companies.list': async (args: unknown) => {
      const hs = await getHubSpotClient();
      const { limit = 10 } = (args ?? {}) as CompaniesListArgs;
      return hs.crm.companies.basicApi.getPage(limit);
    },

    'deals.create': async (args: unknown) => {
      const hs = await getHubSpotClient();
      const { dealname, amount, closedate, pipeline = 'default', dealstage = 'appointmentscheduled' } =
        (args ?? {}) as DealsCreateArgs;
      if (!dealname) throw new Error('deals.create requires args.dealname');
      const properties: Record<string, string> = {
        dealname,
        pipeline,
        dealstage,
      };
      if (amount !== undefined) properties['amount'] = String(amount);
      if (closedate) properties['closedate'] = closedate;
      return hs.crm.deals.basicApi.create({ properties, associations: [] });
    },
  };
}

registerConnector(() => new HubSpotConnector());
