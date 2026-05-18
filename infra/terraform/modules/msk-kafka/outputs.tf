output "bootstrap_brokers_sasl_scram" {
  description = "SASL/SCRAM bootstrap broker string"
  value       = aws_msk_cluster.main.bootstrap_brokers_sasl_scram
}

output "bootstrap_brokers_tls" {
  description = "TLS bootstrap broker string"
  value       = aws_msk_cluster.main.bootstrap_brokers_tls
}

output "zookeeper_connect_string" {
  description = "ZooKeeper connection string"
  value       = aws_msk_cluster.main.zookeeper_connect_string
}

output "cluster_arn" {
  description = "ARN of the MSK cluster"
  value       = aws_msk_cluster.main.arn
}

output "scram_secret_arn" {
  description = "ARN of the SCRAM credentials secret in Secrets Manager"
  value       = module.scram_secret.secret_arn
}
