from __future__ import annotations

import pytest

from src.auth.revocation_cache import RevocationCache


class _FakePool:
    def __init__(self, ids: list[str]) -> None:
        self._ids = ids

    def acquire(self):
        return _FakeAcquire(self._ids)


class _FakeAcquire:
    def __init__(self, ids: list[str]) -> None:
        self._ids = ids

    async def __aenter__(self):
        return _FakeConn(self._ids)

    async def __aexit__(self, *_):
        return None


class _FakeConn:
    def __init__(self, ids: list[str]) -> None:
        self._ids = ids

    async def fetch(self, _sql: str):
        return [{"id": i} for i in self._ids]


@pytest.mark.asyncio
async def test_refresh_loads_revoked_set() -> None:
    cache = RevocationCache()
    pool = _FakePool(["abc", "def"])
    await cache.refresh(pool)  # type: ignore[arg-type]
    assert cache.is_revoked("abc")
    assert cache.is_revoked("def")
    assert not cache.is_revoked("ghi")


@pytest.mark.asyncio
async def test_mark_revoked_takes_effect_immediately() -> None:
    cache = RevocationCache()
    pool = _FakePool([])
    await cache.refresh(pool)  # type: ignore[arg-type]
    assert not cache.is_revoked("xyz")
    cache.mark_revoked("xyz")
    assert cache.is_revoked("xyz")


@pytest.mark.asyncio
async def test_refresh_replaces_set() -> None:
    cache = RevocationCache()
    await cache.refresh(_FakePool(["a"]))  # type: ignore[arg-type]
    await cache.refresh(_FakePool(["b"]))  # type: ignore[arg-type]
    assert not cache.is_revoked("a")
    assert cache.is_revoked("b")
