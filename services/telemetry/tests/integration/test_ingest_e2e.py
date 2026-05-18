"""
End-to-end ingest test — requires the local-dev stack (postgres, kafka,
substrate). Skipped when DATABASE_URL is unset.

Run with the stack up:
    cd local-dev && docker-compose up -d
    cd services/telemetry && pytest tests/integration/
"""
from __future__ import annotations

import os
import uuid

import pytest

DATABASE_URL = os.environ.get("DATABASE_URL")

pytestmark = pytest.mark.skipif(
    DATABASE_URL is None,
    reason="DATABASE_URL not set; integration test requires local stack",
)


@pytest.mark.asyncio
async def test_ingest_round_trip() -> None:
    """
    Smoke test: insert a span via the queries module, read it back,
    confirm idempotency.
    """
    import asyncpg

    from src.db.queries import get_span, insert_span

    pool = await asyncpg.create_pool(DATABASE_URL, min_size=1, max_size=2)
    try:
        tenant = "test-tenant"
        span_id = f"span-{uuid.uuid4()}"
        from datetime import datetime, timezone

        now = datetime.now(timezone.utc)
        kwargs = dict(
            tenant_id=tenant,
            span_id=span_id,
            trace_id="trace-xyz",
            parent_span_id=None,
            agent_id="agent-test",
            uop_id="uop-test",
            process_id="proc-test",
            decision_id="dec-1",
            name="aeos.llm.call",
            kind="llm_call",
            start_time=now,
            end_time=now,
            duration_ms=42.0,
            status="ok",
            attributes={"aeos.model_id": "claude-sonnet-4-6"},
            events=[],
            enrichment_version="1.0",
        )
        first = await insert_span(pool, **kwargs)
        second = await insert_span(pool, **kwargs)
        assert first is True
        assert second is False  # idempotent

        row = await get_span(pool, tenant_id=tenant, span_id=span_id)
        assert row is not None
        assert row["kind"] == "llm_call"
        assert row["process_id"] == "proc-test"
    finally:
        async with pool.acquire() as c:
            await c.execute("DELETE FROM spans WHERE tenant_id = 'test-tenant'")
        await pool.close()
