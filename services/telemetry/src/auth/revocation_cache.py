"""
In-memory revocation set for telemetry ingest tokens.

Tokens are HMAC-signed and verified locally — but revocation requires shared
state. We trade per-request DB hits for periodic refreshes: every
``TELEMETRY_REVOCATION_REFRESH_SECONDS`` the cache reloads the set of revoked
``token_id`` values from Postgres. Worst-case staleness equals the refresh
interval and is documented in ``CLAUDE.md``.
"""
from __future__ import annotations

import asyncio
import logging
from typing import Optional

import asyncpg

logger = logging.getLogger(__name__)

LIST_REVOKED_SQL = (
    "SELECT id::text FROM telemetry_ingest_tokens WHERE revoked_at IS NOT NULL"
)


class RevocationCache:
    def __init__(self) -> None:
        self._revoked: set[str] = set()
        self._lock = asyncio.Lock()
        self._task: Optional[asyncio.Task[None]] = None

    def is_revoked(self, token_id: str) -> bool:
        return token_id in self._revoked

    def mark_revoked(self, token_id: str) -> None:
        """Fast-path local revoke. Also persisted in DB by the API handler."""
        self._revoked.add(token_id)

    async def refresh(self, pool: asyncpg.Pool) -> None:
        async with pool.acquire() as conn:
            rows = await conn.fetch(LIST_REVOKED_SQL)
        revoked = {row["id"] for row in rows}
        async with self._lock:
            self._revoked = revoked

    async def start(self, pool: asyncpg.Pool, interval_seconds: int) -> None:
        await self.refresh(pool)
        self._task = asyncio.create_task(self._loop(pool, interval_seconds))

    async def _loop(self, pool: asyncpg.Pool, interval_seconds: int) -> None:
        while True:
            try:
                await asyncio.sleep(interval_seconds)
                await self.refresh(pool)
            except asyncio.CancelledError:
                raise
            except Exception:
                logger.exception("revocation cache refresh failed")

    async def stop(self) -> None:
        if self._task is not None:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
            self._task = None


_default: Optional[RevocationCache] = None


def get_revocation_cache() -> RevocationCache:
    global _default
    if _default is None:
        _default = RevocationCache()
    return _default
