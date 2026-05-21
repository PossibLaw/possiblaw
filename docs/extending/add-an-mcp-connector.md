# Add an MCP Connector

This guide shows how to add a new connector to PossibLaw using the Sprint 6 connector framework. After following it, a stranger can integrate any external service — billing, CRM, document management, legal research — into the agent pipeline.

> **DISCLAIMER: PossibLaw does not practice law. Connectors provide data to agents; agents produce drafts for licensed-lawyer review.**

---

## Architecture overview

All connectors implement `ConnectorClient` from `cli/connectors/types.ts`. They self-register at load time by calling `registerConnector()`. The registry (`cli/connectors/registry.ts`) makes them available to agents at runtime.

Three connector patterns are supported:

| Pattern | When to use | Reference implementation |
|---|---|---|
| **Official SDK** | npm package exists, well-maintained | `cli/connectors/stripe.ts` |
| **HTTP-only** | No SDK; REST API with Bearer token | `cli/connectors/midpage.ts` |
| **OAuth enterprise** | Multi-step auth flow (JWT, client credentials) | `cli/connectors/docusign.ts` |

---

## Pattern 1 — Official SDK (Stripe pattern)

Use this when the service has an official npm package.

### Step 1 — Install the SDK

```bash
pnpm add <sdk-package>
# Example: pnpm add @myservice/api-client
```

### Step 2 — Create the connector file

Create `cli/connectors/myservice.ts`:

```typescript
// PossibLaw — MyService connector
// Pattern: official SDK (@myservice/api-client).
// Env: MYSERVICE_API_KEY (required).
// Reference: https://docs.myservice.example/api

import type { ConnectorClient, ConnectorMetadata } from './types.js';
import { registerConnector } from './registry.js';

async function getClient() {
  const apiKey = process.env['MYSERVICE_API_KEY'];
  if (!apiKey) throw new Error('MYSERVICE_API_KEY not set');
  const { MyServiceClient } = await import('@myservice/api-client');
  return new MyServiceClient({ apiKey });
}

interface RecordsListArgs {
  limit?: number;
}

class MyServiceConnector implements ConnectorClient {
  readonly metadata: ConnectorMetadata = {
    id: 'myservice',
    name: 'MyService',
    category: 'business',       // or 'legal'
    tier: 'open-access',        // or 'paid', 'enterprise'
    description: 'One-line description of what this connector does.',
    env_vars: [
      {
        name: 'MYSERVICE_API_KEY',
        required: true,
        description: 'From https://myservice.example/settings/api-keys',
      },
    ],
    capabilities: ['records.list', 'records.create'],
  };

  isConfigured(): boolean {
    return Boolean(process.env['MYSERVICE_API_KEY']);
  }

  async healthcheck(): Promise<{ ok: boolean; detail: string }> {
    if (!this.isConfigured()) {
      return { ok: false, detail: 'MYSERVICE_API_KEY not set' };
    }
    try {
      const client = await getClient();
      await client.records.list({ limit: 1 });
      return { ok: true, detail: 'MyService API reachable' };
    } catch (err: unknown) {
      return { ok: false, detail: String(err) };
    }
  }

  capabilities: Record<string, (args: unknown) => Promise<unknown>> = {
    'records.list': async (args: unknown) => {
      const client = await getClient();
      const { limit = 10 } = (args ?? {}) as RecordsListArgs;
      return client.records.list({ limit });
    },
    'records.create': async (args: unknown) => {
      const client = await getClient();
      return client.records.create(args as Record<string, unknown>);
    },
  };
}

registerConnector(() => new MyServiceConnector());
```

---

## Pattern 2 — HTTP-only (midpage pattern)

Use this when there is no npm package. Implement a `fetch` wrapper with a Bearer token.

