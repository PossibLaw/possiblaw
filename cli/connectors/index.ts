// PossibLaw — Connector loader
// Import each connector module to trigger self-registration via registerConnector().
// The order here determines registry order (cosmetic only).

// Stand-ins (always work, no credentials)
import './local-fs-doc-store.js';
import './no-op-signature.js';
import './courtlistener.js';

// Reference live connectors
import './stripe.js';
import './midpage.js';
import './docusign.js';

// Re-export registry helpers for CLI use
export { getConnector, listConnectors, listConfigured, registerConnector } from './registry.js';
export type { ConnectorClient, ConnectorFactory, ConnectorMetadata, HealthcheckResult } from './types.js';
