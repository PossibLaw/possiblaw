// PossibLaw — Linear connector
// Pattern: official SDK (@linear/sdk).
// Env: LINEAR_API_KEY (required). Free dev access at https://linear.app.
// Reference: https://developers.linear.app/docs/sdk/getting-started

import type { ConnectorClient, ConnectorMetadata } from './types.js';
import { registerConnector } from './registry.js';

async function getLinearClient(): Promise<import('@linear/sdk').LinearClient> {
  const apiKey = process.env['LINEAR_API_KEY'];
  if (!apiKey) throw new Error('LINEAR_API_KEY not set');
  const { LinearClient } = await import('@linear/sdk');
  return new LinearClient({ apiKey });
}

interface IssuesListArgs {
  team_id?: string;
  limit?: number;
}

interface IssuesCreateArgs {
  team_id: string;
  title: string;
  description?: string;
  priority?: number;
}

interface TeamsListArgs {
  limit?: number;
}

interface ProjectsListArgs {
  team_id?: string;
  limit?: number;
}

class LinearConnector implements ConnectorClient {
  readonly metadata: ConnectorMetadata = {
    id: 'linear',
    name: 'Linear',
    category: 'business',
    tier: 'open-access',
    description:
      'Linear issue tracker via official @linear/sdk. Free dev account available at https://linear.app. Generate an API key at Settings → API.',
    env_vars: [
      {
        name: 'LINEAR_API_KEY',
        required: true,
        description: 'Personal API key from Linear Settings → API → Personal API keys.',
      },
    ],
    capabilities: ['issues.list', 'issues.create', 'teams.list', 'projects.list'],
  };

  isConfigured(): boolean {
    return Boolean(process.env['LINEAR_API_KEY']);
  }

  async healthcheck(): Promise<{ ok: boolean; detail: string }> {
    if (!this.isConfigured()) {
      return { ok: false, detail: 'LINEAR_API_KEY not set' };
    }
    try {
      const linear = await getLinearClient();
      const viewer = await linear.viewer;
      return { ok: true, detail: `Linear reachable — viewer: ${viewer.name}` };
    } catch (err: unknown) {
      return { ok: false, detail: String(err) };
    }
  }

  capabilities: Record<string, (args: unknown) => Promise<unknown>> = {
    'issues.list': async (args: unknown) => {
      const linear = await getLinearClient();
      const { team_id, limit = 20 } = (args ?? {}) as IssuesListArgs;
      if (team_id) {
        const team = await linear.team(team_id);
        const issues = await team.issues({ first: limit });
        return issues.nodes;
      }
      const issues = await linear.issues({ first: limit });
      return issues.nodes;
    },

    'issues.create': async (args: unknown) => {
      const linear = await getLinearClient();
      const { team_id, title, description, priority } = (args ?? {}) as IssuesCreateArgs;
      if (!team_id) throw new Error('issues.create requires args.team_id');
      if (!title) throw new Error('issues.create requires args.title');
      return linear.createIssue({
        teamId: team_id,
        title,
        description,
        priority,
      });
    },

    'teams.list': async (args: unknown) => {
      const linear = await getLinearClient();
      const { limit = 20 } = (args ?? {}) as TeamsListArgs;
      const teams = await linear.teams({ first: limit });
      return teams.nodes;
    },

    'projects.list': async (args: unknown) => {
      const linear = await getLinearClient();
      const { limit = 20 } = (args ?? {}) as ProjectsListArgs;
      const projects = await linear.projects({ first: limit });
      return projects.nodes;
    },
  };
}

registerConnector(() => new LinearConnector());
