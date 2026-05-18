"""
GET    /v1/recommendations           — list (tenant-scoped)
GET    /v1/recommendations/{id}      — fetch single
PATCH  /v1/recommendations/{id}      — update status (open/in_progress/adopted/dismissed)
"""
from __future__ import annotations

from typing import Annotated, Any, Literal, Optional

from aeos_auth_client import AuthContext, get_current_auth
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel

from ..db.connection import get_pool
from ..db.queries import (
    get_recommendation,
    list_recommendations,
    update_status,
)
from ..lib.emitter import get_emitter

router = APIRouter()

VALID_STATUSES = {"open", "in_progress", "adopted", "dismissed"}


@router.get("/recommendations")
async def list_endpoint(
    auth: Annotated[AuthContext, Depends(get_current_auth)],
    status_filter: Annotated[Optional[str], Query(alias="status")] = None,
    uop_id: Optional[str] = None,
    agent_id: Optional[str] = None,
    category: Optional[str] = None,
    priority: Optional[str] = None,
    limit: int = Query(default=50, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
) -> dict[str, Any]:
    if status_filter is not None and status_filter not in VALID_STATUSES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"invalid status; must be one of {sorted(VALID_STATUSES)}",
        )
    pool = await get_pool()
    rows = await list_recommendations(
        pool,
        tenant_id=auth.tenant_id,
        status_filter=status_filter,
        uop_id=uop_id,
        agent_id=agent_id,
        category=category,
        priority=priority,
        limit=limit,
        offset=offset,
    )
    return {"recommendations": rows, "limit": limit, "offset": offset}


@router.get("/recommendations/{recommendation_id}")
async def get_endpoint(
    recommendation_id: str,
    auth: Annotated[AuthContext, Depends(get_current_auth)],
) -> dict[str, Any]:
    pool = await get_pool()
    row = await get_recommendation(
        pool, tenant_id=auth.tenant_id, recommendation_id=recommendation_id
    )
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="recommendation_not_found"
        )
    return row


class StatusUpdateRequest(BaseModel):
    status: Literal["open", "in_progress", "adopted", "dismissed"]
    reason: Optional[str] = None


@router.patch("/recommendations/{recommendation_id}")
async def update_status_endpoint(
    recommendation_id: str,
    body: StatusUpdateRequest,
    auth: Annotated[AuthContext, Depends(get_current_auth)],
) -> dict[str, Any]:
    pool = await get_pool()
    transition = await update_status(
        pool,
        tenant_id=auth.tenant_id,
        recommendation_id=recommendation_id,
        new_status=body.status,
    )
    if transition is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="recommendation_not_found"
        )
    previous_status, new_status = transition

    # No-op transition is still a 200, but we don't emit an event for it.
    if previous_status != new_status:
        try:
            await get_emitter().emit_status_changed(
                tenant_id=auth.tenant_id,
                recommendation_id=recommendation_id,
                previous_status=previous_status,
                new_status=new_status,
                changed_by=auth.user_id,
                reason=body.reason,
            )
        except Exception:
            # The DB transition succeeded; surface success to the caller.
            # Out-of-band reconciliation can replay missed status events.
            pass

    return {
        "id": recommendation_id,
        "previous_status": previous_status,
        "status": new_status,
    }
