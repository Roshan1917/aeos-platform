from fastapi import APIRouter
from fastapi.responses import JSONResponse

router = APIRouter()
_ready = False


def set_ready(value: bool) -> None:
    global _ready
    _ready = value


@router.get("/healthz", include_in_schema=False)
async def liveness() -> JSONResponse:
    return JSONResponse({"status": "ok"})


@router.get("/readyz", include_in_schema=False)
async def readiness() -> JSONResponse:
    if _ready:
        return JSONResponse({"status": "ready"})
    return JSONResponse({"status": "not_ready"}, status_code=503)
