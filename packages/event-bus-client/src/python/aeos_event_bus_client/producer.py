"""Async Kafka producer — tenant-scoped, canonical event headers."""
from __future__ import annotations

import asyncio
import json
import os
from typing import Any

from aiokafka import AIOKafkaProducer
from aiokafka.helpers import create_ssl_context

from .topic import topic_name


def _kafka_config() -> dict[str, Any]:
    brokers = os.environ.get("KAFKA_BROKERS", "localhost:9092")
    cfg: dict[str, Any] = {
        "bootstrap_servers": brokers,
        # Fast-fail timeouts. Without these the producer's defaults
        # (request_timeout_ms=40_000, no bootstrap deadline, retries to
        # infinity) let a Kafka outage stall every HTTP call sites that
        # synchronously emit. We saw this against MSK SCRAM with stale
        # creds — `/v1/spans` blocked >100s on bootstrap retries and
        # Cloudflare returned 504 even though Postgres inserts had
        # already succeeded. Capping these makes emit fail (and log)
        # within a few seconds; downstream callers handle the failure as
        # `kafka_emit_failed` per-span without affecting the HTTP path.
        # NOTE: `api_version_auto_timeout_ms` is a kafka-python kwarg —
        # aiokafka.AIOKafkaProducer rejects it. The bootstrap deadline
        # is enforced separately via `asyncio.wait_for(producer.start(),
        # …)` below, so we don't need a config-level knob here.
        "request_timeout_ms": int(os.environ.get("KAFKA_REQUEST_TIMEOUT_MS", "5000")),
        "metadata_max_age_ms": int(os.environ.get("KAFKA_METADATA_MAX_AGE_MS", "30000")),
        "connections_max_idle_ms": int(
            os.environ.get("KAFKA_CONNECTIONS_MAX_IDLE_MS", "60000"),
        ),
    }

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


class AeosProducer:
    """Async Kafka producer scoped to a single tenant."""

    def __init__(self, *, tenant_id: str, service: str) -> None:
        self.tenant_id = tenant_id
        self._service = service
        self._producer: AIOKafkaProducer | None = None

    async def _get_producer(self) -> AIOKafkaProducer:
        if self._producer is None:
            cfg = _kafka_config()
            producer = AIOKafkaProducer(
                client_id=f"aeos-{self._service}-producer",
                value_serializer=lambda v: json.dumps(v).encode(),
                **cfg,
            )
            # Hard cap on bootstrap. aiokafka's `start()` is normally
            # bounded by `request_timeout_ms`, but version-probe + DNS +
            # SASL handshake can each retry. Wrap in `wait_for` so the
            # caller never blocks more than ~8s waiting for a producer.
            start_timeout_s = float(
                os.environ.get("KAFKA_START_TIMEOUT_MS", "8000"),
            ) / 1000.0
            try:
                await asyncio.wait_for(producer.start(), timeout=start_timeout_s)
            except (asyncio.TimeoutError, Exception):
                # Make sure the half-started producer isn't kept around
                # (a future call would re-attempt bootstrap).
                try:
                    await producer.stop()
                except Exception:
                    pass
                raise
            self._producer = producer
        return self._producer

    async def publish(self, event: dict[str, Any]) -> None:
        """
        Publish a canonical AEOS event. event must include:
          event_type, event_id, tenant_id, timestamp, schema_version, payload
        """
        producer = await self._get_producer()
        event_type: str = event["event_type"]
        topic = topic_name(self.tenant_id, event_type)
        headers = [
            ("aeos-schema-version", b"1.0"),
            ("aeos-event-type", event_type.encode()),
            ("aeos-tenant-id", self.tenant_id.encode()),
        ]
        publish_timeout_s = float(
            os.environ.get("KAFKA_PUBLISH_TIMEOUT_MS", "8000"),
        ) / 1000.0
        await asyncio.wait_for(
            producer.send_and_wait(
                topic,
                value=event,
                key=event.get("event_id", "").encode(),
                headers=headers,
            ),
            timeout=publish_timeout_s,
        )

    async def disconnect(self) -> None:
        if self._producer is not None:
            await self._producer.stop()
            self._producer = None


def create_producer(*, tenant_id: str, service: str) -> AeosProducer:
    return AeosProducer(tenant_id=tenant_id, service=service)
