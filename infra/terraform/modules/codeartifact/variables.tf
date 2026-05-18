variable "environment" {
  description = "Deployment environment (non-prod | prod) — used in tags."
  type        = string
}

variable "domain_name" {
  description = "CodeArtifact domain name (e.g. aeos)."
  type        = string
}

variable "repository_name" {
  description = "CodeArtifact repository name within the domain (e.g. aeos-pypi)."
  type        = string
}

variable "kms_key_arn" {
  description = "KMS key ARN for domain encryption at rest."
  type        = string
}

variable "tags" {
  description = "Tags to apply to the domain + repository."
  type        = map(string)
  default     = {}
}
