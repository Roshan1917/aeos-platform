"""
FastAPI dependency for AEOS JWT authentication.

Mode selection (checked in order):
  1. AUTH_JWKS_URI is set  → fetch JWKS from substrate, verify RS256/ES256 (production)
  2. AUTH_JWT_SECRET is set → verify HS256 directly (local dev)

Set AUTH_JWKS_URI to <AUTH_SERVICE_URL>/.well-known/jwks.json in non-local envs.
"""
from __future__ import annotations

import os
import time
from typing import Annotated, Optional

import httpx
import jwt
from fastapi import Depends, HTTPException, Request, status

from .types import AuthContext

# ── JWKS cache ────────────────────────────────────────────────────────────────

_JWKS_CACHE_TTL_SECONDS = 300  # 5 minutes

_jwks_cache: dict[str, dict] = {}  # uri → {"keys": [...], "fetched_at": float}


async def _fetch_jwks(jwks_uri: str) -> list[dict]:
    cached = _jwks_cache.get(jwks_uri)
    if cached and (time.time() - cached["fetched_at"]) < _JWKS_CACHE_TTL_SECONDS:
        return cached["keys"]

    async with httpx.AsyncClient(timeout=5.0) as client:
        response = await client.get(jwks_uri)

    if not response.is_success:
        raise RuntimeError(f"JWKS fetch failed: {response.status_code} {jwks_uri}")

    keys: list[dict] = response.json().get("keys", [])
    _jwks_cache[jwks_uri] = {"keys": keys, "fetched_at": time.time()}
    return keys


async def _get_jwks_public_key(jwks_uri: str, kid: Optional[str]) -> dict:
    """Return the raw JWK dict matching the given kid (or first key)."""
    keys = await _fetch_jwks(jwks_uri)
    if kid:
        key = next((k for k in keys if k.get("kid") == kid), None)
        if key is None:
            # Stale cache — force refresh once
            _jwks_cache.pop(jwks_uri, None)
            keys = await _fetch_jwks(jwks_uri)
            key = next((k for k in keys if k.get("kid") == kid), None)
    else:
        key = keys[0] if keys else None

    if key is None:
        raise RuntimeError(f"No matching JWKS key (kid={kid})")
    return key


# ── Token decoding ────────────────────────────────────────────────────────────

async def _decode_token(token: str) -> dict:
    jwks_uri = os.environ.get("AUTH_JWKS_URI")
    secret = os.environ.get("AUTH_JWT_SECRET")

    if jwks_uri:
        # Production: RS256 / ES256 via JWKS
        try:
            # Decode header without verification to extract kid
            header = jwt.get_unverified_header(token)
            kid = header.get("kid")
            alg = header.get("alg", "RS256")

            jwk = await _get_jwks_public_key(jwks_uri, kid)

            # PyJWT ≥ 2.4 can accept a JWK dict directly via PyJWK
            from jwt import PyJWK  # noqa: PLC0415 — lazy import (cryptography dep optional)

            signing_key = PyJWK(jwk, algorithm=alg)
            return jwt.decode(
                token,
                signing_key.key,
                algorithms=[alg],
                options={"verify_aud": False},
            )
        except jwt.ExpiredSignatureError:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token expired",
            )
        except jwt.InvalidTokenError as exc:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail=f"Invalid token: {exc}",
            )
    elif secret:
        # Local dev: HS256
        try:
            return jwt.decode(token, secret, algorithms=["HS256"])
        except jwt.ExpiredSignatureError:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token expired",
            )
        except jwt.InvalidTokenError:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token",
            )
    else:
        raise RuntimeError(
            "Auth not configured: set AUTH_JWKS_URI (prod) or AUTH_JWT_SECRET (dev)"
        )


# ── FastAPI dependency ────────────────────────────────────────────────────────

async def get_current_auth(request: Request) -> AuthContext:
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authorization header required",
        )
    token = auth_header[7:]
    payload = await _decode_token(token)
    return AuthContext(
        user_id=payload["sub"],
        tenant_id=payload["tenant_id"],
        roles=payload.get("roles", []),
        agent_contract_id=payload.get("agent_contract_id"),
    )


def require_auth() -> Annotated[AuthContext, Depends(get_current_auth)]:
    return Depends(get_current_auth)
