output "cluster_endpoint" {
  description = "EKS cluster API endpoint"
  value       = module.eks.cluster_endpoint
}

output "cluster_name" {
  description = "EKS cluster name"
  value       = module.eks.cluster_name
}

output "kubeconfig_command" {
  description = "AWS CLI command to configure kubectl for this cluster"
  value       = "aws eks update-kubeconfig --region ${var.aws_region} --name ${module.eks.cluster_name}"
}

output "vpc_id" {
  description = "VPC ID"
  value       = module.networking.vpc_id
}

output "private_subnet_ids" {
  description = "Private subnet IDs"
  value       = module.networking.private_subnet_ids
}

output "rds_endpoint" {
  description = "RDS Postgres endpoint"
  value       = module.rds.endpoint
}

output "rds_secret_arn" {
  description = "ARN of the RDS master credentials secret"
  value       = module.rds.secret_arn
}

output "msk_bootstrap_brokers_sasl" {
  description = "MSK SASL/SCRAM bootstrap brokers"
  value       = module.msk.bootstrap_brokers_sasl_scram
}

output "msk_cluster_arn" {
  description = "MSK cluster ARN"
  value       = module.msk.cluster_arn
}

output "redis_endpoint" {
  description = "ElastiCache Redis endpoint"
  value       = module.redis.endpoint
}

output "redis_auth_token_secret_arn" {
  description = "ARN of the Redis AUTH token secret"
  value       = module.redis.auth_token_secret_arn
}

output "s3_bucket_names" {
  description = "Map of S3 bucket names"
  value       = module.s3.bucket_names
}

output "kms_platform_key_arn" {
  description = "ARN of the platform KMS key"
  value       = module.kms.platform_key_arn
}

output "cloudflare_api_token_secret_arn" {
  description = "ARN of the Cloudflare API token secret (token populated manually post-apply)"
  value       = module.cloudflare_api_token.secret_arn
}

output "cloudflare_origin_cert_secret_arn" {
  description = "ARN of the Cloudflare Origin CA cert secret (cert/key populated manually post-apply)"
  value       = module.cloudflare_origin_cert.secret_arn
}

output "oidc_provider_arn" {
  description = "EKS cluster OIDC provider ARN (for IRSA bindings)"
  value       = module.eks.oidc_provider_arn
}

output "external_secrets_role_arn" {
  description = "IRSA role ARN for the external-secrets-operator ServiceAccount"
  value       = module.eks.external_secrets_role_arn
}

output "node_group_role_arn" {
  description = "IAM role ARN of the default EKS managed node group"
  value       = module.eks.node_group_role_arn
}

output "ecr_repository_urls" {
  description = "ECR repository URLs keyed by repo name."
  value       = module.ecr.repository_urls
}

output "codeartifact_domain_name" {
  description = "CodeArtifact domain name (e.g. aeos)."
  value       = module.codeartifact.domain_name
}

output "codeartifact_domain_owner" {
  description = "AWS account ID that owns the CodeArtifact domain."
  value       = module.codeartifact.domain_owner
}

output "codeartifact_repository_name" {
  description = "CodeArtifact repository name (e.g. aeos-pypi)."
  value       = module.codeartifact.repository_name
}

output "codeartifact_pypi_endpoint" {
  description = "CodeArtifact PyPI endpoint URL (no auth — token embedded by callers at use time)."
  value       = module.codeartifact.pypi_endpoint
}
