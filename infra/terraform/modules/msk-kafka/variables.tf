variable "cluster_name" {
  description = "Name of the MSK cluster"
  type        = string
}

variable "broker_count" {
  description = "Number of Kafka broker nodes (must be a multiple of the number of AZs)"
  type        = number
  default     = 2
}

variable "broker_instance_type" {
  description = "Instance type for Kafka brokers"
  type        = string
  default     = "kafka.t3.small"
}

variable "vpc_id" {
  description = "VPC ID"
  type        = string
}

variable "subnet_ids" {
  description = "Subnet IDs for broker placement (one per AZ)"
  type        = list(string)
}

variable "allowed_security_group_ids" {
  description = "Security group IDs allowed to connect to MSK"
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
