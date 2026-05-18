"""
Span name → SpanKind classifier.

Maps the OTel span names emitted by the AEOS Adapter SDK
(sdk/packages/sdk-core/src/emitter.ts) to canonical SpanKind values.

Falls through to `internal` for unknown names so that infra/self-instrumentation
spans (e.g., HTTP server spans from FastAPI auto-instrumentation) are still
ingestible without classification errors.
"""
from __future__ import annotations

from aeos_canonical_schema.types import SpanKind

_NAME_TO_KIND: dict[str, SpanKind] = {
    "aeos.llm.call": SpanKind.LLM_CALL,
    "aeos.tool.call": SpanKind.TOOL_CALL,
    "aeos.decision": SpanKind.AGENT_DECISION,
    "aeos.human_override": SpanKind.HUMAN_HANDOFF,
}


def classify(span_name: str, existing_kind: SpanKind | str | None = None) -> SpanKind:
    """
    Returns the SpanKind for `span_name`. If `existing_kind` is a non-internal
    classification already provided by the caller, it wins (caller knows best).
    """
    if existing_kind is not None:
        kind = existing_kind if isinstance(existing_kind, SpanKind) else SpanKind(existing_kind)
        if kind != SpanKind.INTERNAL:
            return kind
    return _NAME_TO_KIND.get(span_name, SpanKind.INTERNAL)
