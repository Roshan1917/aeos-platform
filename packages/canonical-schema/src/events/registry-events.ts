import type { Agent } from '../types/agent.js';
import type { Process } from '../types/process.js';
import type { TenantId } from '../types/tenant.js';
import type { UoP } from '../types/uop.js';

export const REGISTRY_EVENTS_VERSION = '1.0' as const;

export interface UoPRegisteredEvent {
  readonly event_type: 'registry.uop.registered';
  readonly schema_version: typeof REGISTRY_EVENTS_VERSION;
  readonly event_id: string;
  readonly tenant_id: TenantId;
  readonly timestamp: string;
  readonly payload: UoP;
}

export interface ProcessRegisteredEvent {
  readonly event_type: 'registry.process.registered';
  readonly schema_version: typeof REGISTRY_EVENTS_VERSION;
  readonly event_id: string;
  readonly tenant_id: TenantId;
  readonly timestamp: string;
  readonly payload: Process;
}

export interface AgentRegisteredEvent {
  readonly event_type: 'registry.agent.registered';
  readonly schema_version: typeof REGISTRY_EVENTS_VERSION;
  readonly event_id: string;
  readonly tenant_id: TenantId;
  readonly timestamp: string;
  readonly payload: Agent;
}

export type RegistryEvent = UoPRegisteredEvent | ProcessRegisteredEvent | AgentRegisteredEvent;
