from __future__ import annotations

import asyncio
from typing import Any
from unittest.mock import AsyncMock, patch

import pytest

from src.lib.enricher import ProcessEnricher


@pytest.fixture
def enricher() -> ProcessEnricher:
    return ProcessEnricher(ttl_seconds=30)


@pytest.mark.asyncio
async def test_resolve_returns_first_active_process(enricher: ProcessEnricher) -> None:
    fake_processes = [
        {"id": "proc-deprecated", "status": "deprecated"},
        {"id": "proc-active-1", "status": "active"},
        {"id": "proc-active-2", "status": "active"},
    ]
    with patch(
        "src.lib.enricher.ProcessRegistry.list_by_uop",
        new=AsyncMock(return_value=fake_processes),
    ):
        result = await enricher.resolve_process_id(tenant_id="t1", uop_id="uop-1")
    assert result == "proc-active-1"


@pytest.mark.asyncio
async def test_resolve_returns_none_when_no_active(enricher: ProcessEnricher) -> None:
    with patch(
        "src.lib.enricher.ProcessRegistry.list_by_uop",
        new=AsyncMock(return_value=[{"id": "p", "status": "deprecated"}]),
    ):
        assert await enricher.resolve_process_id(tenant_id="t1", uop_id="uop-1") is None


@pytest.mark.asyncio
async def test_resolve_returns_none_when_uop_id_missing(enricher: ProcessEnricher) -> None:
    assert await enricher.resolve_process_id(tenant_id="t1", uop_id=None) is None


@pytest.mark.asyncio
async def test_cache_hits_avoid_second_registry_call(enricher: ProcessEnricher) -> None:
    mock = AsyncMock(return_value=[{"id": "p", "status": "active"}])
    with patch("src.lib.enricher.ProcessRegistry.list_by_uop", new=mock):
        await enricher.resolve_process_id(tenant_id="t1", uop_id="uop-1")
        await enricher.resolve_process_id(tenant_id="t1", uop_id="uop-1")
    assert mock.await_count == 1


@pytest.mark.asyncio
async def test_cache_is_per_tenant(enricher: ProcessEnricher) -> None:
    mock = AsyncMock(return_value=[{"id": "p", "status": "active"}])
    with patch("src.lib.enricher.ProcessRegistry.list_by_uop", new=mock):
        await enricher.resolve_process_id(tenant_id="t1", uop_id="uop-1")
        await enricher.resolve_process_id(tenant_id="t2", uop_id="uop-1")
    assert mock.await_count == 2


@pytest.mark.asyncio
async def test_registry_failure_caches_miss(enricher: ProcessEnricher) -> None:
    mock = AsyncMock(side_effect=RuntimeError("network blip"))
    with patch("src.lib.enricher.ProcessRegistry.list_by_uop", new=mock):
        first = await enricher.resolve_process_id(tenant_id="t1", uop_id="uop-1")
        second = await enricher.resolve_process_id(tenant_id="t1", uop_id="uop-1")
    assert first is None and second is None
    # Cached miss → only one attempt
    assert mock.await_count == 1


@pytest.mark.asyncio
async def test_invalidate_per_tenant() -> None:
    e = ProcessEnricher(ttl_seconds=30)
    mock = AsyncMock(return_value=[{"id": "p", "status": "active"}])
    with patch("src.lib.enricher.ProcessRegistry.list_by_uop", new=mock):
        await e.resolve_process_id(tenant_id="t1", uop_id="uop-1")
        await e.resolve_process_id(tenant_id="t2", uop_id="uop-1")
        assert mock.await_count == 2
        e.invalidate(tenant_id="t1")
        await e.resolve_process_id(tenant_id="t1", uop_id="uop-1")
        await e.resolve_process_id(tenant_id="t2", uop_id="uop-1")
    assert mock.await_count == 3  # only t1 was re-fetched
