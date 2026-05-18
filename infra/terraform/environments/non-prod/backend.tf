terraform {
  required_version = ">= 1.8.0"

  backend "s3" {
    bucket         = "aeos-terraform-state-non-prod"
    key            = "aeos/non-prod/terraform.tfstate"
    region         = "us-east-1"
    encrypt        = true
    dynamodb_table = "aeos-terraform-locks-non-prod"
  }
}
