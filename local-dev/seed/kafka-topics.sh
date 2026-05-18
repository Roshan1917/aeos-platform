#!/bin/bash
# Creates canonical Kafka topics for local dev tenant
# Run after docker-compose up

set -e

KAFKA_BIN=${KAFKA_BIN:-kafka-topics}
BOOTSTRAP_SERVER=${BOOTSTRAP_SERVER:-localhost:9092}
TENANT_ID=${TENANT_ID:-dev-tenant-001}

TOPICS=(
  "aeos.${TENANT_ID}.telemetry.telemetry.span.received"
  "aeos.${TENANT_ID}.telemetry.telemetry.span.enriched"
  "aeos.${TENANT_ID}.ledger.ledger.row.written"
  "aeos.${TENANT_ID}.ledger.ledger.variance.detected"
  "aeos.${TENANT_ID}.governance.governance.policy.evaluated"
  "aeos.${TENANT_ID}.governance.governance.attestation.generated"
  "aeos.${TENANT_ID}.registry.registry.uop.registered"
  "aeos.${TENANT_ID}.registry.registry.process.registered"
  "aeos.${TENANT_ID}.registry.registry.agent.registered"
)

echo "Creating Kafka topics for tenant: $TENANT_ID"

for TOPIC in "${TOPICS[@]}"; do
  $KAFKA_BIN --create \
    --if-not-exists \
    --bootstrap-server "$BOOTSTRAP_SERVER" \
    --topic "$TOPIC" \
    --partitions 3 \
    --replication-factor 1 \
    2>/dev/null && echo "  ✓ $TOPIC" || echo "  - $TOPIC (already exists)"
done

echo "Done."
