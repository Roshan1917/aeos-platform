import { useQuery } from '@tanstack/react-query';

import {
  getSpan,
  getTrace,
  listSpans,
  type SpanListFilters,
} from '../lib/clients/telemetry';

export function useSpans(filters: SpanListFilters = {}) {
  return useQuery({
    queryKey: ['spans', filters],
    queryFn: () => listSpans(filters),
  });
}

export function useSpan(spanId: string | undefined) {
  return useQuery({
    queryKey: ['span', spanId],
    queryFn: () => getSpan(spanId!),
    enabled: !!spanId,
  });
}

export function useTrace(traceId: string | undefined) {
  return useQuery({
    queryKey: ['trace', traceId],
    queryFn: () => getTrace(traceId!),
    enabled: !!traceId,
  });
}
