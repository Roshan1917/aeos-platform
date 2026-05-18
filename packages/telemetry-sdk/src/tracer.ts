import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { Resource } from '@opentelemetry/resources';
import { SEMRESATTRS_SERVICE_NAME, SEMRESATTRS_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';
import { trace, type Tracer } from '@opentelemetry/api';

let sdk: NodeSDK | undefined;

export function initTracing(serviceName: string, serviceVersion = '0.0.0'): void {
  if (sdk) return;

  const endpoint = process.env['OTEL_EXPORTER_OTLP_ENDPOINT'];
  if (!endpoint) {
    console.warn('[aeos/telemetry-sdk] OTEL_EXPORTER_OTLP_ENDPOINT not set — tracing disabled');
    return;
  }

  sdk = new NodeSDK({
    resource: new Resource({
      [SEMRESATTRS_SERVICE_NAME]: serviceName,
      [SEMRESATTRS_SERVICE_VERSION]: serviceVersion,
      'aeos.platform_env': process.env['PLATFORM_ENV'] ?? 'local',
    }),
    traceExporter: new OTLPTraceExporter({ url: endpoint }),
  });

  sdk.start();

  process.on('SIGTERM', () => {
    void sdk?.shutdown();
  });
}

export function getTracer(name: string, version?: string): Tracer {
  return trace.getTracer(name, version);
}
