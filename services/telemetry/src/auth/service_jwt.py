"""
Service JWT minting for telemetry → substrate calls.

When telemetry authenticates an inbound request via an ingest token, there is
no upstream user JWT to forward to substrate (registry lookups, agent
discovery). This module mints a short-lived HS256 JWT signed with the shared
``AUTH_JWT_SECRET`` so substrate accepts the call as the ``telemetry-service``
acting on behalf of a specific tenant.

Production note: when substrate moves to JWKS-only verification, this HS256
path stops working. At that point telemetry must obtain a service JWT issued
by substrate itself (e.g. via a service-account credential). Tracked in
``services/telemetry/CLAUDE.md``.
"""
from __future__ import annotations

import os
import time
from typing import Optional

import jwt

_SERVICE_JWT_TTL_SECONDS = 300  # 5 min — short enough to limit blast radius, long enough to avoid per-request signing
_SERVICE_USER_ID = "telemetry-service"

_cache: dict[str, tuple[str, int]] = {}  # tenant_id → (token, expires_at)


def mint_service_jwt(tenant_id: str, *, now: Optional[int] = None) -> Optional[str]:
    """Return an HS256 JWT for telemetry → substrate calls. None if not configured."""
    secret = os.environ.get("AUTH_JWT_SECRET")
    if not secret:
        return None

    current = now if now is not None else int(time.time())

    cached = _cache.get(tenant_id)
    if cached is not None:
        token, exp = cached
        if exp - current > 30:  # 30s safety margin
            return token

    exp = current + _SERVICE_JWT_TTL_SECONDS
    payload = {
        "sub": _SERVICE_USER_ID,
        "tenant_id": tenant_id,
        "roles": ["service:telemetry"],
        "iat": current,
        "exp": exp,
    }
    token = jwt.encode(payload, secret, algorithm="HS256")
    _cache[tenant_id] = (token, exp)
    return token


def clear_cache() -> None:
    _cache.clear()
