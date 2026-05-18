from __future__ import annotations

from fastapi import APIRouter, Response, status

router = APIRouter()

_ready = False


def set_ready(value: bool) -> None:
    global _ready
    _ready = value


@router.get("/healthz")
async def healthz() -> dict[str, str]:
    return {"status": "ok"}


@router.get("/readyz")
async def readyz(response: Response) -> dict[str, str]:
    if not _ready:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
        return {"status": "not_ready"}
    return {"status": "ready"}
