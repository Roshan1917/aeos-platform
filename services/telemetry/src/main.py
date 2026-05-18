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

from .api.ingest import router as ingest_router
from .api.query import router as query_router
from .api.tokens import router as tokens_router
from .auth.revocation_cache import get_revocation_cache
from .config import config
from .db.connection import close_pool, get_pool, init_pool
from .health import router as health_router, set_ready
from .lib.emitter import get_emitter
from .lib.langfuse_client import get_mirror

init_tracing(config.SERVICE_NAME)


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncGenerator[None, None]:
    await init_pool()
    # Eagerly construct the LangFuse mirror so any config error surfaces at
    # startup, not on first ingest.
    get_mirror()
    # Load revoked-token ids and start the periodic refresh task. Without
    # this, revocations made via the admin API would only take effect after
    # a restart.
    revocation_cache = get_revocation_cache()
    await revocation_cache.start(
        await get_pool(), config.TELEMETRY_REVOCATION_REFRESH_SECONDS
    )
    set_ready(True)
    print(f"[{config.SERVICE_NAME}] ready on :{config.PORT}")
    try:
        yield
    finally:
        set_ready(False)
        await revocation_cache.stop()
        emitter = get_emitter()
        await emitter.shutdown()
        mirror = get_mirror()
        await mirror.flush()
        await close_pool()
        print(f"[{config.SERVICE_NAME}] shutdown complete")


app = FastAPI(
    title="AEOS Telemetry",
    description=(
        "OTel span ingestion, classification, enrichment with `process_id`, "
        "LangFuse mirroring, and emission of canonical "
        "`telemetry.span.enriched` events to Kafka."
    ),
    version="0.1.0",
    lifespan=lifespan,
    # API docs exposed in every env. Schema metadata is not tenant data; in
    # prod, gate at the ingress if you do not want it world-readable.
    docs_url="/docs",
    openapi_url="/openapi.json",
    redoc_url=None,
)

app.include_router(health_router)
app.include_router(ingest_router, prefix="/v1")
app.include_router(query_router, prefix="/v1")
app.include_router(tokens_router, prefix="/v1/admin")


if __name__ == "__main__":
    uvicorn.run(
        "src.main:app",
        host="0.0.0.0",
        port=config.PORT,
        reload=config.PLATFORM_ENV == "local",
    )
