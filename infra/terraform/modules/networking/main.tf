terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

data "aws_region" "current" {}

data "aws_availability_zones" "available" {
  state = "available"
}

locals {
  azs      = length(var.availability_zones) > 0 ? var.availability_zones : slice(data.aws_availability_zones.available.names, 0, 2)
  az_count = length(local.azs)
  # Single-NAT mode shares one NAT Gateway across all AZs (cheaper non-prod).
  nat_count = var.single_nat_gateway ? 1 : local.az_count

  # Divide the VPC CIDR into /20 subnets for flexibility
  # private subnets: first N /20 blocks, public subnets: next N /20 blocks
  private_subnets = [for i, az in local.azs : cidrsubnet(var.vpc_cidr, 4, i)]
  public_subnets  = [for i, az in local.azs : cidrsubnet(var.vpc_cidr, 4, i + local.az_count)]

  common_tags = merge(var.tags, {
    "aeos:managed-by"  = "terraform"
    "aeos:environment" = var.environment
  })
}

# VPC
resource "aws_vpc" "main" {
  cidr_block           = var.vpc_cidr
  enable_dns_support   = true
  enable_dns_hostnames = true

  tags = merge(local.common_tags, {
    Name = "aeos-${var.environment}-vpc"
  })
}

# Internet Gateway (for public subnets / NAT)
resource "aws_internet_gateway" "main" {
  vpc_id = aws_vpc.main.id

  tags = merge(local.common_tags, {
    Name = "aeos-${var.environment}-igw"
  })
}

# Private subnets
resource "aws_subnet" "private" {
  count = local.az_count

  vpc_id            = aws_vpc.main.id
  cidr_block        = local.private_subnets[count.index]
  availability_zone = local.azs[count.index]

  tags = merge(local.common_tags, {
    Name               = "aeos-${var.environment}-private-${local.azs[count.index]}"
    "aeos:subnet-type" = "private"
    # Required tags for EKS auto-discovery of subnets
    "kubernetes.io/role/internal-elb" = "1"
  })
}

# Public subnets (ALB only)
resource "aws_subnet" "public" {
  count = local.az_count

  vpc_id                  = aws_vpc.main.id
  cidr_block              = local.public_subnets[count.index]
  availability_zone       = local.azs[count.index]
  map_public_ip_on_launch = false

  tags = merge(local.common_tags, {
    Name                     = "aeos-${var.environment}-public-${local.azs[count.index]}"
    "aeos:subnet-type"       = "public"
    "kubernetes.io/role/elb" = "1"
  })
}

# Elastic IPs for NAT Gateways (count depends on single_nat_gateway).
resource "aws_eip" "nat" {
  count = local.nat_count

  domain = "vpc"

  tags = merge(local.common_tags, {
    Name = "aeos-${var.environment}-nat-eip-${local.azs[count.index]}"
  })

  depends_on = [aws_internet_gateway.main]
}

# NAT Gateways (one per AZ unless single_nat_gateway = true)
resource "aws_nat_gateway" "main" {
  count = local.nat_count

  allocation_id = aws_eip.nat[count.index].id
  subnet_id     = aws_subnet.public[count.index].id

  tags = merge(local.common_tags, {
    Name = "aeos-${var.environment}-nat-${local.azs[count.index]}"
  })

  depends_on = [aws_internet_gateway.main]
}

# Public route table
resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.main.id
  }

  tags = merge(local.common_tags, {
    Name = "aeos-${var.environment}-public-rt"
  })
}

resource "aws_route_table_association" "public" {
  count = local.az_count

  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public.id
}

# Private route tables (one per AZ — each routes to its NAT GW; in single-NAT
# mode, every AZ shares the one NAT created in azs[0]).
resource "aws_route_table" "private" {
  count = local.az_count

  vpc_id = aws_vpc.main.id

  route {
    cidr_block     = "0.0.0.0/0"
    nat_gateway_id = aws_nat_gateway.main[var.single_nat_gateway ? 0 : count.index].id
  }

  tags = merge(local.common_tags, {
    Name = "aeos-${var.environment}-private-rt-${local.azs[count.index]}"
  })
}

resource "aws_route_table_association" "private" {
  count = local.az_count

  subnet_id      = aws_subnet.private[count.index].id
  route_table_id = aws_route_table.private[count.index].id
}

# VPC Endpoints (cost optimization — avoid NAT charges for AWS API calls)

## S3 gateway endpoint (free)
resource "aws_vpc_endpoint" "s3" {
  vpc_id            = aws_vpc.main.id
  service_name      = "com.amazonaws.${data.aws_region.current.name}.s3"
  vpc_endpoint_type = "Gateway"
  route_table_ids   = aws_route_table.private[*].id

  tags = merge(local.common_tags, {
    Name = "aeos-${var.environment}-vpce-s3"
  })
}

## Secrets Manager interface endpoint
resource "aws_vpc_endpoint" "secretsmanager" {
  vpc_id              = aws_vpc.main.id
  service_name        = "com.amazonaws.${data.aws_region.current.name}.secretsmanager"
  vpc_endpoint_type   = "Interface"
  subnet_ids          = aws_subnet.private[*].id
  security_group_ids  = [aws_security_group.vpce.id]
  private_dns_enabled = true

  tags = merge(local.common_tags, {
    Name = "aeos-${var.environment}-vpce-secretsmanager"
  })
}

## ECR API interface endpoint
resource "aws_vpc_endpoint" "ecr_api" {
  vpc_id              = aws_vpc.main.id
  service_name        = "com.amazonaws.${data.aws_region.current.name}.ecr.api"
  vpc_endpoint_type   = "Interface"
  subnet_ids          = aws_subnet.private[*].id
  security_group_ids  = [aws_security_group.vpce.id]
  private_dns_enabled = true

  tags = merge(local.common_tags, {
    Name = "aeos-${var.environment}-vpce-ecr-api"
  })
}

## ECR DKR interface endpoint
resource "aws_vpc_endpoint" "ecr_dkr" {
  vpc_id              = aws_vpc.main.id
  service_name        = "com.amazonaws.${data.aws_region.current.name}.ecr.dkr"
  vpc_endpoint_type   = "Interface"
  subnet_ids          = aws_subnet.private[*].id
  security_group_ids  = [aws_security_group.vpce.id]
  private_dns_enabled = true

  tags = merge(local.common_tags, {
    Name = "aeos-${var.environment}-vpce-ecr-dkr"
  })
}

# Security group for VPC interface endpoints
resource "aws_security_group" "vpce" {
  name        = "aeos-${var.environment}-vpce-sg"
  description = "Security group for VPC interface endpoints"
  vpc_id      = aws_vpc.main.id

  ingress {
    description = "HTTPS from VPC"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = [var.vpc_cidr]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(local.common_tags, {
    Name = "aeos-${var.environment}-vpce-sg"
  })
}
