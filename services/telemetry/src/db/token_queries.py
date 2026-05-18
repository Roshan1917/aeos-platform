from __future__ import annotations

from datetime import datetime
from typing import Any, Optional
from uuid import UUID

import asyncpg


INSERT_TOKEN_SQL = """
INSERT INTO telemetry_ingest_tokens (tenant_id, name, prefix, created_by, expires_at)
VALUES ($1, $2, $3, $4, $5)
RETURNING id, tenant_id, name, prefix, created_by, created_at, expires_at, revoked_at, last_used_at
"""


async def insert_token(
    pool: asyncpg.Pool,
    *,
    tenant_id: str,
    name: str,
    prefix: str,
    created_by: str,
    expires_at: Optional[datetime],
) -> dict[str, Any]:
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            INSERT_TOKEN_SQL, tenant_id, name, prefix, created_by, expires_at
        )
    return _row_to_dict(row)


LIST_TOKENS_SQL = """
SELECT id, tenant_id, name, prefix, created_by, created_at,
       expires_at, revoked_at, last_used_at
FROM telemetry_ingest_tokens
WHERE tenant_id = $1
ORDER BY created_at DESC
"""


async def list_tokens(pool: asyncpg.Pool, *, tenant_id: str) -> list[dict[str, Any]]:
    async with pool.acquire() as conn:
        rows = await conn.fetch(LIST_TOKENS_SQL, tenant_id)
    return [_row_to_dict(r) for r in rows]


GET_TOKEN_SQL = """
SELECT id, tenant_id, name, prefix, created_by, created_at,
       expires_at, revoked_at, last_used_at
FROM telemetry_ingest_tokens
WHERE id = $1 AND tenant_id = $2
"""


async def get_token(
    pool: asyncpg.Pool, *, token_id: UUID, tenant_id: str
) -> Optional[dict[str, Any]]:
    async with pool.acquire() as conn:
        row = await conn.fetchrow(GET_TOKEN_SQL, token_id, tenant_id)
    return _row_to_dict(row) if row else None


REVOKE_TOKEN_SQL = """
UPDATE telemetry_ingest_tokens
SET revoked_at = NOW()
WHERE id = $1 AND tenant_id = $2 AND revoked_at IS NULL
RETURNING id
"""


async def revoke_token(
    pool: asyncpg.Pool, *, token_id: UUID, tenant_id: str
) -> bool:
    async with pool.acquire() as conn:
        row = await conn.fetchrow(REVOKE_TOKEN_SQL, token_id, tenant_id)
    return row is not None


def _row_to_dict(row: asyncpg.Record) -> dict[str, Any]:
    d = dict(row)
    if isinstance(d.get("id"), UUID):
        d["id"] = str(d["id"])
    for ts in ("created_at", "expires_at", "revoked_at", "last_used_at"):
        v = d.get(ts)
        if isinstance(v, datetime):
            d[ts] = v.isoformat()
    return d
