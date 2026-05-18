"""
Kafka emitter for `telemetry.span.enriched` events.

One AeosProducer is cached per tenant_id since the producer in
aeos-event-bus-client is constructed with a tenant scope baked in. We never
share a producer across tenants because the tenant_id appears in the
canonical event headers and topic name.
"""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Any

from aeos_event_bus_client import AeosProducer, create_producer

from ..config import config

logger = logging.getLogger(__name__)


class EnrichedEventEmitter:
    def __init__(self) -> None:
        self._producers: dict[str, AeosProducer] = {}

    def _producer_for(self, tenant_id: str) -> AeosProducer:
        producer = self._producers.get(tenant_id)
        if producer is None:
            producer = create_producer(tenant_id=tenant_id, service=config.SERVICE_NAME)
            self._producers[tenant_id] = producer
        return producer

    async def emit_enriched(self, *, tenant_id: str, span_payload: dict[str, Any]) -> None:
        """
        Publish a TelemetrySpanEnrichedEvent. `span_payload` must already include
        the enrichment fields (`uop_id`, `process_id`, `enrichment_version`).
        """
        event = {
            "event_type": "telemetry.span.enriched",
            "schema_version": "1.0",
            "event_id": str(uuid.uuid4()),
            "tenant_id": tenant_id,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "payload": span_payload,
        }
        try:
            await self._producer_for(tenant_id).publish(event)
        except Exception as exc:
            logger.error(
                "Kafka emit failed for tenant=%s span=%s: %s",
                tenant_id,
                span_payload.get("span_id"),
                exc,
            )
            raise

    async def shutdown(self) -> None:
        for producer in self._producers.values():
            try:
                await producer.disconnect()
            except Exception as exc:
                logger.warning("Producer shutdown error: %s", exc)
        self._producers.clear()


_default: EnrichedEventEmitter | None = None


def get_emitter() -> EnrichedEventEmitter:
    global _default
    if _default is None:
        _default = EnrichedEventEmitter()
    return _default
