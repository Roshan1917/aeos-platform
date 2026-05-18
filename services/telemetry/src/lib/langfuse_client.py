"""
LangFuse client wrapper — observability mirror.

Each ingested AeosSpan is also written to LangFuse so that human operators can
inspect the LLM traces with the standard LangFuse UI. LLM-call spans use
`generation` (so token/cost metadata renders); other spans use `span`.

LangFuse access is best-effort — failures here do not block enrichment or
Kafka emission. We log the error and move on.
"""
from __future__ import annotations

import logging
from datetime import datetime
from typing import Any, Optional

from aeos_canonical_schema.types import SpanKind

from ..config import config

logger = logging.getLogger(__name__)


class LangfuseMirror:
    def __init__(self) -> None:
        self._client: Any | None = None
        if not config.LANGFUSE_ENABLED:
            return
        try:
            from langfuse import Langfuse  # type: ignore[import-not-found]

            self._client = Langfuse(
                public_key=config.LANGFUSE_PUBLIC_KEY,
                secret_key=config.LANGFUSE_SECRET_KEY,
                host=config.LANGFUSE_HOST,
            )
        except Exception as exc:
            logger.warning("Langfuse client init failed; mirror disabled: %s", exc)
            self._client = None

    @property
    def enabled(self) -> bool:
        return self._client is not None

    def mirror(
        self,
        *,
        tenant_id: str,
        trace_id: str,
        span_id: str,
        parent_span_id: Optional[str],
        name: str,
        kind: SpanKind,
        start_time: datetime,
        end_time: datetime,
        status: str,
        attributes: dict[str, Any],
        agent_id: str,
        uop_id: Optional[str],
        process_id: Optional[str],
    ) -> None:
        if self._client is None:
            return
        try:
            trace = self._client.trace(
                id=trace_id,
                name=f"agent:{agent_id}",
                user_id=tenant_id,
                metadata={
                    "tenant_id": tenant_id,
                    "agent_id": agent_id,
                    "uop_id": uop_id,
                    "process_id": process_id,
                },
            )
            common = {
                "id": span_id,
                "trace_id": trace_id,
                "parent_observation_id": parent_span_id,
                "name": name,
                "start_time": start_time,
                "end_time": end_time,
                "metadata": attributes,
                "level": "ERROR" if status == "error" else "DEFAULT",
            }
            if kind == SpanKind.LLM_CALL:
                trace.generation(
                    **common,
                    model=attributes.get("aeos.model_id"),
                    usage={
                        "input": attributes.get("aeos.input_tokens"),
                        "output": attributes.get("aeos.output_tokens"),
                        "total_cost": attributes.get("aeos.cost_usd"),
                    },
                )
            else:
                trace.span(**common)
        except Exception as exc:
            logger.warning("Langfuse mirror failed for span %s: %s", span_id, exc)

    async def flush(self) -> None:
        if self._client is None:
            return
        try:
            self._client.flush()
        except Exception as exc:
            logger.warning("Langfuse flush failed: %s", exc)


_default: LangfuseMirror | None = None


def get_mirror() -> LangfuseMirror:
    global _default
    if _default is None:
        _default = LangfuseMirror()
    return _default
