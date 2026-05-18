terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.0"
    }
  }
}

locals {
  common_tags = merge(var.tags, {
    "aeos:managed-by"  = "terraform"
    "aeos:environment" = var.environment
  })
}

# Generate AUTH token
resource "random_password" "auth_token" {
  length  = 64
  special = false # ElastiCache AUTH token cannot contain certain special chars
}

# Store AUTH token in Secrets Manager
module "auth_token_secret" {
  source = "../secrets-manager"

  name        = "aeos/${var.environment}/redis/${var.cluster_name}/auth-token"
  description = "ElastiCache Redis AUTH token for ${var.cluster_name}"
  secret_string = jsonencode({
    auth_token   = random_password.auth_token.result
    cluster_name = var.cluster_name
    environment  = var.environment
  })
  kms_key_id              = var.kms_key_id
  recovery_window_in_days = 7
  tags                    = local.common_tags
}

# Security group for ElastiCache
resource "aws_security_group" "redis" {
  name        = "${var.cluster_name}-redis-sg"
  description = "Security group for ElastiCache Redis ${var.cluster_name}"
  vpc_id      = var.vpc_id

  tags = merge(local.common_tags, {
    Name = "${var.cluster_name}-redis-sg"
  })
}

resource "aws_security_group_rule" "redis_ingress" {
  count = length(var.allowed_security_group_ids)

  type                     = "ingress"
  from_port                = 6379
  to_port                  = 6379
  protocol                 = "tcp"
  source_security_group_id = var.allowed_security_group_ids[count.index]
  security_group_id        = aws_security_group.redis.id
}

resource "aws_security_group_rule" "redis_egress" {
  type              = "egress"
  from_port         = 0
  to_port           = 0
  protocol          = "-1"
  cidr_blocks       = ["0.0.0.0/0"]
  security_group_id = aws_security_group.redis.id
}

# ElastiCache subnet group
resource "aws_elasticache_subnet_group" "main" {
  name       = "${var.cluster_name}-subnet-group"
  subnet_ids = var.subnet_ids

  tags = merge(local.common_tags, {
    Name = "${var.cluster_name}-subnet-group"
  })
}

# ElastiCache parameter group for Redis 7
resource "aws_elasticache_parameter_group" "main" {
  name   = "${var.cluster_name}-redis7"
  family = "redis7"

  tags = local.common_tags
}

# ElastiCache Redis replication group (cluster mode disabled).
# Replication group is required (not aws_elasticache_cluster) because we need
# at-rest + in-transit encryption with an AUTH token — those attributes are
# only supported on aws_elasticache_replication_group in AWS provider 5.x.
resource "aws_elasticache_replication_group" "main" {
  replication_group_id       = var.cluster_name
  description                = "AEOS ${var.environment} Redis (${var.cluster_name})"
  engine                     = "redis"
  engine_version             = "7.1"
  node_type                  = var.node_type
  num_cache_clusters         = var.num_cache_nodes
  parameter_group_name       = aws_elasticache_parameter_group.main.name
  subnet_group_name          = aws_elasticache_subnet_group.main.name
  security_group_ids         = [aws_security_group.redis.id]
  port                       = 6379
  automatic_failover_enabled = var.num_cache_nodes > 1
  multi_az_enabled           = var.num_cache_nodes > 1

  # Encryption
  at_rest_encryption_enabled = true
  kms_key_id                 = var.kms_key_id
  transit_encryption_enabled = true
  auth_token                 = random_password.auth_token.result

  # Maintenance
  maintenance_window       = "sun:05:00-sun:06:00"
  snapshot_retention_limit = 7
  snapshot_window          = "04:00-05:00"

  apply_immediately = false

  tags = local.common_tags
}
