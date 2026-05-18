terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    tls = {
      source  = "hashicorp/tls"
      version = "~> 4.0"
    }
  }
}

variable "cluster_name" {
  description = "EKS cluster name"
  type        = string
}

variable "kubernetes_version" {
  description = "Kubernetes version"
  type        = string
  default     = "1.30"
}

variable "vpc_id" {
  description = "VPC ID for the cluster"
  type        = string
}

variable "subnet_ids" {
  description = "Subnet IDs for node groups"
  type        = list(string)
}

variable "node_instance_types" {
  description = "EC2 instance types for the managed node group"
  type        = list(string)
  default     = ["t3.large"]
}

variable "node_desired_size" {
  description = "Desired node count"
  type        = number
  default     = 2
}

variable "node_min_size" {
  description = "Minimum node count"
  type        = number
  default     = 2
}

variable "node_max_size" {
  description = "Maximum node count"
  type        = number
  default     = 4
}

variable "node_disk_size" {
  description = "Root EBS volume size (GiB) per node"
  type        = number
  default     = 50
}

variable "endpoint_public_access" {
  description = "Whether the EKS cluster API server is reachable from the public internet. When false, only private VPC traffic can reach it (managed node groups must have a clear path to the private endpoint)."
  type        = bool
  default     = true
}

variable "endpoint_public_access_cidrs" {
  description = "Source CIDRs allowed to reach the public API endpoint. Default 0.0.0.0/0 — tighten in prod."
  type        = list(string)
  default     = ["0.0.0.0/0"]
}

variable "external_secrets_namespace" {
  description = "Kubernetes namespace where external-secrets-operator runs"
  type        = string
  default     = "external-secrets"
}

variable "external_secrets_service_account" {
  description = "ServiceAccount name used by external-secrets-operator"
  type        = string
  default     = "external-secrets"
}

variable "tags" {
  description = "Tags to apply to all resources"
  type        = map(string)
  default     = {}
}

# ── EKS Cluster ───────────────────────────────────────────────────────────────
resource "aws_eks_cluster" "main" {
  name     = var.cluster_name
  version  = var.kubernetes_version
  role_arn = aws_iam_role.cluster.arn

  vpc_config {
    subnet_ids              = var.subnet_ids
    endpoint_private_access = true
    endpoint_public_access  = var.endpoint_public_access
    public_access_cidrs     = var.endpoint_public_access ? var.endpoint_public_access_cidrs : null
  }

  enabled_cluster_log_types = ["api", "audit", "authenticator", "controllerManager", "scheduler"]

  tags = merge(var.tags, {
    "aeos:managed-by" = "terraform"
  })

  depends_on = [
    aws_iam_role_policy_attachment.cluster_policy,
  ]
}

resource "aws_iam_role" "cluster" {
  name = "${var.cluster_name}-cluster-role"

  assume_role_policy = jsonencode({
    Statement = [{
      Action    = "sts:AssumeRole"
      Effect    = "Allow"
      Principal = { Service = "eks.amazonaws.com" }
    }]
    Version = "2012-10-17"
  })

  tags = var.tags
}

resource "aws_iam_role_policy_attachment" "cluster_policy" {
  policy_arn = "arn:aws:iam::aws:policy/AmazonEKSClusterPolicy"
  role       = aws_iam_role.cluster.name
}

# ── Managed Node Group ────────────────────────────────────────────────────────
resource "aws_iam_role" "node" {
  name = "${var.cluster_name}-node-role"

  assume_role_policy = jsonencode({
    Statement = [{
      Action    = "sts:AssumeRole"
      Effect    = "Allow"
      Principal = { Service = "ec2.amazonaws.com" }
    }]
    Version = "2012-10-17"
  })

  tags = var.tags
}

resource "aws_iam_role_policy_attachment" "node_worker" {
  policy_arn = "arn:aws:iam::aws:policy/AmazonEKSWorkerNodePolicy"
  role       = aws_iam_role.node.name
}

resource "aws_iam_role_policy_attachment" "node_cni" {
  policy_arn = "arn:aws:iam::aws:policy/AmazonEKS_CNI_Policy"
  role       = aws_iam_role.node.name
}

resource "aws_iam_role_policy_attachment" "node_ecr" {
  policy_arn = "arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryReadOnly"
  role       = aws_iam_role.node.name
}

