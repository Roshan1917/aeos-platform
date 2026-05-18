from __future__ import annotations

import os
import httpx
from fastapi import HTTPException, status

from .types import AuthContext, PermissionCheckResult


async def check_permission(ctx: AuthContext, resource: str, action: str) -> PermissionCheckResult:
    auth_service_url = os.environ.get("AUTH_SERVICE_URL")
    if not auth_service_url:
        raise RuntimeError("AUTH_SERVICE_URL not configured")

    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"{auth_service_url}/v1/rbac/check",
            json={"user_id": ctx.user_id, "tenant_id": ctx.tenant_id, "resource": resource, "action": action},
        )
    if not response.is_success:
        raise RuntimeError(f"RBAC check failed: {response.status_code}")

    body = response.json()
    return PermissionCheckResult(allowed=body["allowed"], reason=body.get("reason"))


async def require_permission(ctx: AuthContext, resource: str, action: str) -> None:
    result = await check_permission(ctx, resource, action)
    if not result.allowed:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Forbidden: {resource}:{action}",
        )
