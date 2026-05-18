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
}

resource "aws_codeartifact_domain" "this" {
  domain         = var.domain_name
  encryption_key = var.kms_key_arn

  tags = merge(local.common_tags, {
    Name = var.domain_name
  })
}

resource "aws_codeartifact_repository" "this" {
  domain     = aws_codeartifact_domain.this.domain
  repository = var.repository_name

  description = "AEOS internal Python package registry (private PyPI)."

  tags = merge(local.common_tags, {
    Name = var.repository_name
  })
}

data "aws_codeartifact_repository_endpoint" "pypi" {
  domain     = aws_codeartifact_domain.this.domain
  repository = aws_codeartifact_repository.this.repository
  format     = "pypi"
}
