"""Test environment defaults — applied before any test module imports src.config."""
from __future__ import annotations

import os

os.environ.setdefault("DATABASE_URL", "postgresql://aeos:aeos_dev_password@localhost:5432/aeos_telemetry_test")
os.environ.setdefault("AUTH_SERVICE_URL", "http://localhost:3002")
os.environ.setdefault("REGISTRY_URL", "http://localhost:3002")
os.environ.setdefault("AUTH_JWT_SECRET", "test-secret-min-32-chars-aaaaaaaaa")
os.environ.setdefault("LANGFUSE_ENABLED", "false")
os.environ.setdefault(
    "TELEMETRY_TOKEN_SIGNING_SECRET",
    "test-telemetry-token-secret-min-32-chars-aaaaa",
)
