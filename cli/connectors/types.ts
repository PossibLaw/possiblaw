// PossibLaw — Connector type contracts
// Every connector implements ConnectorClient. Factories are registered via the registry.

export interface ConnectorMetadata {
  id: string;               // "stripe", "imanage", "midpage", ...
  name: string;             // "Stripe", "iManage", "midpage"
  category: 'legal' | 'business' | 'stand-in';
  tier: 'open-access' | 'paid'; // open-access = free dev tier or no-auth; paid = enterprise/contract
  description: string;
  env_vars: { name: string; required: boolean; description: string }[];
  capabilities: string[];   // e.g. ['documents.list', 'documents.get', 'signature.request']
}

export interface HealthcheckResult {
  ok: boolean;
  detail: string;
}

export interface ConnectorClient {
  metadata: ConnectorMetadata;
  isConfigured(): boolean;
  healthcheck(): Promise<HealthcheckResult>;
  capabilities: Record<string, (args: unknown) => Promise<unknown>>;
}

export type ConnectorFactory = () => ConnectorClient;
