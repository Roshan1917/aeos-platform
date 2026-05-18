import type { TenantId } from './tenant.js';
import type { UoPId } from './uop.js';

export type ProcessId = string & { readonly _brand: 'ProcessId' };

export interface Process {
  readonly id: ProcessId;
  readonly tenant_id: TenantId;
  readonly uop_id: UoPId;
  readonly name: string;
  readonly description: string;
  readonly steps: ProcessStep[];
  readonly status: 'active' | 'deprecated';
  readonly created_at: string;
  readonly updated_at: string;
}

export interface ProcessStep {
  readonly step_id: string;
  readonly name: string;
  readonly type: 'human' | 'agent' | 'automated' | 'decision';
  readonly responsible_agent_id?: string;
  readonly inputs: string[];
  readonly outputs: string[];
  readonly next_steps: string[];
}
