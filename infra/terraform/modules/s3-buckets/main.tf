terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

locals {
  common_tags = merge(var.tags, {
    "aeos:managed-by"  = "terraform"
    "aeos:environment" = var.environment
  })

  buckets = {
    telemetry_exports  = "aeos-${var.environment}-telemetry-exports"
    langfuse_artifacts = "aeos-${var.environment}-langfuse-artifacts"
    assessment_reports = "aeos-${var.environment}-assessment-reports"
  }
}

# S3 buckets
resource "aws_s3_bucket" "buckets" {
  for_each = local.buckets

  bucket = each.value

  tags = merge(local.common_tags, {
    Name                  = each.value
    "aeos:bucket-purpose" = each.key
  })
}

# Block all public access
resource "aws_s3_bucket_public_access_block" "buckets" {
  for_each = local.buckets

  bucket = aws_s3_bucket.buckets[each.key].id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# Versioning
resource "aws_s3_bucket_versioning" "buckets" {
  for_each = local.buckets

  bucket = aws_s3_bucket.buckets[each.key].id

  versioning_configuration {
    status = "Enabled"
  }
}

# SSE-KMS encryption
resource "aws_s3_bucket_server_side_encryption_configuration" "buckets" {
  for_each = local.buckets

  bucket = aws_s3_bucket.buckets[each.key].id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = "aws:kms"
      kms_master_key_id = var.kms_key_id
    }
    bucket_key_enabled = true
  }
}

# Lifecycle rules — expire noncurrent versions after 90 days.
# AWS provider 5.x requires each rule to declare a filter (or prefix);
# `filter {}` matches every object in the bucket.
resource "aws_s3_bucket_lifecycle_configuration" "buckets" {
  for_each = local.buckets

  bucket = aws_s3_bucket.buckets[each.key].id

  rule {
    id     = "expire-noncurrent"
    status = "Enabled"

    filter {}

    noncurrent_version_expiration {
      noncurrent_days = 90
    }

    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }
}
