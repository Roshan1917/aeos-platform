"""Process Registry client."""
from __future__ import annotations

from typing import Any

import httpx


class ProcessRegistry:
    def __init__(self, *, tenant_id: str, base_url: str, token: str | None = None) -> None:
        self._tenant_id = tenant_id
        self._base_url = base_url.rstrip("/")
        self._token = token

    def _headers(self) -> dict[str, str]:
        h = {}
        if self._token:
            h["Authorization"] = f"Bearer {self._token}"
        return h

    async def get(self, process_id: str) -> dict[str, Any]:
        async with httpx.AsyncClient() as client:
            r = await client.get(
                f"{self._base_url}/v1/tenants/{self._tenant_id}/processes/{process_id}",
                headers=self._headers(),
            )
        if not r.is_success:
            raise RuntimeError(f"Process {process_id} not found: {r.status_code}")
        return r.json()

    async def list_by_uop(self, uop_id: str) -> list[dict[str, Any]]:
        async with httpx.AsyncClient() as client:
            r = await client.get(
                f"{self._base_url}/v1/tenants/{self._tenant_id}/processes",
                params={"uop_id": uop_id},
                headers=self._headers(),
            )
        if not r.is_success:
            raise RuntimeError(f"Failed to list processes: {r.status_code}")
        return r.json()

    async def list(self, *, status: str | None = None) -> list[dict[str, Any]]:
        params: dict[str, str] = {}
        if status:
            params["status"] = status
        async with httpx.AsyncClient() as client:
            r = await client.get(
                f"{self._base_url}/v1/tenants/{self._tenant_id}/processes",
                params=params,
                headers=self._headers(),
            )
        if not r.is_success:
            raise RuntimeError(f"Failed to list processes: {r.status_code}")
        return r.json()

    async def create(self, process: dict[str, Any]) -> dict[str, Any]:
        """Process Discovery service only — other services are read-only."""
        async with httpx.AsyncClient() as client:
            r = await client.post(
                f"{self._base_url}/v1/tenants/{self._tenant_id}/processes",
                json=process,
                headers=self._headers(),
            )
        if not r.is_success:
            raise RuntimeError(f"Failed to create Process: {r.status_code} {r.text}")
        return r.json()
