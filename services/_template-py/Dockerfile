FROM python:3.11-slim AS builder
WORKDIR /app

RUN pip install --no-cache-dir hatch

COPY pyproject.toml .
COPY src/ ./src/

# Install shared packages from private registry (in real builds)
# Env vars AEOS_PYPI_URL and AEOS_PYPI_TOKEN must be set as build args
ARG AEOS_PYPI_URL
ARG AEOS_PYPI_TOKEN

RUN pip install --no-cache-dir \
  --extra-index-url "${AEOS_PYPI_URL}" \
  -e ".[dev]"

# --- Runtime ---
FROM python:3.11-slim AS runtime
WORKDIR /app

RUN groupadd -r aeos && useradd -r -g aeos aeos

COPY --from=builder /usr/local/lib/python3.11/site-packages /usr/local/lib/python3.11/site-packages
COPY --from=builder /usr/local/bin /usr/local/bin
COPY src/ ./src/

USER aeos
EXPOSE 3000
CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "3000"]
