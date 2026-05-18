variable "name" {
  description = "Name of the secret"
  type        = string
}

variable "description" {
  description = "Description of the secret"
  type        = string
  default     = ""
}

variable "secret_string" {
  description = "Secret string value. If null, creates an empty secret placeholder."
  type        = string
  default     = null
  sensitive   = true
}

variable "kms_key_id" {
  description = "KMS key ID or ARN to use for encryption"
  type        = string
}

variable "recovery_window_in_days" {
  description = "Number of days before permanent deletion after initiating a delete"
  type        = number
  default     = 7
}

variable "tags" {
  description = "Tags to apply to the secret"
  type        = map(string)
  default     = {}
}
