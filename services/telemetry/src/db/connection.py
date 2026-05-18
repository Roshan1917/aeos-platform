from __future__ import annotations

from typing import Optional

import asyncpg

from ..config import config

_pool: Optional[asyncpg.Pool] = None


async def _set_search_path(conn: asyncpg.Connection) -> None:
    # Quoted identifier blocks injection from a misconfigured env var.
    # Used as both `init` (per-connection lifetime) and `setup` (per-acquire)
    # because the pool may hand out a connection whose session state was
    # reset between acquires (asyncpg discards prepared statements when
    # the server reports a backend reset). Re-asserting on acquire avoids
    # `relation does not exist` if that happens.
    await conn.execute(f'SET search_path TO "{config.DATABASE_SCHEMA}"')


async def init_pool() -> asyncpg.Pool:
    global _pool
    if _pool is None:
        _pool = await asyncpg.create_pool(
            config.DATABASE_URL,
            min_size=2,
            max_size=10,
            command_timeout=30,
            init=_set_search_path,
            setup=_set_search_path,
        )
    return _pool


async def get_pool() -> asyncpg.Pool:
    if _pool is None:
        return await init_pool()
    return _pool


async def close_pool() -> None:
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None
