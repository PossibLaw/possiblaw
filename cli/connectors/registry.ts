// PossibLaw — Connector registry
// Connectors self-register at module load time via registerConnector().

import type { ConnectorClient, ConnectorFactory, ConnectorMetadata } from './types.js';

const _registry = new Map<string, ConnectorClient>();

export function registerConnector(factory: ConnectorFactory): void {
  const client = factory();
  _registry.set(client.metadata.id, client);
}

export function getConnector(id: string): ConnectorClient | null {
  return _registry.get(id) ?? null;
}

export function listConnectors(): ConnectorMetadata[] {
  return Array.from(_registry.values()).map((c) => c.metadata);
}

export function listConfigured(): ConnectorMetadata[] {
  return Array.from(_registry.values())
    .filter((c) => c.isConfigured())
    .map((c) => c.metadata);
}
