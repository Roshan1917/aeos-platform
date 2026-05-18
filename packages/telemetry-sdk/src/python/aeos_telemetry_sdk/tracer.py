"""Pre-configured OTEL tracer — call init_tracing() once at service startup."""
from __future__ import annotations

import logging
import os
import signal

from opentelemetry import trace
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
from opentelemetry.semconv.resource import ResourceAttributes

logger = logging.getLogger(__name__)

_initialized = False


def init_tracing(service_name: str, service_version: str = "0.0.0") -> None:
    """
    Configure OTEL SDK for the given service. Call once at startup.
    No-op if OTEL_EXPORTER_OTLP_ENDPOINT is not set (tracing disabled).
    """
    global _initialized  # noqa: PLW0603
    if _initialized:
        return

    endpoint = os.environ.get("OTEL_EXPORTER_OTLP_ENDPOINT")
    if not endpoint:
        logger.warning(
            "[aeos/telemetry-sdk] OTEL_EXPORTER_OTLP_ENDPOINT not set — tracing disabled"
        )
        return

    resource = Resource(
        attributes={
            ResourceAttributes.SERVICE_NAME: service_name,
            ResourceAttributes.SERVICE_VERSION: service_version,
            "aeos.platform_env": os.environ.get("PLATFORM_ENV", "local"),
        }
    )

    provider = TracerProvider(resource=resource)
    exporter = OTLPSpanExporter(endpoint=endpoint)
    provider.add_span_processor(BatchSpanProcessor(exporter))
    trace.set_tracer_provider(provider)

    _initialized = True

    def _shutdown(*_: object) -> None:
        provider.shutdown()

    signal.signal(signal.SIGTERM, _shutdown)


def get_tracer(name: str, version: str | None = None) -> trace.Tracer:
    """Return a tracer for the given instrumentation scope."""
    return trace.get_tracer(name, version)
