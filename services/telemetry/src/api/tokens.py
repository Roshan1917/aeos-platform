"""
Admin endpoints for managing telemetry ingest tokens.

Authenticated with the regular substrate user JWT (``get_current_auth``) and
gated to tenant admins. Tokens themselves are minted/verified entirely
inside telemetry — substrate is not involved in the ingest path.
"""
from __future__ import annotations

from datetime import datetime
from typing import Annotated, Optional
from uuid import UUID

from aeos_auth_client import AuthContext, get_current_auth
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from ..auth.ingest_token import display_prefix, mint
from ..auth.revocation_cache import get_revocation_cache
from ..config import config
from ..db.connection import get_pool
from ..db.token_queries import insert_token, list_tokens, revoke_token

router = APIRouter()

_ADMIN_ROLES = {"admin", "tenant_admin", "platform_admin"}


def _require_admin(auth: AuthContext) -> None:
    if not any(role in _ADMIN_ROLES for role in auth.roles):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Tenant admin role required",
        )


class CreateTokenRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    expires_at: Optional[datetime] = None


class TokenSummary(BaseModel):
    id: str
    tenant_id: str
    name: str
    prefix: str
    created_by: str
    created_at: str
    expires_at: Optional[str] = None
    revoked_at: Optional[str] = None
    last_used_at: Optional[str] = None


class CreateTokenResponse(TokenSummary):
    token: str = Field(..., description="Raw token. Shown once — store securely.")


class ListTokensResponse(BaseModel):
    tokens: list[TokenSummary]


@router.post(
    "/telemetry-tokens",
    response_model=CreateTokenResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_telemetry_token(
    payload: CreateTokenRequest,
    auth: Annotated[AuthContext, Depends(get_current_auth)],
) -> CreateTokenResponse:
    _require_admin(auth)

    secret = config.TELEMETRY_TOKEN_SIGNING_SECRET
    if not secret:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="TELEMETRY_TOKEN_SIGNING_SECRET not configured",
        )

    pool = await get_pool()
    expires_at = payload.expires_at
    # Insert first to get the token id (kid). Prefix is set after we mint.
    row = await insert_token(
        pool,
        tenant_id=auth.tenant_id,
        name=payload.name,
        prefix="",  # filled in by UPDATE below
        created_by=auth.user_id,
        expires_at=expires_at,
    )

    raw = mint(
        tenant_id=auth.tenant_id,
        token_id=row["id"],
        secret=secret,
        expires_at=int(expires_at.timestamp()) if expires_at else None,
    )
    prefix = display_prefix(raw)

    async with pool.acquire() as conn:
        await conn.execute(
            "UPDATE telemetry_ingest_tokens SET prefix = $1 WHERE id = $2",
            prefix,
            UUID(row["id"]),
        )
    row["prefix"] = prefix

    return CreateTokenResponse(token=raw, **row)


@router.get("/telemetry-tokens", response_model=ListTokensResponse)
async def list_telemetry_tokens(
    auth: Annotated[AuthContext, Depends(get_current_auth)],
) -> ListTokensResponse:
    _require_admin(auth)
    pool = await get_pool()
    rows = await list_tokens(pool, tenant_id=auth.tenant_id)
    return ListTokensResponse(tokens=[TokenSummary(**r) for r in rows])


@router.delete(
    "/telemetry-tokens/{token_id}", status_code=status.HTTP_204_NO_CONTENT
)
async def revoke_telemetry_token(
    token_id: UUID,
    auth: Annotated[AuthContext, Depends(get_current_auth)],
) -> None:
    _require_admin(auth)
    pool = await get_pool()
    revoked = await revoke_token(pool, token_id=token_id, tenant_id=auth.tenant_id)
    if not revoked:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Token not found or already revoked",
        )
    # Fast-path local revoke so the next ingest request doesn't have to wait
    # for the periodic refresh.
    get_revocation_cache().mark_revoked(str(token_id))
