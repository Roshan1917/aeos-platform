"""
Consumer handler tests — exercise `_handle_variance` directly with a mocked
DB pool, mocked emitter, and synthetic events.
"""
from __future__ import annotations

from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from src.lib.consumer import VarianceConsumerSet


def _event(**payload_overrides: Any) -> dict[str, Any]:
    payload = {
        "variance_row_id": "var-1",
        "uop_id": "uop-1",
        "agent_id": "agent-1",
        "variance_bucket": "negative_underperformance",
        "variance_pct": -25.0,
    }
    payload.update(payload_overrides)
    return {
        "event_type": "ledger.variance.detected",
        "schema_version": "1.0",
        "event_id": "evt-1",
        "tenant_id": "t1",
        "timestamp": "2026-04-28T12:00:00Z",
        "payload": payload,
    }


@pytest.mark.asyncio
async def test_handle_variance_creates_recommendation_and_emits() -> None:
    cs = VarianceConsumerSet()

    fake_pool = MagicMock()
    fake_emitter = AsyncMock()
    fake_emitter.emit_created = AsyncMock()

    with (
        patch("src.lib.consumer.get_pool", new=AsyncMock(return_value=fake_pool)),
        patch("src.lib.consumer.get_emitter", return_value=fake_emitter),
        patch(
            "src.lib.consumer.insert_recommendation",
            new=AsyncMock(return_value="rec-uuid-123"),
        ),
        patch(
            "src.lib.consumer.get_recommendation",
            new=AsyncMock(return_value={"id": "rec-uuid-123", "tenant_id": "t1"}),
        ),
    ):
        await cs._handle_variance("t1", _event())

    fake_emitter.emit_created.assert_awaited_once()
    args = fake_emitter.emit_created.call_args.kwargs
    assert args["tenant_id"] == "t1"
    assert args["recommendation_payload"]["id"] == "rec-uuid-123"


@pytest.mark.asyncio
async def test_handle_variance_skips_when_no_template_matches() -> None:
    cs = VarianceConsumerSet()

    fake_pool = MagicMock()
    fake_emitter = AsyncMock()
    fake_emitter.emit_created = AsyncMock()

    with (
        patch("src.lib.consumer.get_pool", new=AsyncMock(return_value=fake_pool)),
        patch("src.lib.consumer.get_emitter", return_value=fake_emitter),
        patch("src.lib.consumer.insert_recommendation", new=AsyncMock()) as ins,
    ):
        # within_tolerance has no matching template
        await cs._handle_variance(
            "t1", _event(variance_bucket="within_tolerance", variance_pct=2.0)
        )

    ins.assert_not_called()
    fake_emitter.emit_created.assert_not_called()


@pytest.mark.asyncio
async def test_handle_variance_skips_duplicate_open_rec() -> None:
    cs = VarianceConsumerSet()

    fake_pool = MagicMock()
    fake_emitter = AsyncMock()
    fake_emitter.emit_created = AsyncMock()

    with (
        patch("src.lib.consumer.get_pool", new=AsyncMock(return_value=fake_pool)),
        patch("src.lib.consumer.get_emitter", return_value=fake_emitter),
        # insert_recommendation returns None when an open dup exists
        patch(
            "src.lib.consumer.insert_recommendation",
            new=AsyncMock(return_value=None),
        ),
    ):
        await cs._handle_variance("t1", _event())

    fake_emitter.emit_created.assert_not_called()


@pytest.mark.asyncio
async def test_handle_variance_skips_when_uop_id_missing() -> None:
    cs = VarianceConsumerSet()
    fake_emitter = AsyncMock()

    with (
        patch("src.lib.consumer.get_pool", new=AsyncMock()),
        patch("src.lib.consumer.get_emitter", return_value=fake_emitter),
        patch("src.lib.consumer.insert_recommendation", new=AsyncMock()) as ins,
    ):
        await cs._handle_variance("t1", _event(uop_id=""))

    ins.assert_not_called()


@pytest.mark.asyncio
async def test_handle_variance_skips_when_payload_not_dict() -> None:
    cs = VarianceConsumerSet()
    fake_emitter = AsyncMock()

    with (
        patch("src.lib.consumer.get_pool", new=AsyncMock()),
        patch("src.lib.consumer.get_emitter", return_value=fake_emitter),
        patch("src.lib.consumer.insert_recommendation", new=AsyncMock()) as ins,
    ):
        bad_event = {"event_type": "ledger.variance.detected", "payload": "not a dict"}
        await cs._handle_variance("t1", bad_event)

    ins.assert_not_called()
