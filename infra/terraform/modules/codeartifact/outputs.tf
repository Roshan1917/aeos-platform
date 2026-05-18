output "domain_name" {
  description = "CodeArtifact domain name."
  value       = aws_codeartifact_domain.this.domain
}

output "domain_owner" {
  description = "AWS account ID that owns the domain (used in PyPI endpoint URL)."
  value       = aws_codeartifact_domain.this.owner
}

output "domain_arn" {
  description = "CodeArtifact domain ARN."
  value       = aws_codeartifact_domain.this.arn
}

output "repository_name" {
  description = "CodeArtifact repository name."
  value       = aws_codeartifact_repository.this.repository
}

output "repository_arn" {
  description = "CodeArtifact repository ARN."
  value       = aws_codeartifact_repository.this.arn
}

output "pypi_endpoint" {
  description = "PyPI repository endpoint URL (e.g. https://aeos-<acct>.d.codeartifact.<region>.amazonaws.com/pypi/aeos-pypi/)."
  value       = data.aws_codeartifact_repository_endpoint.pypi.repository_endpoint
}
