"""
Kafka emitter for `recommendations.created` and `recommendations.status_changed`.
Mirrors the per-tenant producer caching pattern from telemetry.
"""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Any

from aeos_event_bus_client import AeosProducer, create_producer

from ..config import config

logger = logging.getLogger(__name__)


class RecommendationsEmitter:
    def __init__(self) -> None:
        self._producers: dict[str, AeosProducer] = {}

    def _producer_for(self, tenant_id: str) -> AeosProducer:
        producer = self._producers.get(tenant_id)
        if producer is None:
            producer = create_producer(tenant_id=tenant_id, service=config.SERVICE_NAME)
            self._producers[tenant_id] = producer
        return producer

    async def emit_created(
        self, *, tenant_id: str, recommendation_payload: dict[str, Any]
    ) -> None:
        event = {
            "event_type": "recommendations.created",
            "schema_version": "1.0",
            "event_id": str(uuid.uuid4()),
            "tenant_id": tenant_id,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "payload": recommendation_payload,
        }
        try:
            await self._producer_for(tenant_id).publish(event)
        except Exception as exc:
            logger.error(
                "Kafka emit (created) failed for tenant=%s rec=%s: %s",
                tenant_id,
                recommendation_payload.get("id"),
                exc,
            )
            raise

    async def emit_status_changed(
        self,
        *,
        tenant_id: str,
        recommendation_id: str,
        previous_status: str,
        new_status: str,
        changed_by: str,
        reason: str | None = None,
    ) -> None:
        payload: dict[str, Any] = {
            "recommendation_id": recommendation_id,
            "previous_status": previous_status,
            "new_status": new_status,
            "changed_by": changed_by,
        }
        if reason is not None:
            payload["reason"] = reason
        event = {
            "event_type": "recommendations.status_changed",
            "schema_version": "1.0",
            "event_id": str(uuid.uuid4()),
            "tenant_id": tenant_id,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "payload": payload,
        }
        try:
            await self._producer_for(tenant_id).publish(event)
        except Exception as exc:
            logger.error(
                "Kafka emit (status_changed) failed for tenant=%s rec=%s: %s",
                tenant_id,
                recommendation_id,
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


_default: RecommendationsEmitter | None = None


def get_emitter() -> RecommendationsEmitter:
    global _default
    if _default is None:
        _default = RecommendationsEmitter()
    return _default
