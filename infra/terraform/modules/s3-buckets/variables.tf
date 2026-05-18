variable "environment" {
  description = "Deployment environment (e.g., non-prod, prod)"
  type        = string
}

variable "kms_key_id" {
  description = "KMS key ARN for SSE-KMS encryption"
  type        = string
}

variable "tags" {
  description = "Tags to apply to all resources"
  type        = map(string)
  default     = {}
}
