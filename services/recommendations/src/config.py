from __future__ import annotations

from typing import Literal

from pydantic import AnyHttpUrl, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Config(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    PORT: int = 3004
    PLATFORM_ENV: Literal["local", "non-prod", "prod"] = "local"
    SERVICE_NAME: str = "recommendations"

    DATABASE_URL: str
    # Postgres schema this service owns. Set as search_path on every connection
    # and as Alembic version_table_schema.
    DATABASE_SCHEMA: str = "recommendations"

    AUTH_JWT_SECRET: str | None = None
    AUTH_JWKS_URI: str | None = None
    AUTH_SERVICE_URL: AnyHttpUrl

    REGISTRY_URL: AnyHttpUrl

    KAFKA_BROKERS: str = "localhost:9092"
    KAFKA_SSL: bool = False
    KAFKA_SASL_USERNAME: str | None = None
    KAFKA_SASL_PASSWORD: str | None = None

    SUBSCRIBE_TENANT_IDS: str = ""

    OTEL_EXPORTER_OTLP_ENDPOINT: str | None = None

    @field_validator("SUBSCRIBE_TENANT_IDS")
    @classmethod
    def _strip_tenants(cls, v: str) -> str:
        return ",".join(t.strip() for t in v.split(",") if t.strip())

    @property
    def subscribe_tenant_list(self) -> list[str]:
        return [t for t in self.SUBSCRIBE_TENANT_IDS.split(",") if t]


config = Config()
