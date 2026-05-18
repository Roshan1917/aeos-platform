output "endpoint" {
  description = "ElastiCache Redis primary endpoint"
  value       = aws_elasticache_replication_group.main.primary_endpoint_address
}

output "reader_endpoint" {
  description = "ElastiCache Redis reader endpoint"
  value       = aws_elasticache_replication_group.main.reader_endpoint_address
}

output "port" {
  description = "ElastiCache Redis port"
  value       = aws_elasticache_replication_group.main.port
}

output "auth_token_secret_arn" {
  description = "ARN of the Secrets Manager secret containing the AUTH token"
  value       = module.auth_token_secret.secret_arn
}
