variable "cluster_name" {
  description = "Name of the RDS cluster (used as identifier prefix)"
  type        = string
}

variable "instance_class" {
  description = "RDS instance class"
  type        = string
  default     = "db.t3.medium"
}

variable "allocated_storage" {
  description = "Allocated storage in GiB"
  type        = number
}

variable "vpc_id" {
  description = "VPC ID"
  type        = string
}

variable "subnet_ids" {
  description = "List of subnet IDs for the DB subnet group (at least 2 AZs)"
  type        = list(string)
}

variable "allowed_security_group_ids" {
  description = "Security group IDs allowed to connect to Postgres"
  type        = list(string)
  default     = []
}

variable "kms_key_id" {
  description = "KMS key ARN for encryption at rest"
  type        = string
}

variable "database_name" {
  description = "Name of the initial database to create"
  type        = string
}

variable "environment" {
  description = "Deployment environment (e.g., non-prod, prod)"
  type        = string
}

variable "multi_az" {
  description = "Enable Multi-AZ deployment"
  type        = bool
  default     = false
}

variable "tags" {
  description = "Tags to apply to all resources"
  type        = map(string)
  default     = {}
}
