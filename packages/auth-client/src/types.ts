import type { TenantId } from '@aeos/canonical-schema';

export interface AeosJwtPayload {
  readonly sub: string;
  readonly tenant_id: TenantId;
  readonly roles: string[];
  readonly agent_contract_id?: string;
  readonly exp: number;
  readonly iat: number;
}

export interface AuthContext {
  readonly userId: string;
  readonly tenantId: TenantId;
  readonly roles: string[];
  readonly agentContractId?: string;
}

export interface PermissionCheckResult {
  readonly allowed: boolean;
  readonly reason?: string;
}
