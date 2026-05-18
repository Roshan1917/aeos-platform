"""
Span enrichment — resolve `process_id` from `uop_id` via the substrate
ProcessRegistry.

Pattern lifted from AITT (`src/collectors/sdk/mapping-cache.ts`): per-tenant
in-memory cache with a short TTL avoids hammering the substrate registry
for high-volume span streams while still picking up new mappings within
~30 seconds of registration.
"""
from __future__ import annotations

import time
from typing import Optional

from aeos_registry_client import ProcessRegistry

from ..config import config


class _CacheEntry:
    __slots__ = ("process_id", "expires_at")

    def __init__(self, process_id: Optional[str], ttl_seconds: int) -> None:
        self.process_id = process_id
        self.expires_at = time.monotonic() + ttl_seconds


class ProcessEnricher:
    """Caches uop_id → process_id lookups per tenant. Tenant-scoped registry calls."""

    def __init__(self, *, ttl_seconds: int | None = None) -> None:
        self._ttl = ttl_seconds if ttl_seconds is not None else config.ENRICHMENT_CACHE_TTL_SECONDS
        # key: (tenant_id, uop_id) → _CacheEntry
        self._cache: dict[tuple[str, str], _CacheEntry] = {}

    def _get_cached(self, tenant_id: str, uop_id: str) -> _CacheEntry | None:
        entry = self._cache.get((tenant_id, uop_id))
        if entry is None:
            return None
        if entry.expires_at < time.monotonic():
            self._cache.pop((tenant_id, uop_id), None)
            return None
        return entry

    async def resolve_process_id(
        self,
        *,
        tenant_id: str,
        uop_id: Optional[str],
        token: Optional[str] = None,
    ) -> Optional[str]:
        if uop_id is None:
            return None

        cached = self._get_cached(tenant_id, uop_id)
        if cached is not None:
            return cached.process_id

        registry = ProcessRegistry(
            tenant_id=tenant_id,
            base_url=str(config.REGISTRY_URL),
            token=token,
        )
        try:
            processes = await registry.list_by_uop(uop_id)
        except Exception:
            # Cache the miss for the TTL to avoid hot-looping on registry errors
            self._cache[(tenant_id, uop_id)] = _CacheEntry(None, self._ttl)
            return None

        active = [p for p in processes if p.get("status") == "active"]
        process_id = (active[0]["id"] if active else None)
        self._cache[(tenant_id, uop_id)] = _CacheEntry(process_id, self._ttl)
        return process_id

    def invalidate(self, *, tenant_id: str | None = None) -> None:
        if tenant_id is None:
            self._cache.clear()
            return
        for key in list(self._cache.keys()):
            if key[0] == tenant_id:
                self._cache.pop(key, None)


_default_enricher: ProcessEnricher | None = None


def get_enricher() -> ProcessEnricher:
    global _default_enricher
    if _default_enricher is None:
        _default_enricher = ProcessEnricher()
    return _default_enricher
