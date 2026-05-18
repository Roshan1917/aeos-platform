"""Agent Registry client."""
from __future__ import annotations

from typing import Any

import httpx


class AgentRegistry:
    def __init__(self, *, tenant_id: str, base_url: str, token: str | None = None) -> None:
        self._tenant_id = tenant_id
        self._base_url = base_url.rstrip("/")
        self._token = token

    def _headers(self) -> dict[str, str]:
        h = {}
        if self._token:
            h["Authorization"] = f"Bearer {self._token}"
        return h

    async def get(self, agent_id: str) -> dict[str, Any]:
        async with httpx.AsyncClient() as client:
            r = await client.get(
                f"{self._base_url}/v1/tenants/{self._tenant_id}/agents/{agent_id}",
                headers=self._headers(),
            )
        if not r.is_success:
            raise RuntimeError(f"Agent {agent_id} not found: {r.status_code}")
        return r.json()

    async def list(self, *, status: str | None = None) -> list[dict[str, Any]]:
        params: dict[str, str] = {}
        if status:
            params["status"] = status
        async with httpx.AsyncClient() as client:
            r = await client.get(
                f"{self._base_url}/v1/tenants/{self._tenant_id}/agents",
                params=params,
                headers=self._headers(),
            )
        if not r.is_success:
            raise RuntimeError(f"Failed to list agents: {r.status_code}")
        return r.json()
