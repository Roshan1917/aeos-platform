from __future__ import annotations

from unittest.mock import AsyncMock, patch

import pytest

from src.lib.emitter import RecommendationsEmitter


@pytest.mark.asyncio
async def test_emit_created_publishes_canonical_event() -> None:
    emitter = RecommendationsEmitter()
    captured: dict = {}

    async def fake_publish(event: dict) -> None:
        captured.update(event)

    fake_producer = AsyncMock()
    fake_producer.publish = AsyncMock(side_effect=fake_publish)
    fake_producer.disconnect = AsyncMock()

    rec_payload = {
        "id": "rec-1",
        "tenant_id": "t1",
        "uop_id": "u1",
        "agent_id": "a1",
        "template_id": "severe-underperformance-model-swap",
        "title": "x",
        "description": "y",
        "category": "model_swap",
        "priority": "high",
        "status": "open",
        "evidence_row_ids": ["var-1"],
    }

    with patch("src.lib.emitter.create_producer", return_value=fake_producer):
        await emitter.emit_created(tenant_id="t1", recommendation_payload=rec_payload)

    assert captured["event_type"] == "recommendations.created"
    assert captured["schema_version"] == "1.0"
    assert captured["tenant_id"] == "t1"
    assert captured["payload"]["id"] == "rec-1"


@pytest.mark.asyncio
async def test_emit_status_changed_includes_transition() -> None:
    emitter = RecommendationsEmitter()
    captured: dict = {}

    async def fake_publish(event: dict) -> None:
        captured.update(event)

    fake_producer = AsyncMock()
    fake_producer.publish = AsyncMock(side_effect=fake_publish)
    fake_producer.disconnect = AsyncMock()

    with patch("src.lib.emitter.create_producer", return_value=fake_producer):
        await emitter.emit_status_changed(
            tenant_id="t1",
            recommendation_id="rec-1",
            previous_status="open",
            new_status="adopted",
            changed_by="user-42",
            reason="rolled out via JIRA-123",
        )

    assert captured["event_type"] == "recommendations.status_changed"
    payload = captured["payload"]
    assert payload["recommendation_id"] == "rec-1"
    assert payload["previous_status"] == "open"
    assert payload["new_status"] == "adopted"
    assert payload["changed_by"] == "user-42"
    assert payload["reason"] == "rolled out via JIRA-123"


@pytest.mark.asyncio
async def test_status_changed_omits_reason_when_none() -> None:
    emitter = RecommendationsEmitter()
    captured: dict = {}

    async def fake_publish(event: dict) -> None:
        captured.update(event)

    fake_producer = AsyncMock()
    fake_producer.publish = AsyncMock(side_effect=fake_publish)
    fake_producer.disconnect = AsyncMock()

    with patch("src.lib.emitter.create_producer", return_value=fake_producer):
        await emitter.emit_status_changed(
            tenant_id="t1",
            recommendation_id="rec-1",
            previous_status="open",
            new_status="dismissed",
            changed_by="user-42",
        )

    assert "reason" not in captured["payload"]


@pytest.mark.asyncio
async def test_producer_cached_per_tenant() -> None:
    emitter = RecommendationsEmitter()
    fake_producer = AsyncMock()
    fake_producer.publish = AsyncMock()
    fake_producer.disconnect = AsyncMock()

    with patch("src.lib.emitter.create_producer", return_value=fake_producer) as mock_create:
        for _ in range(3):
            await emitter.emit_created(
                tenant_id="t1", recommendation_payload={"id": "r"}
            )
        await emitter.emit_created(
            tenant_id="t2", recommendation_payload={"id": "r"}
        )

    assert mock_create.call_count == 2
