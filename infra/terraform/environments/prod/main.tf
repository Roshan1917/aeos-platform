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
      "aeos:environment" = "prod"
      "aeos:managed-by"  = "terraform"
      "aeos:project"     = "aeos-platform"
    }
  }
}

locals {
  environment = "prod"
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
  multi_az          = true

  vpc_id     = module.networking.vpc_id
  subnet_ids = module.networking.private_subnet_ids

  # EKS-managed cluster security group covers nodes + control plane → pods can reach RDS.
  allowed_security_group_ids = [module.eks.cluster_security_group_id]

  kms_key_id  = module.kms.platform_key_arn
  environment = local.environment
  tags        = local.common_tags
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
  image_tag_mutability = "IMMUTABLE" # tighter in prod
  lifecycle_keep_count = 50
  repositories = [
    "aeos-web",
    "aeos-service-substrate",
    "aeos-service-telemetry",
    "aeos-service-recommendations",
    "aeos-service-test-generator",
  ]
  tags = local.common_tags
}
