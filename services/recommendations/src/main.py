from __future__ import annotations

# Load .env into os.environ before anything else imports. pydantic-settings
# would populate the Config object on its own, but aeos_auth_client middleware
# reads os.environ directly — without this, AUTH_JWT_SECRET is None at request
# time and every authenticated route 500s.
from dotenv import load_dotenv  # noqa: E402

load_dotenv()

from contextlib import asynccontextmanager  # noqa: E402
from typing import AsyncGenerator  # noqa: E402

import uvicorn  # noqa: E402
from aeos_telemetry_sdk import init_tracing  # noqa: E402
from fastapi import FastAPI  # noqa: E402

from .api.recommendations import router as recommendations_router
from .config import config
from .db.connection import close_pool, init_pool
from .health import router as health_router, set_ready
from .lib.consumer import get_consumer_set
from .lib.emitter import get_emitter

init_tracing(config.SERVICE_NAME)


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncGenerator[None, None]:
    await init_pool()
    consumers = get_consumer_set()
    await consumers.start()
    set_ready(True)
    print(f"[{config.SERVICE_NAME}] ready on :{config.PORT}")
    try:
        yield
    finally:
        set_ready(False)
        await consumers.stop()
        emitter = get_emitter()
        await emitter.shutdown()
        await close_pool()
        print(f"[{config.SERVICE_NAME}] shutdown complete")


app = FastAPI(
    title="AEOS Recommendations",
    description=(
        "Consumes `ledger.variance.detected` events, runs them through a "
        "rule-based template engine, and produces `Recommendation` records "
        "with status lifecycle. Surfaces a CRUD API for operator UIs."
    ),
    version="0.1.0",
    lifespan=lifespan,
    docs_url="/docs",
    openapi_url="/openapi.json",
    redoc_url=None,
)

app.include_router(health_router)
app.include_router(recommendations_router, prefix="/v1")


if __name__ == "__main__":
    uvicorn.run(
        "src.main:app",
        host="0.0.0.0",
        port=config.PORT,
        reload=config.PLATFORM_ENV == "local",
    )
