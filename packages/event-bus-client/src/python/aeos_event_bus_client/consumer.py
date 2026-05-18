"""Async Kafka consumer — event-type handler registration, tenant-scoped topics."""
from __future__ import annotations

import asyncio
import json
import logging
import os
from collections.abc import Awaitable, Callable
from typing import Any

from aiokafka import AIOKafkaConsumer
from aiokafka.helpers import create_ssl_context

from .topic import topic_name

logger = logging.getLogger(__name__)

EventHandler = Callable[[dict[str, Any]], Awaitable[None]]


def _kafka_config() -> dict[str, Any]:
    brokers = os.environ.get("KAFKA_BROKERS", "localhost:9092")
    cfg: dict[str, Any] = {"bootstrap_servers": brokers}

    if os.environ.get("KAFKA_SSL", "false").lower() == "true":
        cfg["ssl_context"] = create_ssl_context()
        cfg["security_protocol"] = "SASL_SSL"

    username = os.environ.get("KAFKA_SASL_USERNAME")
    password = os.environ.get("KAFKA_SASL_PASSWORD")
    if username and password:
        cfg["sasl_mechanism"] = "SCRAM-SHA-512"
        cfg["sasl_plain_username"] = username
        cfg["sasl_plain_password"] = password

    return cfg


class AeosConsumer:
    """Async Kafka consumer with per-event-type handler dispatch."""

    def __init__(self, *, tenant_id: str, group_id: str, service: str) -> None:
        self.tenant_id = tenant_id
        self._group_id = group_id
        self._service = service
        self._handlers: dict[str, EventHandler] = {}
        self._consumer: AIOKafkaConsumer | None = None
        self._task: asyncio.Task | None = None

    def on(self, event_type: str, handler: EventHandler) -> "AeosConsumer":
        """Register a handler for an event type. Returns self for chaining."""
        self._handlers[event_type] = handler
        return self

    async def start(self) -> None:
        """Connect and begin consuming. Runs handlers in the background."""
        topics = [
            topic_name(self.tenant_id, event_type)
            for event_type in self._handlers
        ]
        cfg = _kafka_config()
        self._consumer = AIOKafkaConsumer(
            *topics,
            group_id=self._group_id,
            client_id=f"aeos-{self._service}-consumer",
            auto_offset_reset="latest",
            value_deserializer=lambda v: json.loads(v.decode()),
            **cfg,
        )
        await self._consumer.start()
        self._task = asyncio.create_task(self._consume_loop())

    async def _consume_loop(self) -> None:
        assert self._consumer is not None
        try:
            async for msg in self._consumer:
                event: dict[str, Any] = msg.value
                event_type = event.get("event_type", "")
                handler = self._handlers.get(event_type)
                if handler:
                    try:
                        await handler(event)
                    except Exception:
                        logger.exception(
                            "[aeos/event-bus-client] Handler error for event_type=%s",
                            event_type,
                        )
        except asyncio.CancelledError:
            pass

    async def stop(self) -> None:
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        if self._consumer:
            await self._consumer.stop()
            self._consumer = None


def create_consumer(*, tenant_id: str, group_id: str, service: str) -> AeosConsumer:
    return AeosConsumer(tenant_id=tenant_id, group_id=group_id, service=service)
