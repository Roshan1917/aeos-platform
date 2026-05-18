"""
Kafka consumer that turns `ledger.variance.detected` events into
recommendations. One consumer per tenant since `aeos-event-bus-client`'s
`AeosConsumer` is tenant-scoped.

For dev / pooled multi-tenant deployments we accept a static list of
tenant IDs via `SUBSCRIBE_TENANT_IDS`. Dynamic tenant discovery (querying
substrate for active tenants and starting consumers per-tenant on the fly)
is on the v2 backlog.
"""
from __future__ import annotations

import logging
from typing import Any

from aeos_event_bus_client import AeosConsumer, create_consumer

from ..config import config
from ..db.connection import get_pool
from ..db.queries import insert_recommendation, get_recommendation
from .emitter import get_emitter
from .templates import candidates_for

logger = logging.getLogger(__name__)


class VarianceConsumerSet:
    """Manages one AeosConsumer per tenant."""

    def __init__(self) -> None:
        self._consumers: list[AeosConsumer] = []

    async def start(self) -> None:
        tenants = config.subscribe_tenant_list
        if not tenants:
            logger.warning(
                "SUBSCRIBE_TENANT_IDS empty; recommendations service will not "
                "consume any variance events. Set the env var to a comma-separated "
                "tenant id list."
            )
            return

        for tenant_id in tenants:
            consumer = create_consumer(
                tenant_id=tenant_id,
                group_id=f"{config.SERVICE_NAME}-variance",
                service=config.SERVICE_NAME,
            )
            consumer.on("ledger.variance.detected", self._make_handler(tenant_id))
            await consumer.start()
            self._consumers.append(consumer)
            logger.info("[recommendations] consuming variance for tenant=%s", tenant_id)

    async def stop(self) -> None:
        for c in self._consumers:
            try:
                await c.stop()
            except Exception as exc:
                logger.warning("Consumer stop error: %s", exc)
        self._consumers.clear()

    def _make_handler(self, tenant_id: str):
        async def handle(event: dict[str, Any]) -> None:
            await self._handle_variance(tenant_id, event)
        return handle

    async def _handle_variance(self, tenant_id: str, event: dict[str, Any]) -> None:
        payload = event.get("payload", {})
        if not isinstance(payload, dict):
            logger.warning("[recommendations] variance event missing payload: %s", event)
            return

        candidates = candidates_for(payload)
        if not candidates:
            logger.debug(
                "[recommendations] no template matched variance bucket=%s pct=%s",
                payload.get("variance_bucket"),
                payload.get("variance_pct"),
            )
            return

        pool = await get_pool()
        emitter = get_emitter()
        evidence_row_id = str(payload.get("variance_row_id", ""))
        uop_id = str(payload.get("uop_id", ""))
        agent_id = payload.get("agent_id")

        if not uop_id:
            logger.warning("[recommendations] variance missing uop_id; skipping: %s", payload)
            return

        for cand in candidates:
            new_id = await insert_recommendation(
                pool,
                tenant_id=tenant_id,
                uop_id=uop_id,
                agent_id=agent_id,
                template_id=cand.template_id,
                title=cand.title,
                description=cand.description,
                category=cand.category,
                priority=cand.priority,
                estimated_impact_value=cand.estimated_impact_value,
                estimated_impact_currency=cand.estimated_impact_currency,
                evidence_row_ids=[evidence_row_id] if evidence_row_id else [],
            )
            if new_id is None:
                logger.debug(
                    "[recommendations] open recommendation already exists: tpl=%s agent=%s uop=%s",
                    cand.template_id, agent_id, uop_id,
                )
                continue

            full = await get_recommendation(
                pool, tenant_id=tenant_id, recommendation_id=new_id
            )
            if full is None:
                logger.warning("[recommendations] freshly inserted rec missing: %s", new_id)
                continue

            try:
                await emitter.emit_created(
                    tenant_id=tenant_id, recommendation_payload=full
                )
            except Exception as exc:
                logger.error(
                    "[recommendations] kafka emit_created failed: rec=%s err=%s",
                    new_id, exc,
                )


_default: VarianceConsumerSet | None = None


def get_consumer_set() -> VarianceConsumerSet:
    global _default
    if _default is None:
        _default = VarianceConsumerSet()
    return _default
