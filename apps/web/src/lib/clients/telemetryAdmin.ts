import { api } from '../api';

export interface TelemetryTokenSummary {
  id: string;
  tenant_id: string;
  name: string;
  prefix: string;
  created_by: string;
  created_at: string;
  expires_at: string | null;
  revoked_at: string | null;
  last_used_at: string | null;
}

export interface CreateTelemetryTokenResponse extends TelemetryTokenSummary {
  /** Raw token. Shown once at mint — store securely. */
  token: string;
}

export interface CreateTelemetryTokenRequest {
  name: string;
  expires_at?: string | null;
}

export function listTelemetryTokens(): Promise<{ tokens: TelemetryTokenSummary[] }> {
  return api('telemetry', '/v1/admin/telemetry-tokens');
}

export function createTelemetryToken(
  body: CreateTelemetryTokenRequest,
): Promise<CreateTelemetryTokenResponse> {
  return api('telemetry', '/v1/admin/telemetry-tokens', { method: 'POST', body });
}

export function revokeTelemetryToken(id: string): Promise<void> {
  return api('telemetry', `/v1/admin/telemetry-tokens/${id}`, { method: 'DELETE' });
}
