output "endpoint" {
  description = "RDS instance endpoint"
  value       = aws_db_instance.main.address
}

output "port" {
  description = "RDS instance port"
  value       = aws_db_instance.main.port
}

output "secret_arn" {
  description = "ARN of the Secrets Manager secret containing master credentials"
  value       = module.credentials_secret.secret_arn
}

output "security_group_id" {
  description = "Security group ID for the RDS instance"
  value       = aws_security_group.rds.id
}
