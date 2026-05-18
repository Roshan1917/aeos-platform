from __future__ import annotations

from unittest.mock import AsyncMock, patch

import pytest

from src.lib.emitter import EnrichedEventEmitter


@pytest.mark.asyncio
async def test_emit_publishes_canonical_event() -> None:
    emitter = EnrichedEventEmitter()
    captured: dict = {}

    async def fake_publish(event: dict) -> None:
        captured.update(event)

    fake_producer = AsyncMock()
    fake_producer.publish = AsyncMock(side_effect=fake_publish)
    fake_producer.disconnect = AsyncMock()

    with patch("src.lib.emitter.create_producer", return_value=fake_producer):
        await emitter.emit_enriched(
            tenant_id="t1",
            span_payload={
                "schema_version": "1.0",
                "span_id": "s1",
                "trace_id": "tr1",
                "tenant_id": "t1",
                "agent_id": "a1",
                "uop_id": "u1",
                "process_id": "p1",
                "name": "aeos.llm.call",
                "kind": "llm_call",
                "start_time": "2026-04-28T12:00:00+00:00",
                "end_time": "2026-04-28T12:00:01+00:00",
                "duration_ms": 1000.0,
                "status": "ok",
                "attributes": {"aeos.model_id": "claude-sonnet-4-6"},
                "events": [],
                "enrichment_version": "1.0",
            },
        )

    assert captured["event_type"] == "telemetry.span.enriched"
    assert captured["schema_version"] == "1.0"
    assert captured["tenant_id"] == "t1"
    assert captured["payload"]["span_id"] == "s1"
    assert captured["payload"]["enrichment_version"] == "1.0"
    fake_producer.publish.assert_awaited_once()


@pytest.mark.asyncio
async def test_producer_cached_per_tenant() -> None:
    emitter = EnrichedEventEmitter()
    fake_producer = AsyncMock()
    fake_producer.publish = AsyncMock()
    fake_producer.disconnect = AsyncMock()

    with patch("src.lib.emitter.create_producer", return_value=fake_producer) as mock_create:
        for _ in range(3):
            await emitter.emit_enriched(
                tenant_id="t1",
                span_payload={"span_id": "s", "tenant_id": "t1"},
            )
        await emitter.emit_enriched(
            tenant_id="t2",
            span_payload={"span_id": "s", "tenant_id": "t2"},
        )

    # One producer per tenant — t1 reused 3x, t2 created fresh
    assert mock_create.call_count == 2


@pytest.mark.asyncio
async def test_shutdown_disconnects_all_producers() -> None:
    emitter = EnrichedEventEmitter()
    fake_producer = AsyncMock()
    fake_producer.publish = AsyncMock()
    fake_producer.disconnect = AsyncMock()

    with patch("src.lib.emitter.create_producer", return_value=fake_producer):
        await emitter.emit_enriched(tenant_id="t1", span_payload={"span_id": "s", "tenant_id": "t1"})
        await emitter.emit_enriched(tenant_id="t2", span_payload={"span_id": "s", "tenant_id": "t2"})
        await emitter.shutdown()

    assert fake_producer.disconnect.await_count == 2
