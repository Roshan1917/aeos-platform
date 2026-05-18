"""FastAPI dependency: validate ``Authorization: Bearer aeos_tlm_...`` ingest tokens."""
from __future__ import annotations

from dataclasses import dataclass

from fastapi import HTTPException, Request, status

from ..config import config
from .ingest_token import InvalidIngestToken, verify
from .revocation_cache import get_revocation_cache


@dataclass(frozen=True)
class TelemetryIngestContext:
    tenant_id: str
    token_id: str


def _bearer(request: Request) -> str | None:
    h = request.headers.get("Authorization", "")
    return h[7:] if h.startswith("Bearer ") else None


async def get_telemetry_ingest_auth(request: Request) -> TelemetryIngestContext:
    secret = config.TELEMETRY_TOKEN_SIGNING_SECRET
    if not secret:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Telemetry ingest auth not configured: set TELEMETRY_TOKEN_SIGNING_SECRET",
        )

    token = _bearer(request)
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authorization header required",
        )

    try:
        claims = verify(token, secret=secret)
    except InvalidIngestToken as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid telemetry token: {exc}",
        )

    if get_revocation_cache().is_revoked(claims.token_id):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Telemetry token revoked",
        )

    return TelemetryIngestContext(
        tenant_id=claims.tenant_id, token_id=claims.token_id
    )
