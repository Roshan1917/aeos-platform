from __future__ import annotations

from typing import Literal

from pydantic import AnyHttpUrl
from pydantic_settings import BaseSettings, SettingsConfigDict


class Config(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    PORT: int = 3003
    PLATFORM_ENV: Literal["local", "non-prod", "prod"] = "local"
    SERVICE_NAME: str = "telemetry"

    DATABASE_URL: str
    # Postgres schema this service owns. Set as search_path on every connection
    # so unqualified table names resolve here, and used by Alembic as the
    # version_table_schema.
    DATABASE_SCHEMA: str = "telemetry"

    AUTH_JWT_SECRET: str | None = None
    AUTH_JWKS_URI: str | None = None
    AUTH_SERVICE_URL: AnyHttpUrl

    REGISTRY_URL: AnyHttpUrl

    KAFKA_BROKERS: str = "localhost:9092"
    KAFKA_SSL: bool = False
    KAFKA_SASL_USERNAME: str | None = None
    KAFKA_SASL_PASSWORD: str | None = None

    LANGFUSE_HOST: str = "http://localhost:3001"
    LANGFUSE_PUBLIC_KEY: str = "pk-lf-local-dev"
    LANGFUSE_SECRET_KEY: str = "sk-lf-local-dev"
    LANGFUSE_ENABLED: bool = True

    OTEL_EXPORTER_OTLP_ENDPOINT: str | None = None

    ENRICHMENT_VERSION: str = "1.0"
    ENRICHMENT_CACHE_TTL_SECONDS: int = 30

    # Telemetry ingest tokens — HMAC-signed, telemetry-issued, telemetry-verified.
    # Secret signs the opaque token at mint and verifies it on POST /v1/spans.
    # Required in any env that ingests spans. Must be ≥32 bytes.
    TELEMETRY_TOKEN_SIGNING_SECRET: str | None = None
    TELEMETRY_REVOCATION_REFRESH_SECONDS: int = 60

    # When true, `/docs` and `/openapi.json` require a valid substrate JWT.
    # Default: off in local + non-prod, on in prod.
    DOCS_REQUIRE_AUTH: bool | None = None


config = Config()
