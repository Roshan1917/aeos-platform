import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  getRecommendation,
  listRecommendations,
  updateStatus,
  type RecommendationListFilters,
  type RecommendationStatus,
} from '../lib/clients/recommendations';

export function useRecommendations(filters: RecommendationListFilters = {}) {
  return useQuery({
    queryKey: ['recommendations', filters],
    queryFn: () => listRecommendations(filters),
  });
}

export function useRecommendation(id: string | undefined) {
  return useQuery({
    queryKey: ['recommendation', id],
    queryFn: () => getRecommendation(id!),
    enabled: !!id,
  });
}

export function useUpdateRecommendationStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status, reason }: { id: string; status: RecommendationStatus; reason?: string }) =>
      updateStatus(id, status, reason),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['recommendations'] });
      qc.invalidateQueries({ queryKey: ['recommendation', vars.id] });
    },
  });
}
