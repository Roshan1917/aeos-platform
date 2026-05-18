from __future__ import annotations

import pytest
from fastapi import HTTPException

from src.auth.dependency import get_telemetry_ingest_auth
from src.auth.ingest_token import mint
from src.auth.revocation_cache import get_revocation_cache
from src.config import config


class _FakeRequest:
    def __init__(self, headers: dict[str, str]) -> None:
        self.headers = headers


@pytest.mark.asyncio
async def test_dependency_accepts_valid_token():
    token = mint(
        tenant_id="tenant-x",
        token_id="kid-1",
        secret=config.TELEMETRY_TOKEN_SIGNING_SECRET,  # type: ignore[arg-type]
    )
    request = _FakeRequest({"Authorization": f"Bearer {token}"})
    ctx = await get_telemetry_ingest_auth(request)  # type: ignore[arg-type]
    assert ctx.tenant_id == "tenant-x"
    assert ctx.token_id == "kid-1"


@pytest.mark.asyncio
async def test_dependency_rejects_missing_header():
    request = _FakeRequest({})
    with pytest.raises(HTTPException) as exc:
        await get_telemetry_ingest_auth(request)  # type: ignore[arg-type]
    assert exc.value.status_code == 401


@pytest.mark.asyncio
async def test_dependency_rejects_revoked_token():
    cache = get_revocation_cache()
    cache.mark_revoked("kid-revoked")
    token = mint(
        tenant_id="tenant-x",
        token_id="kid-revoked",
        secret=config.TELEMETRY_TOKEN_SIGNING_SECRET,  # type: ignore[arg-type]
    )
    request = _FakeRequest({"Authorization": f"Bearer {token}"})
    with pytest.raises(HTTPException) as exc:
        await get_telemetry_ingest_auth(request)  # type: ignore[arg-type]
    assert exc.value.status_code == 401
    assert "revoked" in exc.value.detail.lower()


@pytest.mark.asyncio
async def test_dependency_rejects_bad_signature():
    request = _FakeRequest({"Authorization": "Bearer aeos_tlm_garbage.garbage"})
    with pytest.raises(HTTPException) as exc:
        await get_telemetry_ingest_auth(request)  # type: ignore[arg-type]
    assert exc.value.status_code == 401
