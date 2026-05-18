"""Tenant-scoped Kafka topic naming — mirrors TS topic.ts exactly."""
from __future__ import annotations


def topic_name(tenant_id: str, event_type: str) -> str:
    """
    Returns: aeos.{tenant_id}.{domain}.{event_type}
    Example: aeos.t-abc.telemetry.telemetry.span.received
    """
    domain = event_type.split(".")[0]
    return f"aeos.{tenant_id}.{domain}.{event_type}"


def topic_pattern(tenant_id: str, domain: str | None = None) -> str:
    """
    Returns a wildcard pattern for consumer subscription.
    Example: aeos.t-abc.telemetry.* or aeos.t-abc.*
    """
    if domain:
        return f"aeos.{tenant_id}.{domain}.*"
    return f"aeos.{tenant_id}.*"
