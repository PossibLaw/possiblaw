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

// Sprint 6B — Legal (paid tier)
import './imanage.js';
import './netdocuments.js';
import './westlaw.js';
import './lexis.js';

// Sprint 6B — Business (open-access dev tiers)
import './quickbooks.js';
import './hubspot.js';
import './notion.js';
import './linear.js';

// Re-export registry helpers for CLI use
export { getConnector, listConnectors, listConfigured, registerConnector } from './registry.js';
export type { ConnectorClient, ConnectorFactory, ConnectorMetadata, HealthcheckResult } from './types.js';
