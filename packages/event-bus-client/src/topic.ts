import type { TenantId } from '@aeos/canonical-schema';
import type { AeosEvent } from '@aeos/canonical-schema';

export function topicName(tenantId: TenantId, eventType: AeosEvent['event_type']): string {
  const domain = eventType.split('.')[0];
  return `aeos.${tenantId}.${domain}.${eventType}`;
}

export function topicPattern(tenantId: TenantId, domain?: string): string {
  if (domain) {
    return `aeos.${tenantId}.${domain}.*`;
  }
  return `aeos.${tenantId}.*`;
}