```typescript
// PossibLaw — MyService connector
// Pattern: HTTP-only (plain fetch with Bearer token).
// Env: MYSERVICE_API_KEY (required).
//
// IMPORTANT — VERIFY SCHEMA BEFORE PRODUCTION USE
// The endpoint shapes below are based on public documentation as of 2026-05-21.
// Verify the base URL and request/response shapes before production use.

import type { ConnectorClient, ConnectorMetadata } from './types.js';
import { registerConnector } from './registry.js';

const BASE_URL = 'https://api.myservice.example/v1';

async function apiFetch(path: string, method: 'GET' | 'POST' = 'GET', body?: unknown): Promise<unknown> {
  const apiKey = process.env['MYSERVICE_API_KEY'];
  if (!apiKey) throw new Error('MYSERVICE_API_KEY not set');
  const resp = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`MyService API error: ${resp.status} ${resp.statusText}${text ? ` — ${text}` : ''}`);
  }
  return resp.json() as Promise<unknown>;
}

class MyServiceConnector implements ConnectorClient {
  readonly metadata: ConnectorMetadata = {
    id: 'myservice',
    name: 'MyService',
    category: 'legal',
    tier: 'paid',
    description: 'Short description. UNCONFIRMED: verify API schema before production use.',
    env_vars: [{ name: 'MYSERVICE_API_KEY', required: true, description: 'API key from myservice.example' }],
    capabilities: ['items.list', 'items.get', 'items.create'],
  };

  isConfigured(): boolean { return Boolean(process.env['MYSERVICE_API_KEY']); }

  async healthcheck(): Promise<{ ok: boolean; detail: string }> {
    if (!this.isConfigured()) return { ok: false, detail: 'MYSERVICE_API_KEY not set' };
    try {
      await apiFetch('/items?limit=1');
      return { ok: true, detail: 'MyService API reachable' };
    } catch (err) {
      return { ok: false, detail: String(err) };
    }
  }

  capabilities: Record<string, (args: unknown) => Promise<unknown>> = {
    'items.list': async (args) => apiFetch(`/items?limit=${(args as { limit?: number })?.limit ?? 20}`),
    'items.get': async (args) => apiFetch(`/items/${(args as { id: string }).id}`),
    'items.create': async (args) => apiFetch('/items', 'POST', args),
  };
}

registerConnector(() => new MyServiceConnector());
```

---

## Step 3 — Register the connector in the loader

Open `cli/connectors/index.ts` and add your import:

```typescript
import './myservice.js';
```

The self-registration pattern means importing the module is sufficient — no other registry call needed.

---

## Step 4 — Create a declarative descriptor

Create `layer/connectors/myservice.yaml`:

```yaml
id: myservice
name: MyService
category: business
tier: open-access
description: One-line description.
stand_in: local-fs-doc-store   # omit if no stand-in
capabilities:
  - records.list
  - records.create
env_vars:
  - MYSERVICE_API_KEY
docs: https://docs.myservice.example
```

---

## Step 5 — Add env var to `.env.example`

Open `.env.example` and add your connector's section:

```bash
# MyService (category — optional)
# Docs: https://docs.myservice.example/api
# MYSERVICE_API_KEY=
```

---

## Step 6 — Wire to an agent (optional)

To make an agent aware of a connector, add its id to the `connectors:` array in the agent's frontmatter:

```yaml
# layer/agents/specialists/legal/commercial/nda-drafter.md (snippet)
connectors: [local-fs-doc-store, myservice]
```

The runtime does not auto-inject connector calls — the agent's system prompt must instruct it when to use the connector. This is intentional: the agent decides, not the framework.

---

## Step 7 — Build and verify

```bash
pnpm build

# List all connectors — myservice should appear
bin/possiblaw connectors list

# Healthcheck without credentials — should report ok: false (not set)
bin/possiblaw connectors check myservice

# Healthcheck with credentials
export MYSERVICE_API_KEY=sk_test_...
bin/possiblaw connectors check myservice

# Inspect capabilities
bin/possiblaw connectors capabilities myservice
```

---

## Checklist

- [ ] `cli/connectors/myservice.ts` created with `registerConnector()` call.
- [ ] SDK added to `package.json` dependencies (if using Pattern 1).
- [ ] `cli/connectors/index.ts` imports the new module.
- [ ] `layer/connectors/myservice.yaml` descriptor created.
- [ ] `.env.example` updated with env var.
- [ ] `pnpm build` passes.
- [ ] `bin/possiblaw connectors list` shows the connector.
- [ ] `bin/possiblaw connectors check myservice` reports the expected status.
