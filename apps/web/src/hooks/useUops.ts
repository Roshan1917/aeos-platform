import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { getUop, importUops, listUops, type UoPImportResponse } from '../lib/clients/substrate';
import { useAuth } from './useAuth';

export function useUops() {
  const { claims } = useAuth();
  return useQuery({
    queryKey: ['uops', claims?.tenant_id],
    queryFn: () => listUops(claims!.tenant_id),
    enabled: !!claims,
  });
}

export function useUop(uopId: string | undefined) {
  const { claims } = useAuth();
  return useQuery({
    queryKey: ['uop', claims?.tenant_id, uopId],
    queryFn: () => getUop(claims!.tenant_id, uopId!),
    enabled: !!claims && !!uopId,
  });
}

export function useImportUops() {
  const { claims } = useAuth();
  const qc = useQueryClient();
  return useMutation<UoPImportResponse, Error, unknown>({
    mutationFn: (bundle) => importUops(claims!.tenant_id, bundle),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['uops', claims?.tenant_id] });
    },
  });
}
