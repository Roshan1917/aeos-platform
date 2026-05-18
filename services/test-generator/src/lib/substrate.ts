/**
 * Tiny client for substrate registry endpoints.
 *
 * Used at execute time to resolve the caller's first agent + uop so the
 * executor can attach a real `agent_id` / `uop_id` to emitted spans (without
 * those, the telemetry pipeline drops the spans before Kafka enrichment).
 */
import { config } from '../config.js';

export async function listFirstAgentId(token: string, tenantId: string): Promise<string | null> {
  const res = await fetch(`${config.AUTH_SERVICE_URL}/v1/tenants/${tenantId}/agents`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  const arr = (await res.json()) as Array<{ id: string }>;
  return arr[0]?.id ?? null;
}

export async function listFirstUoPId(token: string, tenantId: string): Promise<string | null> {
  const res = await fetch(`${config.AUTH_SERVICE_URL}/v1/tenants/${tenantId}/uops`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  const arr = (await res.json()) as Array<{ id: string }>;
  return arr[0]?.id ?? null;
}
