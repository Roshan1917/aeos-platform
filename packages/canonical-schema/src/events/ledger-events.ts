import type { LedgerRow } from '../types/ledger-row.js';
import type { TenantId } from '../types/tenant.js';

export const LEDGER_EVENTS_VERSION = '1.0' as const;

export interface LedgerRowWrittenEvent {
  readonly event_type: 'ledger.row.written';
  readonly schema_version: typeof LEDGER_EVENTS_VERSION;
  readonly event_id: string;
  readonly tenant_id: TenantId;
  readonly timestamp: string;
  readonly payload: LedgerRow;
}

export interface LedgerVarianceDetectedEvent {
  readonly event_type: 'ledger.variance.detected';
  readonly schema_version: typeof LEDGER_EVENTS_VERSION;
  readonly event_id: string;
  readonly tenant_id: TenantId;
  readonly timestamp: string;
  readonly payload: {
    readonly variance_row_id: string;
    readonly uop_id: string;
    readonly agent_id: string;
    readonly variance_bucket: string;
    readonly variance_pct: number;
  };
}

export type LedgerEvent = LedgerRowWrittenEvent | LedgerVarianceDetectedEvent;
