# Build context = repo root (set in .github/workflows/build-images.yml).
# Vendors in-repo `aeos-*` Python packages from packages/<pkg>/src/python/.
# CodeArtifact is the documented long-term target (docs/plan.md →
# Outstanding); this is the interim path until that lands.
FROM python:3.11-slim AS builder
WORKDIR /build

# canonical-schema has pyproject.toml at the package root; the others
# put it inside `src/python/`. Copy accordingly.
COPY packages/canonical-schema           /build/aeos-canonical-schema
COPY packages/auth-client/src/python      /build/aeos-auth-client
COPY packages/event-bus-client/src/python /build/aeos-event-bus-client
COPY packages/registry-client/src/python  /build/aeos-registry-client
COPY packages/telemetry-sdk/src/python    /build/aeos-telemetry-sdk
RUN pip install --no-cache-dir \
      /build/aeos-canonical-schema \
      /build/aeos-auth-client \
      /build/aeos-event-bus-client \
      /build/aeos-registry-client \
      /build/aeos-telemetry-sdk

WORKDIR /app
COPY services/recommendations/pyproject.toml .
COPY services/recommendations/src/          ./src/
COPY services/recommendations/alembic.ini   .
COPY services/recommendations/alembic/      ./alembic/
RUN pip install --no-cache-dir -e ".[dev]"

# --- Runtime ---
FROM python:3.11-slim AS runtime
WORKDIR /app

RUN groupadd -r aeos && useradd -r -g aeos aeos

COPY --from=builder /usr/local/lib/python3.11/site-packages /usr/local/lib/python3.11/site-packages
COPY --from=builder /usr/local/bin /usr/local/bin
COPY services/recommendations/src/        ./src/
COPY services/recommendations/alembic.ini .
COPY services/recommendations/alembic/    ./alembic/

USER aeos
EXPOSE 3004

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD python -c "import os,sys,urllib.request; r=urllib.request.urlopen('http://127.0.0.1:'+os.environ.get('PORT','3004')+'/healthz', timeout=4); sys.exit(0 if r.status==200 else 1)" || exit 1

CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "3004"]
