#!/bin/bash
set -e

echo "Initializing LocalStack resources..."

# S3 buckets
aws --endpoint-url=http://localhost:4566 s3 mb s3://aeos-attestation-bundles --region us-east-1
aws --endpoint-url=http://localhost:4566 s3 mb s3://aeos-documents --region us-east-1

# KMS key (dev tenant)
DEV_KMS_KEY=$(aws --endpoint-url=http://localhost:4566 kms create-key \
  --description "AEOS dev-tenant data key" \
  --region us-east-1 \
  --query 'KeyMetadata.KeyId' \
  --output text)

echo "Created KMS key: $DEV_KMS_KEY"

# Secrets Manager
aws --endpoint-url=http://localhost:4566 secretsmanager create-secret \
  --name "aeos/dev/substrate/jwt-secret" \
  --secret-string "aeos-dev-jwt-secret-local" \
  --region us-east-1

echo "LocalStack initialization complete."
