from __future__ import annotations

import json
from datetime import datetime
from typing import Any, Optional

import asyncpg

INSERT_SPAN_SQL = """
INSERT INTO spans (
    tenant_id, span_id, trace_id, parent_span_id,
    agent_id, uop_id, process_id, decision_id,
    name, kind, start_time, end_time, duration_ms,
    status, attributes, events, enrichment_version
) VALUES (
    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15::jsonb, $16::jsonb, $17
)
ON CONFLICT (tenant_id, span_id) DO NOTHING
RETURNING id, span_id
"""


async def insert_span(
    pool: asyncpg.Pool,
    *,
    tenant_id: str,
    span_id: str,
    trace_id: str,
    parent_span_id: Optional[str],
    agent_id: str,
    uop_id: Optional[str],
    process_id: Optional[str],
    decision_id: Optional[str],
    name: str,
    kind: str,
    start_time: datetime,
    end_time: datetime,
    duration_ms: float,
    status: str,
    attributes: dict[str, Any],
    events: list[dict[str, Any]],
    enrichment_version: str,
) -> bool:
    """
    Idempotent insert. Returns True if a new row was inserted, False on conflict.
    Conflict resolution: ON CONFLICT (tenant_id, span_id) DO NOTHING — duplicate
    spans are silently dropped to support at-least-once delivery from collectors.
    """
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            INSERT_SPAN_SQL,
            tenant_id,
            span_id,
            trace_id,
            parent_span_id,
            agent_id,
            uop_id,
            process_id,
            decision_id,
            name,
            kind,
            start_time,
            end_time,
            duration_ms,
            status,
            json.dumps(attributes),
            json.dumps(events),
            enrichment_version,
        )
    return row is not None


GET_SPAN_SQL = """
SELECT span_id, trace_id, parent_span_id, agent_id, uop_id, process_id,
       decision_id, name, kind, start_time, end_time, duration_ms, status,
       attributes, events, enrichment_version, ingested_at
FROM spans
WHERE tenant_id = $1 AND span_id = $2
"""


async def get_span(
    pool: asyncpg.Pool, *, tenant_id: str, span_id: str
) -> Optional[dict[str, Any]]:
    async with pool.acquire() as conn:
        row = await conn.fetchrow(GET_SPAN_SQL, tenant_id, span_id)
    return _row_to_dict(row) if row else None


GET_TRACE_SQL = """
SELECT span_id, trace_id, parent_span_id, agent_id, uop_id, process_id,
       decision_id, name, kind, start_time, end_time, duration_ms, status,
       attributes, events, enrichment_version, ingested_at
FROM spans
WHERE tenant_id = $1 AND trace_id = $2
ORDER BY start_time ASC
"""


async def get_trace(
    pool: asyncpg.Pool, *, tenant_id: str, trace_id: str
) -> list[dict[str, Any]]:
    async with pool.acquire() as conn:
        rows = await conn.fetch(GET_TRACE_SQL, tenant_id, trace_id)
    return [_row_to_dict(r) for r in rows]


async def list_spans(
    pool: asyncpg.Pool,
    *,
    tenant_id: str,
    agent_id: Optional[str] = None,
    uop_id: Optional[str] = None,
    kind: Optional[str] = None,
    start_after: Optional[datetime] = None,
    end_before: Optional[datetime] = None,
    limit: int = 50,
    offset: int = 0,
) -> list[dict[str, Any]]:
    clauses = ["tenant_id = $1"]
    args: list[Any] = [tenant_id]
    if agent_id is not None:
        args.append(agent_id)
        clauses.append(f"agent_id = ${len(args)}")
    if uop_id is not None:
        args.append(uop_id)
        clauses.append(f"uop_id = ${len(args)}")
    if kind is not None:
        args.append(kind)
        clauses.append(f"kind = ${len(args)}")
    if start_after is not None:
        args.append(start_after)
        clauses.append(f"start_time >= ${len(args)}")
    if end_before is not None:
        args.append(end_before)
        clauses.append(f"end_time <= ${len(args)}")
    args.extend([limit, offset])
    sql = f"""
SELECT span_id, trace_id, parent_span_id, agent_id, uop_id, process_id,
       decision_id, name, kind, start_time, end_time, duration_ms, status,
       attributes, events, enrichment_version, ingested_at
FROM spans
WHERE {' AND '.join(clauses)}
ORDER BY start_time DESC
LIMIT ${len(args) - 1} OFFSET ${len(args)}
"""
    async with pool.acquire() as conn:
        rows = await conn.fetch(sql, *args)
    return [_row_to_dict(r) for r in rows]


def _row_to_dict(row: asyncpg.Record) -> dict[str, Any]:
    d = dict(row)
    if isinstance(d.get("attributes"), str):
        d["attributes"] = json.loads(d["attributes"])
    if isinstance(d.get("events"), str):
        d["events"] = json.loads(d["events"])
    for ts_field in ("start_time", "end_time", "ingested_at"):
        v = d.get(ts_field)
        if isinstance(v, datetime):
            d[ts_field] = v.isoformat()
    return d
