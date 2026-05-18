from __future__ import annotations

import os
import httpx

from .types import AgentIdentityVerification


async def verify_agent_contract(contract_id: str, agent_id: str) -> AgentIdentityVerification:
    auth_service_url = os.environ.get("AUTH_SERVICE_URL")
    if not auth_service_url:
        raise RuntimeError("AUTH_SERVICE_URL not configured")

    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"{auth_service_url}/v1/agent-contracts/{contract_id}/verify",
            json={"agent_id": agent_id},
        )

    if not response.is_success:
        return AgentIdentityVerification(valid=False)

    body = response.json()
    return AgentIdentityVerification(
        valid=body["valid"],
        agent_id=body.get("agent_id"),
        uop_id=body.get("uop_id"),
    )
