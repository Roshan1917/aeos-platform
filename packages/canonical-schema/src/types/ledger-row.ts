// PATENT-ADJACENT: Execution Economic Ledger — Patent Families 2 & 8 (USPTO #63/898,712)
// Do NOT add or rename fields without CTO approval (danny.goldstein@fuzebox.ai)
// LedgerRow is APPEND-ONLY. No UPDATE or DELETE, ever. Compensating rows only.

import type { AgentContractId } from './agent-contract.js';
import type { AgentId } from './agent.js';
import type { DecisionId } from './span.js';
import type { TenantId } from './tenant.js';
import type { UoPId } from './uop.js';

export const LEDGER_ROW_SCHEMA_VERSION = '1.0' as const;

export type LedgerRowId = string & { readonly _brand: 'LedgerRowId' };

export type LedgerRowType = 'predicted' | 'actual' | 'variance' | 'attribution' | 'correction';

export interface LedgerRow {
  readonly schema_version: typeof LEDGER_ROW_SCHEMA_VERSION;
  readonly id: LedgerRowId;
  readonly tenant_id: TenantId;
  readonly uop_id: UoPId;
  readonly agent_id: AgentId;
  readonly contract_id: AgentContractId;
  readonly decision_id: DecisionId;
  readonly row_type: LedgerRowType;
  readonly recorded_at: string;
  readonly signed_by_fuzebox: string;
  readonly signed_by_rp: string;
  readonly payload: PredictedPayload | ActualPayload | VariancePayload | AttributionPayload | CorrectionPayload;
}

export interface UefScore {
  readonly task_completion: number;
  readonly decision_quality: number;
  readonly resource_efficiency: number;
  readonly compliance_adherence: number;
  readonly human_oversight_ratio: number;
  readonly error_recovery: number;
  readonly knowledge_utilization: number;
  readonly coordination_effectiveness: number;
  readonly composite: number;
}

export interface PredictedPayload {
  readonly type: 'predicted';
  readonly uef_score: UefScore;
  readonly predicted_value: number;
  readonly predicted_currency: string;
  readonly confidence_interval_low: number;
  readonly confidence_interval_high: number;
  readonly model_version: string;
}

export interface ActualPayload {
  readonly type: 'actual';
  readonly sor_connector: string;
  readonly sor_record_id: string;
  readonly actual_value: number;
  readonly actual_currency: string;
  readonly sor_timestamp: string;
}

export interface VariancePayload {
  readonly type: 'variance';
  readonly predicted_row_id: LedgerRowId;
  readonly actual_row_id: LedgerRowId;
  readonly variance_value: number;
  readonly variance_pct: number;
  readonly variance_bucket: VarianceBucket;
}

export type VarianceBucket =
  | 'within_tolerance'
  | 'positive_overperformance'
  | 'negative_underperformance'
  | 'data_quality_issue'
  | 'model_drift';

export interface AttributionPayload {
  readonly type: 'attribution';
  readonly variance_row_id: LedgerRowId;
  readonly attribution_factors: AttributionFactor[];
}

export interface AttributionFactor {
  readonly factor_type: string;
  readonly contribution_pct: number;
  readonly description: string;
}

export interface CorrectionPayload {
  readonly type: 'correction';
  readonly corrects_row_id: LedgerRowId;
  readonly correction_reason: string;
  readonly corrected_by: string;
  readonly corrected_at: string;
}
