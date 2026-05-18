"""
POST /v1/spans — ingest endpoint.

Accepts a batch of AeosSpan objects from agent adapters or sidecar OTel
collectors. For each span:

  1. Validate the span and check that span.tenant_id matches the JWT.
  2. Classify span.kind from the span name.
  3. Resolve process_id from uop_id via cached registry lookup.
  4. Insert into Postgres (idempotent on (tenant_id, span_id)).
  5. Mirror to LangFuse for observability.
  6. Emit TelemetrySpanEnrichedEvent to Kafka.
  7. Observe agent_id (best effort).

Returns a per-span result so callers can retry partial failures.
"""
from __future__ import annotations

from datetime import datetime
from typing import Annotated, Any, Optional

from aeos_canonical_schema.types import AeosSpan, SpanKind, SpanStatus
from fastapi import APIRouter, Depends, status
from pydantic import BaseModel, Field

from ..auth.dependency import TelemetryIngestContext, get_telemetry_ingest_auth
from ..auth.service_jwt import mint_service_jwt
from ..config import config
from ..db.connection import get_pool
from ..db.queries import insert_span
from ..lib.agent_discovery import get_discovery
from ..lib.classifier import classify
from ..lib.emitter import get_emitter
from ..lib.enricher import get_enricher
from ..lib.langfuse_client import get_mirror

router = APIRouter()


class IngestSpansRequest(BaseModel):
    spans: list[AeosSpan] = Field(..., min_length=1, max_length=500)


class IngestSpanResult(BaseModel):
    span_id: str
    accepted: bool
    inserted: bool
    process_id: Optional[str] = None
    error: Optional[str] = None


class IngestSpansResponse(BaseModel):
    results: list[IngestSpanResult]


@router.post("/spans", response_model=IngestSpansResponse, status_code=status.HTTP_202_ACCEPTED)
async def ingest_spans(
    payload: IngestSpansRequest,
    auth: Annotated[TelemetryIngestContext, Depends(get_telemetry_ingest_auth)],
) -> IngestSpansResponse:
    pool = await get_pool()
    enricher = get_enricher()
    emitter = get_emitter()
    mirror = get_mirror()
    discovery = get_discovery()
    # Downstream substrate calls need an Authorization header — the inbound
    # ingest token is opaque and not understood by substrate, so we mint a
    # short-lived service JWT for telemetry → substrate hops.
    token = mint_service_jwt(auth.tenant_id)

    results: list[IngestSpanResult] = []
    for span in payload.spans:
        if span.tenant_id != auth.tenant_id:
            results.append(
                IngestSpanResult(
                    span_id=span.span_id,
                    accepted=False,
                    inserted=False,
                    error="tenant_mismatch",
                )
            )
            continue

        kind = classify(span.name, span.kind)
        try:
            process_id = await enricher.resolve_process_id(
                tenant_id=auth.tenant_id, uop_id=span.uop_id, token=token
            )
        except Exception as exc:
            results.append(
                IngestSpanResult(
                    span_id=span.span_id,
                    accepted=False,
                    inserted=False,
                    error=f"enrichment_failed: {exc}",
                )
            )
            continue

        attrs = _attrs_to_dict(span)
        events = [e.model_dump() for e in span.events]

        try:
            inserted = await insert_span(
                pool,
                tenant_id=span.tenant_id,
                span_id=span.span_id,
                trace_id=span.trace_id,
                parent_span_id=span.parent_span_id,
                agent_id=span.agent_id,
                uop_id=span.uop_id,
                process_id=process_id,
                decision_id=span.decision_id,
                name=span.name,
                kind=kind.value,
                start_time=_parse_ts(span.start_time),
                end_time=_parse_ts(span.end_time),
                duration_ms=span.duration_ms,
                status=_status_value(span.status),
                attributes=attrs,
                events=events,
                enrichment_version=config.ENRICHMENT_VERSION,
            )
        except Exception as exc:
            results.append(
                IngestSpanResult(
                    span_id=span.span_id,
                    accepted=False,
                    inserted=False,
                    error=f"db_insert_failed: {exc}",
                )
            )
            continue

        # Mirror + Kafka emit only for fresh inserts. Duplicates were already
        # processed downstream on first ingest, so we don't re-emit.
        if inserted:
            mirror.mirror(
                tenant_id=span.tenant_id,
                trace_id=span.trace_id,
                span_id=span.span_id,
                parent_span_id=span.parent_span_id,
                name=span.name,
                kind=kind,
                start_time=_parse_ts(span.start_time),
                end_time=_parse_ts(span.end_time),
                status=_status_value(span.status),
                attributes=attrs,
                agent_id=span.agent_id,
                uop_id=span.uop_id,
                process_id=process_id,
            )
            try:
                enriched_payload = _build_enriched_payload(
                    span=span,
                    kind=kind,
                    process_id=process_id,
                    attributes=attrs,
                    events=events,
                )
                await emitter.emit_enriched(
                    tenant_id=span.tenant_id, span_payload=enriched_payload
                )
            except Exception as exc:
                # The DB write succeeded but Kafka failed. Operationally this
                # means downstream consumers won't see the event; an out-of-band
                # reconciliation job would have to replay from the spans table.
                # We surface the error to the caller so they can retry.
                results.append(
                    IngestSpanResult(
                        span_id=span.span_id,
                        accepted=True,
                        inserted=True,
                        process_id=process_id,
                        error=f"kafka_emit_failed: {exc}",
                    )
                )
                continue

            await discovery.observe(
                tenant_id=span.tenant_id, agent_id=span.agent_id, token=token
            )

        results.append(
            IngestSpanResult(
                span_id=span.span_id,
                accepted=True,
                inserted=inserted,
                process_id=process_id,
            )
        )

    return IngestSpansResponse(results=results)


def _attrs_to_dict(span: AeosSpan) -> dict[str, Any]:
    """SpanAttributes uses field aliases (e.g. aeos.model_id). Dump by_alias."""
    return span.attributes.model_dump(by_alias=True, exclude_none=True)


def _parse_ts(value: str) -> datetime:
    # AeosSpan stores ISO8601 strings — the DB column is TIMESTAMPTZ
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def _status_value(s: SpanStatus | str) -> str:
    return s.value if isinstance(s, SpanStatus) else s


def _build_enriched_payload(
    *,
    span: AeosSpan,
    kind: SpanKind,
    process_id: Optional[str],
    attributes: dict[str, Any],
    events: list[dict[str, Any]],
) -> dict[str, Any]:
    """Builds the TelemetrySpanEnrichedEvent payload (AeosSpan + uop_id + process_id + enrichment_version)."""
    if not span.uop_id:
        # The TelemetrySpanEnrichedEvent contract requires uop_id. Spans without
        # a uop_id can't be emitted as enriched events; they live in the spans
        # table for query but skip the bus.
        raise ValueError("missing_uop_id")
    if not process_id:
        raise ValueError("unresolved_process_id")
    return {
        "schema_version": "1.0",
        "span_id": span.span_id,
        "trace_id": span.trace_id,
        "parent_span_id": span.parent_span_id,
        "tenant_id": span.tenant_id,
        "agent_id": span.agent_id,
        "uop_id": span.uop_id,
        "process_id": process_id,
        "decision_id": span.decision_id,
        "name": span.name,
        "kind": kind.value,
        "start_time": span.start_time,
        "end_time": span.end_time,
        "duration_ms": span.duration_ms,
        "status": _status_value(span.status),
        "attributes": attributes,
        "events": events,
        "enrichment_version": config.ENRICHMENT_VERSION,
    }
