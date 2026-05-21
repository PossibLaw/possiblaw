// PossibLaw — Notion connector
// Pattern: official SDK (@notionhq/client).
// Env: NOTION_API_KEY (required). Free Notion account available for dev.
// Reference: https://developers.notion.com/reference/intro

import type { ConnectorClient, ConnectorMetadata } from './types.js';
import { registerConnector } from './registry.js';

async function getNotionClient(): Promise<import('@notionhq/client').Client> {
  const apiKey = process.env['NOTION_API_KEY'];
  if (!apiKey) throw new Error('NOTION_API_KEY not set');
  const { Client } = await import('@notionhq/client');
  return new Client({ auth: apiKey });
}

interface PagesCreateArgs {
  parent_id: string;
  title: string;
  content?: string;
}

interface PagesUpdateArgs {
  page_id: string;
  title?: string;
  archived?: boolean;
}

interface DatabasesQueryArgs {
  database_id: string;
  filter?: Record<string, unknown>;
  page_size?: number;
}

interface SearchArgs {
  query: string;
  page_size?: number;
}

class NotionConnector implements ConnectorClient {
  readonly metadata: ConnectorMetadata = {
    id: 'notion',
    name: 'Notion',
    category: 'business',
    tier: 'open-access',
    description:
      'Notion workspace via official @notionhq/client SDK. Free for personal/dev use. Create an integration at https://www.notion.so/my-integrations to get the API key.',
    env_vars: [
      {
        name: 'NOTION_API_KEY',
        required: true,
        description:
          'Notion internal integration token. Create at https://www.notion.so/my-integrations and grant access to relevant pages.',
      },
    ],
    capabilities: ['pages.create', 'pages.update', 'databases.query', 'search'],
  };

  isConfigured(): boolean {
    return Boolean(process.env['NOTION_API_KEY']);
  }

  async healthcheck(): Promise<{ ok: boolean; detail: string }> {
    if (!this.isConfigured()) {
      return { ok: false, detail: 'NOTION_API_KEY not set' };
    }
    try {
      const notion = await getNotionClient();
      const user = await notion.users.me({});
      const name = ('name' in user && typeof user.name === 'string') ? user.name : 'unknown';
      return { ok: true, detail: `Notion reachable — bot user: ${name}` };
    } catch (err: unknown) {
      return { ok: false, detail: String(err) };
    }
  }

  capabilities: Record<string, (args: unknown) => Promise<unknown>> = {
    'pages.create': async (args: unknown) => {
      const notion = await getNotionClient();
      const { parent_id, title, content } = (args ?? {}) as PagesCreateArgs;
      if (!parent_id) throw new Error('pages.create requires args.parent_id');
      if (!title) throw new Error('pages.create requires args.title');

      const children = content
        ? [
            {
              object: 'block' as const,
              type: 'paragraph' as const,
              paragraph: {
                rich_text: [{ type: 'text' as const, text: { content } }],
              },
            },
          ]
        : [];

      return notion.pages.create({
        parent: { page_id: parent_id },
        properties: {
          title: {
            title: [{ type: 'text', text: { content: title } }],
          },
        },
        children,
      });
    },

    'pages.update': async (args: unknown) => {
      const notion = await getNotionClient();
      const { page_id, title, archived = false } = (args ?? {}) as PagesUpdateArgs;
      if (!page_id) throw new Error('pages.update requires args.page_id');

      type UpdateParams = Parameters<typeof notion.pages.update>[0];
      const updateArgs: UpdateParams = { page_id, archived };

      if (title !== undefined) {
        (updateArgs as UpdateParams & { properties: Record<string, unknown> }).properties = {
          title: {
            title: [{ type: 'text', text: { content: title } }],
          },
        };
      }

      return notion.pages.update(updateArgs);
    },

    'databases.query': async (args: unknown) => {
      const notion = await getNotionClient();
      const { database_id, filter, page_size = 20 } = (args ?? {}) as DatabasesQueryArgs;
      if (!database_id) throw new Error('databases.query requires args.database_id');
      return notion.databases.query({
        database_id,
        page_size,
        ...(filter ? { filter: filter as Parameters<typeof notion.databases.query>[0]['filter'] } : {}),
      });
    },

    'search': async (args: unknown) => {
      const notion = await getNotionClient();
      const { query, page_size = 10 } = (args ?? {}) as SearchArgs;
      if (!query) throw new Error('search requires args.query');
      return notion.search({ query, page_size });
    },
  };
}

registerConnector(() => new NotionConnector());
