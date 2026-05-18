// PATENT-ADJACENT: Board Attestation — Patent Family 8 (USPTO #63/898,712)
// Do NOT add or rename fields without CTO approval (danny.goldstein@fuzebox.ai)

import type { TenantId } from './tenant.js';
import type { ComplianceFramework } from './tenant.js';

export const ATTESTATION_SCHEMA_VERSION = '1.0' as const;

export type AttestationBundleId = string & { readonly _brand: 'AttestationBundleId' };

export interface AttestationBundle {
  readonly schema_version: typeof ATTESTATION_SCHEMA_VERSION;
  readonly id: AttestationBundleId;
  readonly tenant_id: TenantId;
  readonly period_start: string;
  readonly period_end: string;
  readonly compliance_frameworks: ComplianceFramework[];
  readonly ledger_row_ids: string[];
  readonly compliance_readiness_score: ComplianceReadinessScore;
  readonly signed_by_fuzebox: string;
  readonly signed_by_rp: string;
  readonly bundle_hash: string;
  readonly s3_path: string;
  readonly generated_at: string;
  readonly status: 'draft' | 'signed' | 'delivered' | 'superseded';
}

export interface ComplianceReadinessScore {
  readonly overall: number;
  readonly eu_ai_act_article14?: number;
  readonly iso_42001?: number;
  readonly unece_wp29?: number;
  readonly mas_trm?: number;
  readonly soc2?: number;
  readonly dimension_scores: Record<string, number>;
}
