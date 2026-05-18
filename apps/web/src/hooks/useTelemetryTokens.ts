import { useQuery } from '@tanstack/react-query';
import { listTelemetryTokens } from '../lib/clients/telemetryAdmin';

export function useTelemetryTokens() {
  return useQuery({
    queryKey: ['telemetry-tokens'],
    queryFn: () => listTelemetryTokens().then((r) => r.tokens),
  });
}
