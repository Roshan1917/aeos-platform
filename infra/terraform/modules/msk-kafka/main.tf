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

# Generate SCRAM credentials
resource "random_password" "scram" {
  length           = 32
  special          = true
  override_special = "!#$%&*()-_=+[]{}<>:?"
}

# Store SCRAM credentials in Secrets Manager
module "scram_secret" {
  source = "../secrets-manager"

  name        = "AmazonMSK_${var.cluster_name}_scram"
  description = "MSK SASL/SCRAM credentials for ${var.cluster_name}"
  secret_string = jsonencode({
    username = "aeos-kafka"
    password = random_password.scram.result
  })
  kms_key_id              = var.kms_key_id
  recovery_window_in_days = 7
  tags                    = local.common_tags
}

# Security group for MSK
resource "aws_security_group" "msk" {
  name        = "${var.cluster_name}-msk-sg"
  description = "Security group for MSK cluster ${var.cluster_name}"
  vpc_id      = var.vpc_id

  tags = merge(local.common_tags, {
    Name = "${var.cluster_name}-msk-sg"
  })
}

resource "aws_security_group_rule" "msk_ingress_sasl" {
  count = length(var.allowed_security_group_ids)

  type                     = "ingress"
  from_port                = 9096
  to_port                  = 9096
  protocol                 = "tcp"
  source_security_group_id = var.allowed_security_group_ids[count.index]
  security_group_id        = aws_security_group.msk.id
  description              = "SASL/SCRAM TLS"
}

resource "aws_security_group_rule" "msk_ingress_tls" {
  count = length(var.allowed_security_group_ids)

  type                     = "ingress"
  from_port                = 9094
  to_port                  = 9094
  protocol                 = "tcp"
  source_security_group_id = var.allowed_security_group_ids[count.index]
  security_group_id        = aws_security_group.msk.id
  description              = "TLS plaintext"
}

resource "aws_security_group_rule" "msk_egress" {
  type              = "egress"
  from_port         = 0
  to_port           = 0
  protocol          = "-1"
  cidr_blocks       = ["0.0.0.0/0"]
  security_group_id = aws_security_group.msk.id
}

# MSK cluster configuration
resource "aws_msk_configuration" "main" {
  name           = "${var.cluster_name}-config"
  kafka_versions = ["3.6.0"]
  description    = "MSK configuration for ${var.cluster_name}"

  server_properties = <<-EOT
    auto.create.topics.enable=false
    default.replication.factor=2
    min.insync.replicas=1
    num.io.threads=8
    num.network.threads=5
    num.partitions=3
    num.replica.fetchers=2
    replica.lag.time.max.ms=30000
    socket.receive.buffer.bytes=102400
    socket.request.max.bytes=104857600
    socket.send.buffer.bytes=102400
    unclean.leader.election.enable=true
    zookeeper.session.timeout.ms=18000
    log.retention.hours=168
  EOT
}

# CloudWatch log group for broker logs (referenced from logging_info below).
resource "aws_cloudwatch_log_group" "msk" {
  name              = "/aws/msk/${var.cluster_name}"
  retention_in_days = 30
  tags              = local.common_tags
}

# MSK cluster
resource "aws_msk_cluster" "main" {
  cluster_name           = var.cluster_name
  kafka_version          = "3.6.0"
  number_of_broker_nodes = var.broker_count

  broker_node_group_info {
    instance_type  = var.broker_instance_type
    client_subnets = var.subnet_ids

    storage_info {
      ebs_storage_info {
        volume_size = 100
      }
    }

    security_groups = [aws_security_group.msk.id]
  }

  configuration_info {
    arn      = aws_msk_configuration.main.arn
    revision = aws_msk_configuration.main.latest_revision
  }

  encryption_info {
    encryption_at_rest_kms_key_arn = var.kms_key_id

    encryption_in_transit {
      client_broker = "TLS"
      in_cluster    = true
    }
  }

  client_authentication {
    sasl {
      scram = true
    }
    # Removed empty `tls {}` — provider sends a no-op UpdateSecurity call after
    # create, which AWS rejects ("The request does not include any updates to
    # the security setting of the cluster"). SCRAM is the only auth in use.
  }

  open_monitoring {
    prometheus {
      jmx_exporter {
        enabled_in_broker = true
      }
      node_exporter {
        enabled_in_broker = true
      }
    }
  }

  logging_info {
    broker_logs {
      cloudwatch_logs {
        enabled   = true
        log_group = aws_cloudwatch_log_group.msk.name
      }
    }
  }

  tags = local.common_tags
}

# Associate SCRAM secret with MSK cluster
resource "aws_msk_scram_secret_association" "main" {
  cluster_arn     = aws_msk_cluster.main.arn
  secret_arn_list = [module.scram_secret.secret_arn]
}
