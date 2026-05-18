import { useQuery } from '@tanstack/react-query';
import { getTestCase, listTestCases } from '../lib/clients/testGenerator';

export function useTestCases() {
  return useQuery({
    queryKey: ['test-cases'],
    queryFn: () => listTestCases(),
  });
}

export function useTestCase(id: string | undefined) {
  return useQuery({
    queryKey: ['test-case', id],
    queryFn: () => getTestCase(id!),
    enabled: !!id,
  });
}
