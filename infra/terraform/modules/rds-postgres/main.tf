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
  identifier = var.cluster_name
  common_tags = merge(var.tags, {
    "aeos:managed-by"  = "terraform"
    "aeos:environment" = var.environment
  })
}

# Generate random password for the master user
resource "random_password" "master" {
  length           = 32
  special          = true
  override_special = "!#$%&*()-_=+[]{}<>:?"
}

# Store credentials in Secrets Manager
module "credentials_secret" {
  source = "../secrets-manager"

  name        = "aeos/${var.environment}/rds/${local.identifier}/master-credentials"
  description = "RDS master credentials for ${local.identifier}"
  secret_string = jsonencode({
    username = "aeos_master"
    password = random_password.master.result
    host     = aws_db_instance.main.address
    port     = aws_db_instance.main.port
    dbname   = var.database_name
  })
  kms_key_id              = var.kms_key_id
  recovery_window_in_days = 7
  tags                    = local.common_tags
}

# Security group for RDS
resource "aws_security_group" "rds" {
  name        = "${local.identifier}-rds-sg"
  description = "Security group for RDS Postgres ${local.identifier}"
  vpc_id      = var.vpc_id

  tags = merge(local.common_tags, {
    Name = "${local.identifier}-rds-sg"
  })
}

resource "aws_security_group_rule" "rds_ingress" {
  count = length(var.allowed_security_group_ids)

  type                     = "ingress"
  from_port                = 5432
  to_port                  = 5432
  protocol                 = "tcp"
  source_security_group_id = var.allowed_security_group_ids[count.index]
  security_group_id        = aws_security_group.rds.id
}

resource "aws_security_group_rule" "rds_egress" {
  type              = "egress"
  from_port         = 0
  to_port           = 0
  protocol          = "-1"
  cidr_blocks       = ["0.0.0.0/0"]
  security_group_id = aws_security_group.rds.id
}

# DB subnet group
resource "aws_db_subnet_group" "main" {
  name       = "${local.identifier}-subnet-group"
  subnet_ids = var.subnet_ids

  tags = merge(local.common_tags, {
    Name = "${local.identifier}-subnet-group"
  })
}

# DB parameter group.
# Both `max_connections` and `log_connections` are static — they require a
# DB reboot to take effect, so apply_method must be "pending-reboot" (the
# provider default of "immediate" only works for dynamic parameters).
resource "aws_db_parameter_group" "main" {
  name   = "${local.identifier}-pg16"
  family = "postgres16"

  parameter {
    name         = "max_connections"
    value        = "200"
    apply_method = "pending-reboot"
  }

  parameter {
    name         = "log_connections"
    value        = "1"
    apply_method = "pending-reboot"
  }

  tags = local.common_tags
}

# RDS instance
resource "aws_db_instance" "main" {
  identifier        = local.identifier
  engine            = "postgres"
  engine_version    = "16"
  instance_class    = var.instance_class
  allocated_storage = var.allocated_storage

  db_name  = var.database_name
  username = "aeos_master"
  password = random_password.master.result

  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = [aws_security_group.rds.id]
  parameter_group_name   = aws_db_parameter_group.main.name

  multi_az            = var.multi_az
  storage_encrypted   = true
  kms_key_id          = var.kms_key_id
  storage_type        = "gp3"
  deletion_protection = true

  backup_retention_period = 7
  backup_window           = "03:00-04:00"
  maintenance_window      = "Mon:04:00-Mon:05:00"

  skip_final_snapshot       = false
  final_snapshot_identifier = "${local.identifier}-final-snapshot"

  performance_insights_enabled          = true
  performance_insights_kms_key_id       = var.kms_key_id
  performance_insights_retention_period = 7

  enabled_cloudwatch_logs_exports = ["postgresql", "upgrade"]

  tags = local.common_tags
}
