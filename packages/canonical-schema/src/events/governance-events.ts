import type { TenantId } from '../types/tenant.js';

export const GOVERNANCE_EVENTS_VERSION = '1.0' as const;

export interface GovernancePolicyEvaluatedEvent {
  readonly event_type: 'governance.policy.evaluated';
  readonly schema_version: typeof GOVERNANCE_EVENTS_VERSION;
  readonly event_id: string;
  readonly tenant_id: TenantId;
  readonly timestamp: string;
  readonly payload: {
    readonly agent_id: string;
    readonly decision_id: string;
    readonly policy_pack_id: string;
    readonly result: 'pass' | 'fail' | 'warning';
    readonly violations: PolicyViolation[];
  };
}

export interface PolicyViolation {
  readonly rule_id: string;
  readonly rule_name: string;
  readonly severity: 'critical' | 'high' | 'medium' | 'low';
  readonly description: string;
}

export interface AttestationBundleGeneratedEvent {
  readonly event_type: 'governance.attestation.generated';
  readonly schema_version: typeof GOVERNANCE_EVENTS_VERSION;
  readonly event_id: string;
  readonly tenant_id: TenantId;
  readonly timestamp: string;
  readonly payload: {
    readonly bundle_id: string;
    readonly s3_path: string;
    readonly compliance_frameworks: string[];
  };
}

export type GovernanceEvent =
  | GovernancePolicyEvaluatedEvent
  | AttestationBundleGeneratedEvent;
