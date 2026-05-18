// PATENT-ADJACENT: Unit of Performance (UoP) — Patent Family 1
// Do NOT add or rename fields without CTO approval (danny.goldstein@fuzebox.ai)

import type { TenantId } from './tenant.js';

export const UOP_SCHEMA_VERSION = '1.0' as const;

export type UoPId = string & { readonly _brand: 'UoPId' };

export function uoPId(id: string): UoPId {
  return id as UoPId;
}

export interface UoP {
  readonly schema_version: typeof UOP_SCHEMA_VERSION;
  readonly id: UoPId;
  readonly tenant_id: TenantId;
  readonly name: string;
  readonly description: string;
  readonly category: UoPCategory;
  readonly system_of_record: SystemOfRecord;
  readonly sor_object_type: string;
  readonly sor_metric_field: string;
  readonly baseline_value: number;
  readonly baseline_currency?: string;
  readonly owner_team: string;
  readonly status: 'active' | 'deprecated';
  readonly created_at: string;
  readonly updated_at: string;
}

export type UoPCategory =
  | 'revenue_generation'
  | 'cost_reduction'
  | 'risk_mitigation'
  | 'compliance'
  | 'customer_experience'
  | 'operational_efficiency';

export type SystemOfRecord =
  | 'salesforce'
  | 'sap'
  | 'hubspot'
  | 'oracle'
  | 'workday'
  | 'servicenow'
  | 'custom';
