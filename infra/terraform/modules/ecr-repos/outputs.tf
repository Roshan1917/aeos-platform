output "repository_urls" {
  description = "Map of repo name → URL (e.g. <account>.dkr.ecr.<region>.amazonaws.com/aeos-web)."
  value       = { for k, v in aws_ecr_repository.this : k => v.repository_url }
}

output "repository_arns" {
  description = "Map of repo name → ARN."
  value       = { for k, v in aws_ecr_repository.this : k => v.arn }
}
