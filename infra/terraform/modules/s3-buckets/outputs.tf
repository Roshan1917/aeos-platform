output "bucket_names" {
  description = "Map of bucket purpose to bucket name"
  value       = { for k, v in aws_s3_bucket.buckets : k => v.bucket }
}

output "bucket_arns" {
  description = "Map of bucket purpose to bucket ARN"
  value       = { for k, v in aws_s3_bucket.buckets : k => v.arn }
}

output "telemetry_exports_bucket" {
  description = "Name of the telemetry exports bucket"
  value       = aws_s3_bucket.buckets["telemetry_exports"].bucket
}

output "langfuse_artifacts_bucket" {
  description = "Name of the LangFuse artifacts bucket"
  value       = aws_s3_bucket.buckets["langfuse_artifacts"].bucket
}

output "assessment_reports_bucket" {
  description = "Name of the assessment reports bucket"
  value       = aws_s3_bucket.buckets["assessment_reports"].bucket
}
