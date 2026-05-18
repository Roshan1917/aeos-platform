variable "environment" {
  description = "Deployment environment (non-prod | prod) — used in tags."
  type        = string
}

variable "repositories" {
  description = "List of ECR repository names to create (e.g. aeos-web, aeos-service-substrate)."
  type        = list(string)
}

variable "kms_key_id" {
  description = "KMS key ARN for image encryption at rest."
  type        = string
}

variable "image_tag_mutability" {
  description = "Whether tags can be overwritten. IMMUTABLE for prod, MUTABLE for non-prod (easier rebuilds)."
  type        = string
  default     = "MUTABLE"
}

variable "lifecycle_keep_count" {
  description = "Keep this many recent images per repo; older are expired."
  type        = number
  default     = 30
}

variable "tags" {
  description = "Tags to apply to all repositories."
  type        = map(string)
  default     = {}
}
