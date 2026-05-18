variable "cluster_name" {
  description = "Name of the ElastiCache cluster"
  type        = string
}

variable "node_type" {
  description = "ElastiCache node type"
  type        = string
  default     = "cache.t3.micro"
}

variable "num_cache_nodes" {
  description = "Number of cache nodes"
  type        = number
  default     = 1
}

variable "vpc_id" {
  description = "VPC ID"
  type        = string
}

variable "subnet_ids" {
  description = "Subnet IDs for the ElastiCache subnet group"
  type        = list(string)
}

variable "allowed_security_group_ids" {
  description = "Security group IDs allowed to connect to Redis"
  type        = list(string)
  default     = []
}

variable "kms_key_id" {
  description = "KMS key ARN for encryption at rest"
  type        = string
}

variable "environment" {
  description = "Deployment environment (e.g., non-prod, prod)"
  type        = string
}

variable "tags" {
  description = "Tags to apply to all resources"
  type        = map(string)
  default     = {}
}
