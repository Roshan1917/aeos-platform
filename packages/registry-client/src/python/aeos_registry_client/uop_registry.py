"""UoP Registry client — read/write access to the UoP semantic registry."""
from __future__ import annotations

from typing import Any

import httpx


class UoPRegistry:
    def __init__(self, *, tenant_id: str, base_url: str, token: str | None = None) -> None:
        self._tenant_id = tenant_id
        self._base_url = base_url.rstrip("/")
        self._token = token

    def _headers(self) -> dict[str, str]:
        h = {}
        if self._token:
            h["Authorization"] = f"Bearer {self._token}"
        return h

    async def get(self, uop_id: str) -> dict[str, Any]:
        async with httpx.AsyncClient() as client:
            r = await client.get(
                f"{self._base_url}/v1/tenants/{self._tenant_id}/uops/{uop_id}",
                headers=self._headers(),
            )
        if not r.is_success:
            raise RuntimeError(f"UoP {uop_id} not found: {r.status_code}")
        return r.json()

    async def list(
        self,
        *,
        status: str | None = None,
        category: str | None = None,
    ) -> list[dict[str, Any]]:
        params: dict[str, str] = {}
        if status:
            params["status"] = status
        if category:
            params["category"] = category
        async with httpx.AsyncClient() as client:
            r = await client.get(
                f"{self._base_url}/v1/tenants/{self._tenant_id}/uops",
                params=params,
                headers=self._headers(),
            )
        if not r.is_success:
            raise RuntimeError(f"Failed to list UoPs: {r.status_code}")
        return r.json()

    async def create(self, uop: dict[str, Any]) -> dict[str, Any]:
        """Assessment service only — other services are read-only."""
        async with httpx.AsyncClient() as client:
            r = await client.post(
                f"{self._base_url}/v1/tenants/{self._tenant_id}/uops",
                json=uop,
                headers=self._headers(),
            )
        if not r.is_success:
            raise RuntimeError(f"Failed to create UoP: {r.status_code} {r.text}")
        return r.json()
