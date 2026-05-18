"""
GET /v1/spans          — list spans (tenant-scoped, filtered)
GET /v1/spans/{id}     — fetch single span
GET /v1/traces/{id}    — fetch all spans in a trace
"""
from __future__ import annotations

from datetime import datetime
from typing import Annotated, Any, Optional

from aeos_auth_client import AuthContext, get_current_auth
from fastapi import APIRouter, Depends, HTTPException, Query, status

from ..db.connection import get_pool
from ..db.queries import get_span as q_get_span
from ..db.queries import get_trace as q_get_trace
from ..db.queries import list_spans as q_list_spans

router = APIRouter()


@router.get("/spans")
async def list_spans(
    auth: Annotated[AuthContext, Depends(get_current_auth)],
    agent_id: Optional[str] = None,
    uop_id: Optional[str] = None,
    kind: Optional[str] = None,
    start_after: Optional[datetime] = None,
    end_before: Optional[datetime] = None,
    limit: int = Query(default=50, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
) -> dict[str, Any]:
    pool = await get_pool()
    rows = await q_list_spans(
        pool,
        tenant_id=auth.tenant_id,
        agent_id=agent_id,
        uop_id=uop_id,
        kind=kind,
        start_after=start_after,
        end_before=end_before,
        limit=limit,
        offset=offset,
    )
    return {"spans": rows, "limit": limit, "offset": offset}


@router.get("/spans/{span_id}")
async def get_span(
    span_id: str,
    auth: Annotated[AuthContext, Depends(get_current_auth)],
) -> dict[str, Any]:
    pool = await get_pool()
    row = await q_get_span(pool, tenant_id=auth.tenant_id, span_id=span_id)
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="span_not_found")
    return row


@router.get("/traces/{trace_id}")
async def get_trace(
    trace_id: str,
    auth: Annotated[AuthContext, Depends(get_current_auth)],
) -> dict[str, Any]:
    pool = await get_pool()
    rows = await q_get_trace(pool, tenant_id=auth.tenant_id, trace_id=trace_id)
    return {"trace_id": trace_id, "spans": rows}
