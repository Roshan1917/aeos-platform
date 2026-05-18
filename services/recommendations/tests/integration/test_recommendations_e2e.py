"""
End-to-end DB test — requires the local-dev stack (postgres). Skipped when
DATABASE_URL is unset.

Run with the stack up:
    cd local-dev && docker-compose up -d
    cd services/recommendations && alembic upgrade head
    cd services/recommendations && pytest tests/integration/
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
async def test_dedup_open_recommendation() -> None:
    """First insert wins, second open dup is suppressed, status update unblocks future inserts."""
    import asyncpg

    from src.db.queries import (
        insert_recommendation,
        list_recommendations,
        update_status,
    )

    pool = await asyncpg.create_pool(DATABASE_URL, min_size=1, max_size=2)
    try:
        tenant = "test-tenant-rec"
        uop = f"uop-{uuid.uuid4()}"
        agent = f"agent-{uuid.uuid4()}"
        kwargs = dict(
            tenant_id=tenant,
            uop_id=uop,
            agent_id=agent,
            template_id="severe-underperformance-model-swap",
            title="t",
            description="d",
            category="model_swap",
            priority="high",
            estimated_impact_value=None,
            estimated_impact_currency=None,
            evidence_row_ids=["var-1"],
        )

        first = await insert_recommendation(pool, **kwargs)
        assert first is not None

        # Open dup suppressed
        second = await insert_recommendation(pool, **kwargs)
        assert second is None

        # Listing returns one row
        rows = await list_recommendations(pool, tenant_id=tenant, status_filter="open")
        assert len(rows) == 1

        # Mark adopted; now a fresh insert should succeed (template can re-fire)
        transition = await update_status(
            pool, tenant_id=tenant, recommendation_id=first, new_status="adopted"
        )
        assert transition == ("open", "adopted")

        third = await insert_recommendation(pool, **kwargs)
        assert third is not None
        assert third != first
    finally:
        async with pool.acquire() as c:
            await c.execute("DELETE FROM recommendations WHERE tenant_id = $1", "test-tenant-rec")
        await pool.close()
