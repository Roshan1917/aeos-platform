# Build context = repo root (set in .github/workflows/build-images.yml).
# This lets us vendor the in-repo `aeos-*` Python packages directly from
# packages/<pkg>/src/python/ without a private PyPI. CodeArtifact remains the
# documented target (docs/plan.md → Outstanding); this is the interim path
# that unblocks telemetry's image build until that lands.
FROM python:3.11-slim AS builder
WORKDIR /build

# Install internal aeos-* Python packages from monorepo source. Order is
# leaf → root so dependents resolve from the local pip cache. None of these
# have heavy install steps; if one grows native deps, switch to a wheel
# pre-build stage.
# canonical-schema has pyproject.toml at the package root (with
# `packages = ["src/python/aeos_canonical_schema"]` pointing into the
# subtree); the other four put pyproject.toml inside `src/python/`. Copy
# accordingly so pip finds the build metadata in each.
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

# Service install. With aeos-* already satisfied in the environment, pip
# resolves the >=0.1.0 markers as met and only fetches the third-party deps
# (FastAPI, asyncpg, etc.).
WORKDIR /app
COPY services/telemetry/pyproject.toml .
COPY services/telemetry/src/          ./src/
COPY services/telemetry/alembic.ini   .
COPY services/telemetry/alembic/      ./alembic/
RUN pip install --no-cache-dir -e ".[dev]"

# --- Runtime ---
FROM python:3.11-slim AS runtime
WORKDIR /app

RUN groupadd -r aeos && useradd -r -g aeos aeos

COPY --from=builder /usr/local/lib/python3.11/site-packages /usr/local/lib/python3.11/site-packages
COPY --from=builder /usr/local/bin /usr/local/bin
COPY services/telemetry/src/        ./src/
COPY services/telemetry/alembic.ini .
COPY services/telemetry/alembic/    ./alembic/

USER aeos
EXPOSE 3003

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD python -c "import os,sys,urllib.request; r=urllib.request.urlopen('http://127.0.0.1:'+os.environ.get('PORT','3003')+'/healthz', timeout=4); sys.exit(0 if r.status==200 else 1)" || exit 1

CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "3003"]
