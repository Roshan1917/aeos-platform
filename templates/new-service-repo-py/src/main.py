from __future__ import annotations

import signal
from contextlib import asynccontextmanager
from typing import AsyncGenerator

import uvicorn
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from aeos_telemetry_sdk import init_tracing
from .config import config
from .health import router as health_router, set_ready

init_tracing(config.SERVICE_NAME)


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncGenerator[None, None]:
    # Startup: initialize DB connections, consumers, etc.
    # Example: await db.connect()
    set_ready(True)
    print(f"[{config.SERVICE_NAME}] ready on :{config.PORT}")
    yield
    # Shutdown
    set_ready(False)
    # Example: await db.close()
    print(f"[{config.SERVICE_NAME}] shutdown complete")


app = FastAPI(
    title=config.SERVICE_NAME,
    lifespan=lifespan,
    docs_url="/docs" if config.PLATFORM_ENV == "local" else None,
    redoc_url=None,
)

app.include_router(health_router)

# TODO: mount your service routers here
# from .api.my_router import router as my_router
# app.include_router(my_router, prefix="/v1")

if __name__ == "__main__":
    uvicorn.run(
        "src.main:app",
        host="0.0.0.0",
        port=config.PORT,
        reload=config.PLATFORM_ENV == "local",
    )
