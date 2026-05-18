FROM python:3.11-slim AS builder
WORKDIR /app

RUN pip install --no-cache-dir hatch

# Configure access to aeos-* packages from the private PyPI index.
# AEOS_PYPI_URL and AEOS_PYPI_TOKEN are passed as build args (set in CI secrets).
ARG AEOS_PYPI_URL
ARG AEOS_PYPI_TOKEN

COPY pyproject.toml .
COPY src/ ./src/

RUN pip install --no-cache-dir \
    --extra-index-url "https://oauth2:${AEOS_PYPI_TOKEN}@${AEOS_PYPI_URL}/simple/" \
    -e ".[dev]"

# --- Runtime ---
FROM python:3.11-slim AS runtime
WORKDIR /app

RUN groupadd -r aeos && useradd -r -g aeos aeos

COPY --from=builder /usr/local/lib/python3.11/site-packages /usr/local/lib/python3.11/site-packages
COPY --from=builder /usr/local/bin /usr/local/bin
COPY src/ ./src/

USER aeos
EXPOSE 8000
CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8000"]
