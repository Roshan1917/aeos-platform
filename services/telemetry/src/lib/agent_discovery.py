"""
Agent auto-discovery from incoming spans.

Pattern from AITT (`telemetry_agents` table + Cowork OTEL skill detection):
the first time we see an `agent_id` for a tenant, we update the substrate
Agent registry's last_seen marker. Unknown agent_ids are flagged for review
rather than auto-created — substrate is the source of truth for agent
identity, and silent creation would conflict with Agent Contract issuance.

This is best-effort: failures are logged but don't block ingestion.
"""
from __future__ import annotations

import logging
import time
from typing import Optional

from aeos_registry_client import AgentRegistry

from ..config import config

logger = logging.getLogger(__name__)

_TTL_SECONDS = 60  # don't bombard registry — refresh "seen" once per minute per (tenant, agent)


class AgentDiscovery:
    def __init__(self) -> None:
        self._seen: dict[tuple[str, str], float] = {}
        self._unknown: dict[tuple[str, str], float] = {}

    async def observe(
        self,
        *,
        tenant_id: str,
        agent_id: str,
        token: Optional[str] = None,
    ) -> None:
        key = (tenant_id, agent_id)
        now = time.monotonic()
        if (last := self._seen.get(key)) is not None and (now - last) < _TTL_SECONDS:
            return

        registry = AgentRegistry(
            tenant_id=tenant_id,
            base_url=str(config.REGISTRY_URL),
            token=token,
        )
        try:
            await registry.get(agent_id)
            self._seen[key] = now
        except Exception as exc:
            # Track unknown agents for operator visibility
            self._unknown[key] = now
            logger.info(
                "Span references unknown agent_id=%s tenant=%s: %s",
                agent_id,
                tenant_id,
                exc,
            )

    def unknown_agents(self) -> list[tuple[str, str]]:
        return list(self._unknown.keys())


_default: AgentDiscovery | None = None


def get_discovery() -> AgentDiscovery:
    global _default
    if _default is None:
        _default = AgentDiscovery()
    return _default
