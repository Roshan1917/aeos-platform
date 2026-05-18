"""Test environment defaults — applied before any test imports src.config."""
from __future__ import annotations

import os

os.environ.setdefault(
    "DATABASE_URL",
    "postgresql://aeos:aeos_dev_password@localhost:5432/aeos_recommendations_test",
)
os.environ.setdefault("AUTH_SERVICE_URL", "http://localhost:3002")
os.environ.setdefault("REGISTRY_URL", "http://localhost:3002")
os.environ.setdefault("AUTH_JWT_SECRET", "test-secret-min-32-chars-aaaaaaaaa")
os.environ.setdefault("SUBSCRIBE_TENANT_IDS", "")