resource "aws_eks_node_group" "default" {
  cluster_name    = aws_eks_cluster.main.name
  node_group_name = "${var.cluster_name}-default"
  node_role_arn   = aws_iam_role.node.arn
  subnet_ids      = var.subnet_ids

  instance_types = var.node_instance_types
  disk_size      = var.node_disk_size

  scaling_config {
    desired_size = var.node_desired_size
    min_size     = var.node_min_size
    max_size     = var.node_max_size
  }

  update_config {
    max_unavailable_percentage = 33
  }

  tags = merge(var.tags, {
    Name = "${var.cluster_name}-default-ng"
  })

  depends_on = [
    aws_iam_role_policy_attachment.node_worker,
    aws_iam_role_policy_attachment.node_cni,
    aws_iam_role_policy_attachment.node_ecr,
  ]
}

# ── OIDC Provider for IRSA ────────────────────────────────────────────────────
data "tls_certificate" "cluster" {
  url = aws_eks_cluster.main.identity[0].oidc[0].issuer
}

resource "aws_iam_openid_connect_provider" "cluster" {
  url             = aws_eks_cluster.main.identity[0].oidc[0].issuer
  client_id_list  = ["sts.amazonaws.com"]
  thumbprint_list = [data.tls_certificate.cluster.certificates[0].sha1_fingerprint]

  tags = var.tags
}

locals {
  oidc_provider_url = replace(aws_iam_openid_connect_provider.cluster.url, "https://", "")
}

# ── IRSA: external-secrets-operator → AWS Secrets Manager (read) ──────────────
data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

resource "aws_iam_role" "external_secrets" {
  name = "${var.cluster_name}-external-secrets"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Principal = {
        Federated = aws_iam_openid_connect_provider.cluster.arn
      }
      Action = "sts:AssumeRoleWithWebIdentity"
      Condition = {
        StringEquals = {
          "${local.oidc_provider_url}:aud" = "sts.amazonaws.com"
          "${local.oidc_provider_url}:sub" = "system:serviceaccount:${var.external_secrets_namespace}:${var.external_secrets_service_account}"
        }
      }
    }]
  })

  tags = var.tags
}

resource "aws_iam_policy" "external_secrets" {
  name        = "${var.cluster_name}-external-secrets-policy"
  description = "Read AEOS Secrets Manager secrets for the ${var.cluster_name} cluster"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "secretsmanager:GetSecretValue",
          "secretsmanager:DescribeSecret",
          "secretsmanager:ListSecrets",
        ]
        Resource = [
          "arn:aws:secretsmanager:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:secret:aeos/*",
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "kms:Decrypt",
          "kms:DescribeKey",
        ]
        Resource = "*"
        Condition = {
          StringEquals = {
            "kms:ViaService" = "secretsmanager.${data.aws_region.current.name}.amazonaws.com"
          }
        }
      },
    ]
  })

  tags = var.tags
}

resource "aws_iam_role_policy_attachment" "external_secrets" {
  role       = aws_iam_role.external_secrets.name
  policy_arn = aws_iam_policy.external_secrets.arn
}

# ── Outputs ───────────────────────────────────────────────────────────────────
output "cluster_name" {
  value = aws_eks_cluster.main.name
}

output "cluster_endpoint" {
  value = aws_eks_cluster.main.endpoint
}

output "cluster_certificate_authority_data" {
  value = aws_eks_cluster.main.certificate_authority[0].data
}

output "node_group_role_arn" {
  description = "IAM role ARN attached to the default managed node group"
  value       = aws_iam_role.node.arn
}

output "oidc_provider_arn" {
  description = "ARN of the cluster OIDC identity provider"
  value       = aws_iam_openid_connect_provider.cluster.arn
}

output "oidc_provider_url" {
  description = "URL of the cluster OIDC identity provider (without https://)"
  value       = local.oidc_provider_url
}

output "external_secrets_role_arn" {
  description = "IAM role ARN to annotate the external-secrets-operator ServiceAccount with (IRSA)"
  value       = aws_iam_role.external_secrets.arn
}

output "cluster_security_group_id" {
  description = "EKS-managed cluster security group. Attached automatically to managed node groups + control plane ENIs; pass this into RDS / MSK / Redis modules so pods can reach the data services."
  value       = aws_eks_cluster.main.vpc_config[0].cluster_security_group_id
}
