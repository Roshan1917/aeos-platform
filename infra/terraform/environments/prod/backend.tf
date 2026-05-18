terraform {
  required_version = ">= 1.8.0"

  backend "s3" {
    bucket         = "aeos-terraform-state-prod"
    key            = "aeos/prod/terraform.tfstate"
    region         = "us-east-1"
    encrypt        = true
    dynamodb_table = "aeos-terraform-locks-prod"
  }
}
