terraform {
  required_version = ">= 1.8.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      "aeos:environment" = "non-prod"
      "aeos:managed-by"  = "terraform"
      "aeos:project"     = "aeos-platform"
    }
  }
}

locals {
  environment = "non-prod"
  common_tags = {
    "aeos:environment" = local.environment
    "aeos:managed-by"  = "terraform"
    "aeos:project"     = "aeos-platform"
  }
}

# ── Networking ────────────────────────────────────────────────────────────────
module "networking" {
  source = "../../modules/networking"

  environment        = local.environment
  vpc_cidr           = var.vpc_cidr
  availability_zones = var.availability_zones
  # Non-prod: single shared NAT GW across AZs to save cost + EIP quota.
  single_nat_gateway = true
  tags               = local.common_tags
}

# ── KMS Keys ──────────────────────────────────────────────────────────────────
module "kms" {
  source = "../../modules/kms-keys"

  environment = local.environment
  tenant_ids  = [] # populated as tenants are onboarded
  tags        = local.common_tags
}

# ── EKS Cluster ───────────────────────────────────────────────────────────────
module "eks" {
  source = "../../modules/eks-cluster"

  cluster_name       = var.cluster_name
  kubernetes_version = "1.30"
  vpc_id             = module.networking.vpc_id
  subnet_ids         = module.networking.private_subnet_ids

  tags = local.common_tags
}

# ── RDS Postgres ──────────────────────────────────────────────────────────────
module "rds" {
  source = "../../modules/rds-postgres"

  cluster_name      = "aeos-${local.environment}-postgres"
  instance_class    = var.rds_instance_class
  allocated_storage = var.rds_allocated_storage
  database_name     = "aeos"
  multi_az          = false

  vpc_id     = module.networking.vpc_id
  subnet_ids = module.networking.private_subnet_ids

  # EKS-managed cluster security group covers nodes + control plane → pods can reach RDS.
  allowed_security_group_ids = [module.eks.cluster_security_group_id]

  kms_key_id  = module.kms.platform_key_arn
  environment = local.environment
  tags        = local.common_tags
}

# ── RDS ingress rule — one-shot import to reconcile state drift ───────────────
# The rds-postgres module's `aws_security_group_rule.rds_ingress[0]` exists in
# AWS but was missing from terraform state, so apply tried to create it again
# and AWS rejected with InvalidPermission.Duplicate (PRs #55, #56 CI failures).
# This import block reconciles state on the next apply. Safe to leave in place;
# `terraform import` is a no-op once the resource is in state. Remove on a
# follow-up cleanup PR.
import {
  to = module.rds.aws_security_group_rule.rds_ingress[0]
  id = "sg-0b3d10fe7526e670c_ingress_tcp_5432_5432_sg-0a7341d723e1837d7"
}

# ── MSK Kafka ─────────────────────────────────────────────────────────────────
module "msk" {
  source = "../../modules/msk-kafka"

  cluster_name         = "aeos-${local.environment}-kafka"
  broker_count         = var.msk_broker_count
  broker_instance_type = var.msk_broker_instance_type

  vpc_id     = module.networking.vpc_id
  subnet_ids = module.networking.private_subnet_ids

  allowed_security_group_ids = [module.eks.cluster_security_group_id]

  kms_key_id  = module.kms.platform_key_arn
  environment = local.environment
  tags        = local.common_tags
}

# ── ElastiCache Redis ─────────────────────────────────────────────────────────
module "redis" {
  source = "../../modules/elasticache-redis"

  cluster_name    = "aeos-${local.environment}-redis"
  node_type       = var.redis_node_type
  num_cache_nodes = var.redis_num_cache_nodes

  vpc_id     = module.networking.vpc_id
  subnet_ids = module.networking.private_subnet_ids

  allowed_security_group_ids = [module.eks.cluster_security_group_id]

  kms_key_id  = module.kms.platform_key_arn
  environment = local.environment
  tags        = local.common_tags
}

# ── S3 Buckets ────────────────────────────────────────────────────────────────
module "s3" {
  source = "../../modules/s3-buckets"

  environment = local.environment
  kms_key_id  = module.kms.platform_key_arn
  tags        = local.common_tags
}

# ── ECR repositories ──────────────────────────────────────────────────────────
module "ecr" {
  source = "../../modules/ecr-repos"

  environment          = local.environment
  kms_key_id           = module.kms.platform_key_arn
  image_tag_mutability = "MUTABLE" # easier rebuilds in non-prod
  lifecycle_keep_count = 30
  repositories = [
    "aeos-web",
    "aeos-service-substrate",
    "aeos-service-telemetry",
    "aeos-service-recommendations",
    "aeos-service-test-generator",
  ]
  tags = local.common_tags
}

# ── CodeArtifact (private PyPI) ───────────────────────────────────────────────
# Hosts internal aeos-* Python packages. CI publishes to it via OIDC; service
# image builds (telemetry, recommendations) consume it as a pip --extra-index-url
# with a 12h auth token embedded in the URL at build time.
module "codeartifact" {
  source = "../../modules/codeartifact"

  environment     = local.environment
  domain_name     = "aeos"
  repository_name = "aeos-pypi"
  kms_key_arn     = module.kms.platform_key_arn
  tags            = local.common_tags
}

# ── Cloudflare API token (for external-dns) ───────────────────────────────────
# Empty placeholder — token populated manually via AWS console / CLI after apply.
# external-dns reads this via External Secrets Operator.
# Expected JSON shape: { "api-token": "<CF Origin DNS Edit token>" }
module "cloudflare_api_token" {
  source = "../../modules/secrets-manager"

  name        = "aeos/${local.environment}/platform/cloudflare-api-token"
  description = "Cloudflare API token for external-dns DNS record management"
  kms_key_id  = module.kms.platform_key_arn
  tags        = local.common_tags
}

# ── Cloudflare Origin CA certificate ──────────────────────────────────────────
# Empty placeholder — Origin CA cert is generated once via the Cloudflare
# dashboard and pasted manually post-apply. Used by ingress-nginx as the
# default-ssl-certificate (TLS terminator at the NLB origin).
# Expected JSON shape: { "tls.crt": "<PEM>", "tls.key": "<PEM>" }
module "cloudflare_origin_cert" {
  source = "../../modules/secrets-manager"

  name        = "aeos/${local.environment}/platform/cloudflare-origin-cert"
  description = "Cloudflare Origin CA TLS cert/key pair for ingress-nginx"
  kms_key_id  = module.kms.platform_key_arn
  tags        = local.common_tags
}
