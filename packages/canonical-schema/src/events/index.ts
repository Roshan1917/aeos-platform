export * from './telemetry-events.js';
export * from './ledger-events.js';
export * from './governance-events.js';
export * from './registry-events.js';
export * from './recommendations-events.js';

import type { TelemetryEvent } from './telemetry-events.js';
import type { LedgerEvent } from './ledger-events.js';
import type { GovernanceEvent } from './governance-events.js';
import type { RegistryEvent } from './registry-events.js';
import type { RecommendationsEvent } from './recommendations-events.js';

export type AeosEvent =
  | TelemetryEvent
  | LedgerEvent
  | GovernanceEvent
  | RegistryEvent
  | RecommendationsEvent;
