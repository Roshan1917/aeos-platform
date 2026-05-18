import { useQuery } from '@tanstack/react-query';

import { getAgent, listAgents } from '../lib/clients/substrate';
import { useAuth } from './useAuth';

export function useAgents() {
  const { claims } = useAuth();
  return useQuery({
    queryKey: ['agents', claims?.tenant_id],
    queryFn: () => listAgents(claims!.tenant_id),
    enabled: !!claims,
  });
}

export function useAgent(agentId: string | undefined) {
  return useQuery({
    queryKey: ['agent', agentId],
    queryFn: () => getAgent(agentId!),
    enabled: !!agentId,
  });
}
