import { useQuery } from '@tanstack/react-query';

import { getProcess, listProcesses } from '../lib/clients/substrate';
import { useAuth } from './useAuth';

export function useProcesses() {
  const { claims } = useAuth();
  return useQuery({
    queryKey: ['processes', claims?.tenant_id],
    queryFn: () => listProcesses(claims!.tenant_id),
    enabled: !!claims,
  });
}

export function useProcess(processId: string | undefined) {
  const { claims } = useAuth();
  return useQuery({
    queryKey: ['process', claims?.tenant_id, processId],
    queryFn: () => getProcess(claims!.tenant_id, processId!),
    enabled: !!claims && !!processId,
  });
}
