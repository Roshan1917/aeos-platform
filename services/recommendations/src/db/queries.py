from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from typing import Any, Optional

import asyncpg

async def insert_recommendation(
    pool: asyncpg.Pool,
    *,
    tenant_id: str,
    uop_id: str,
    agent_id: Optional[str],
    template_id: str,
    title: str,
    description: str,
    category: str,
    priority: str,
    estimated_impact_value: Optional[float],
    estimated_impact_currency: Optional[str],
    evidence_row_ids: list[str],
) -> Optional[str]:
    """
    Inserts a new recommendation if no open recommendation already exists
    for the same `(tenant_id, template_id, agent_id, uop_id)`. The check
    + insert run inside a single transaction; the partial unique index
    on the spans table is the second line of defense if two consumers
    race.

    Returns the new id, or None if a duplicate was suppressed.
    """
    rec_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc)
    async with pool.acquire() as conn:
        async with conn.transaction():
            existing = await conn.fetchval(
                """
                SELECT id FROM recommendations
                WHERE tenant_id = $1 AND template_id = $2
                  AND COALESCE(agent_id, '') = COALESCE($3, '')
                  AND uop_id = $4 AND status = 'open'
                FOR UPDATE
                """,
                tenant_id, template_id, agent_id, uop_id,
            )
            if existing is not None:
                return None
            try:
                await conn.execute(
                    """
                    INSERT INTO recommendations (
                        id, tenant_id, uop_id, agent_id, template_id, title,
                        description, category, priority,
                        estimated_impact_value, estimated_impact_currency,
                        status, evidence_row_ids, created_at, updated_at
                    ) VALUES (
                        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,
                        'open', $12::jsonb, $13, $14
                    )
                    """,
                    rec_id, tenant_id, uop_id, agent_id, template_id, title,
                    description, category, priority,
                    estimated_impact_value, estimated_impact_currency,
                    json.dumps(evidence_row_ids), now, now,
                )
            except asyncpg.UniqueViolationError:
                # Concurrent inserter beat us — the dedup index won the race.
                return None
    return rec_id


GET_RECOMMENDATION_SQL = """
SELECT id, tenant_id, uop_id, agent_id, template_id, title, description,
       category, priority, estimated_impact_value, estimated_impact_currency,
       status, evidence_row_ids, created_at, updated_at
FROM recommendations
WHERE tenant_id = $1 AND id = $2
"""


async def get_recommendation(
    pool: asyncpg.Pool, *, tenant_id: str, recommendation_id: str
) -> Optional[dict[str, Any]]:
    async with pool.acquire() as conn:
        row = await conn.fetchrow(GET_RECOMMENDATION_SQL, tenant_id, recommendation_id)
    return _row_to_dict(row) if row else None


async def list_recommendations(
    pool: asyncpg.Pool,
    *,
    tenant_id: str,
    status_filter: Optional[str] = None,
    uop_id: Optional[str] = None,
    agent_id: Optional[str] = None,
    category: Optional[str] = None,
    priority: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
) -> list[dict[str, Any]]:
    clauses = ["tenant_id = $1"]
    args: list[Any] = [tenant_id]
    if status_filter is not None:
        args.append(status_filter)
        clauses.append(f"status = ${len(args)}")
    if uop_id is not None:
        args.append(uop_id)
        clauses.append(f"uop_id = ${len(args)}")
    if agent_id is not None:
        args.append(agent_id)
        clauses.append(f"agent_id = ${len(args)}")
    if category is not None:
        args.append(category)
        clauses.append(f"category = ${len(args)}")
    if priority is not None:
        args.append(priority)
        clauses.append(f"priority = ${len(args)}")
    args.extend([limit, offset])
    sql = f"""
SELECT id, tenant_id, uop_id, agent_id, template_id, title, description,
       category, priority, estimated_impact_value, estimated_impact_currency,
       status, evidence_row_ids, created_at, updated_at
FROM recommendations
WHERE {' AND '.join(clauses)}
ORDER BY created_at DESC
LIMIT ${len(args) - 1} OFFSET ${len(args)}
"""
    async with pool.acquire() as conn:
        rows = await conn.fetch(sql, *args)
    return [_row_to_dict(r) for r in rows]


UPDATE_STATUS_SQL = """
UPDATE recommendations
SET status = $3, updated_at = NOW()
WHERE tenant_id = $1 AND id = $2
RETURNING id, status, updated_at,
  (SELECT status FROM recommendations WHERE tenant_id = $1 AND id = $2) AS previous_status_query
"""


async def update_status(
    pool: asyncpg.Pool, *, tenant_id: str, recommendation_id: str, new_status: str
) -> Optional[tuple[str, str]]:
    """
    Returns (previous_status, new_status) on success, None if not found.
    """
    async with pool.acquire() as conn:
        async with conn.transaction():
            existing = await conn.fetchrow(
                "SELECT status FROM recommendations WHERE tenant_id = $1 AND id = $2 FOR UPDATE",
                tenant_id,
                recommendation_id,
            )
            if existing is None:
                return None
            previous = existing["status"]
            await conn.execute(
                "UPDATE recommendations SET status = $3, updated_at = NOW() "
                "WHERE tenant_id = $1 AND id = $2",
                tenant_id,
                recommendation_id,
                new_status,
            )
    return (previous, new_status)


def _row_to_dict(row: asyncpg.Record) -> dict[str, Any]:
    d = dict(row)
    if isinstance(d.get("evidence_row_ids"), str):
        d["evidence_row_ids"] = json.loads(d["evidence_row_ids"])
    for ts_field in ("created_at", "updated_at"):
        v = d.get(ts_field)
        if isinstance(v, datetime):
            d[ts_field] = v.isoformat()
    # asyncpg returns UUID columns as uuid.UUID — coerce to str for
    # JSON-serializable Kafka payloads and HTTP responses.
    if (rid := d.get("id")) is not None and not isinstance(rid, str):
        d["id"] = str(rid)
    return d
