terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

variable "environment" {
  type = string
}

variable "tenant_ids" {
  description = "List of tenant IDs to create KMS keys for"
  type        = list(string)
  default     = []
}

variable "tags" {
  type    = map(string)
  default = {}
}

resource "aws_kms_key" "platform" {
  description             = "AEOS platform data key — ${var.environment}"
  deletion_window_in_days = 30
  enable_key_rotation     = true

  tags = merge(var.tags, {
    "aeos:environment" = var.environment
    "aeos:scope"       = "platform"
  })
}

resource "aws_kms_alias" "platform" {
  name          = "alias/aeos-${var.environment}-platform"
  target_key_id = aws_kms_key.platform.key_id
}

resource "aws_kms_key" "tenant" {
  for_each = toset(var.tenant_ids)

  description             = "AEOS tenant data key — ${each.key} — ${var.environment}"
  deletion_window_in_days = 30
  enable_key_rotation     = true

  tags = merge(var.tags, {
    "aeos:environment" = var.environment
    "aeos:tenant-id"   = each.key
    "aeos:scope"       = "tenant"
  })
}

resource "aws_kms_alias" "tenant" {
  for_each = toset(var.tenant_ids)

  name          = "alias/aeos-${var.environment}-tenant-${each.key}"
  target_key_id = aws_kms_key.tenant[each.key].key_id
}

output "platform_key_arn" {
  value = aws_kms_key.platform.arn
}

output "tenant_key_arns" {
  value = { for k, v in aws_kms_key.tenant : k => v.arn }
}
