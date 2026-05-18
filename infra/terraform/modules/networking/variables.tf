variable "environment" {
  description = "Deployment environment (e.g., non-prod, prod)"
  type        = string
}

variable "vpc_cidr" {
  description = "CIDR block for the VPC"
  type        = string
  default     = "10.0.0.0/16"
}

variable "availability_zones" {
  description = "List of availability zones to use (defaults to first 2 AZs in the region)"
  type        = list(string)
  default     = []
}

variable "single_nat_gateway" {
  description = "Use a single NAT Gateway across all AZs (cheaper, less HA). Defaults to false (one NAT per AZ)."
  type        = bool
  default     = false
}

variable "tags" {
  description = "Tags to apply to all resources"
  type        = map(string)
  default     = {}
}
