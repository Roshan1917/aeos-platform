from __future__ import annotations

from typing import Literal
from pydantic import AnyHttpUrl
from pydantic_settings import BaseSettings, SettingsConfigDict


class Config(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    PORT: int = 3000
    PLATFORM_ENV: Literal["local", "non-prod", "prod"] = "local"
    SERVICE_NAME: str = "aeos-service-REPLACE_ME"

    # Postgres
    DATABASE_URL: str

    # Auth
    AUTH_JWT_SECRET: str
    AUTH_SERVICE_URL: AnyHttpUrl

    # Kafka
    KAFKA_BROKERS: str = "localhost:9092"
    KAFKA_SSL: bool = False
    KAFKA_SASL_USERNAME: str | None = None
    KAFKA_SASL_PASSWORD: str | None = None

    # Registry
    REGISTRY_URL: AnyHttpUrl

    # OTEL (optional)
    OTEL_EXPORTER_OTLP_ENDPOINT: str | None = None


config = Config()
